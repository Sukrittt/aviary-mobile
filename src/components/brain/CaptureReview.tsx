import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ChevronDown, TriangleAlert, X } from 'lucide-react-native'
import type { CaptureProposal, ProposalStatus } from '@/src/api/ai'
import { CategoryPickerSheet } from '@/src/components/shared/CategoryPickerSheet'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { Icon } from '@/src/components/shared/Icon'
import { useCurrency } from '@/src/context/CurrencyContext'
import {
  canLog,
  editedCount,
  keptRows,
  rowIncomplete,
  rowShare,
  rowToExpense,
  rowTotal,
  toRows,
  CAPTURE_ORIGIN,
  type CaptureRow,
  type RowOrigin,
} from '@/src/features/capture/captureRows'
import { useCategories } from '@/src/hooks/useCategories'
import { useAddExpense, useRecentExpenses } from '@/src/hooks/useExpenses'
import { track } from '@/src/lib/analytics'
import { todayLocal } from '@/src/lib/date'
import { categoryEmoji, splitEmoji } from '@/src/lib/emoji'
import { formatDateShort } from '@/src/lib/format'
import { unusualAmount } from '@/src/lib/unusualAmount'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/** Same beat as every other in-place success in the app (CLAUDE.md): let the check draw, then settle. */
const SUCCESS_MS = 1100

interface Props {
  proposal: CaptureProposal
  /**
   * Called once the user logged or dismissed the card, with the ids of the
   * expenses it became. The money brain records it on the chat so a reopened
   * chat shows it read-only; best effort, since client_ids already stop a
   * second log.
   */
  onSettled?: (status: Exclude<ProposalStatus, 'pending'>, expenseIds: string[]) => void
  /** Money-brain rows by default; a balance check's estimates log as `balance_gap`. */
  origin?: RowOrigin
  /** Show the "Logged 4 spends" pill once logged. Off where Ask Aviary's reply answers the log instead. */
  loggedSummary?: boolean
}

function secondsSince(startedAt: number): number {
  return Math.round((Date.now() - startedAt) / 1000)
}

/** Why Log is disabled, naming the one thing to fix when there's only one. Null when nothing blocks it. */
export function blockerHint(kept: CaptureRow[]): string | null {
  const fixes = kept.flatMap((row) => {
    const name = row.item.trim()
    const out: string[] = []
    if (!name) out.push('Name each spend')
    if (Number.isNaN(rowTotal(row))) out.push(name ? `Fix the amount for ${name}` : 'Fix the amounts')
    if (!row.category) out.push(name ? `Pick an envelope for ${name}` : 'Pick an envelope for each spend')
    return out
  })
  if (fixes.length === 0) return null
  return `${fixes.length === 1 ? fixes[0] : 'Fix the highlighted spends'} to log these.`
}

function spendsLabel(n: number): string {
  return `${n} ${n === 1 ? 'spend' : 'spends'}`
}

/**
 * The review card under a money-brain reply to "auto 240, lunch 150, turf
 * 1200 split 6", and under a balance check's estimates. Nothing is logged
 * until the user taps Log: rows can be renamed, re-priced, moved to another
 * envelope or removed first. Each row is logged through the normal
 * add-expense path (offline queue included) with a client_id fixed by the
 * proposal, so logging a card twice can't double it.
 */
export function CaptureReview({ proposal, onSettled, origin = CAPTURE_ORIGIN, loggedSummary = true }: Props) {
  const { tokens, space, radius, type } = useTheme()
  const { formatMoney, currencyPrefix } = useCurrency()
  const expensesQ = useRecentExpenses()
  const categoriesQ = useCategories()
  const addExpense = useAddExpense()

  const [status, setStatus] = useState<ProposalStatus>(proposal.status ?? 'pending')
  const [rows, setRows] = useState<CaptureRow[]>(() => toRows(proposal))
  const [phase, setPhase] = useState<'idle' | 'saving' | 'success'>('idle')
  const [error, setError] = useState('')
  const [pickingFor, setPickingFor] = useState<string | null>(null)
  // Rows already logged by an earlier attempt that partly failed. They leave the card, and a retry skips them.
  const [loggedRows, setLoggedRows] = useState<ReadonlySet<string>>(new Set())
  // Rows whose last attempt failed. They're locked to retry as they are: the server may have saved one
  // whose response was lost, and a retry reuses its client_id, so an edit would never reach that expense.
  const [failedRows, setFailedRows] = useState<ReadonlySet<string>>(new Set())
  const [summary, setSummary] = useState<{ count: number; total: number | null }>({
    // Offline-queued rows have no id yet, so an empty or missing list falls back to the row count.
    count: proposal.expenseIds?.length || proposal.items.length,
    total: null,
  })
  const expenseIds = useRef<string[]>([])
  const shownAt = useRef(0)
  const today = todayLocal()

  // Once the envelope list loads, a row whose envelope is gone (deleted since it was read) has none:
  // logging it would file the spend under a name that no longer exists.
  const known = categoriesQ.data ? new Set(categoriesQ.data.map((c) => c.name)) : null
  const open = rows
    .filter((r) => !loggedRows.has(r.id))
    .map((r) => (known && r.category && !known.has(r.category) ? { ...r, category: '' } : r))
  const kept = keptRows(open)
  const busy = phase !== 'idle'
  // Not before the envelope list is in (or has failed, offline): until then a deleted envelope looks valid.
  const ready = canLog(open) && (known !== null || categoriesQ.isError)
  const hint = blockerHint(kept)

  useEffect(() => {
    shownAt.current = Date.now()
  }, [])

  useEffect(() => {
    if (phase !== 'success') return
    const timer = setTimeout(() => setStatus('submitted'), SUCCESS_MS)
    return () => clearTimeout(timer)
  }, [phase])

  function update(id: string, patch: Partial<CaptureRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setError('')
  }

  async function submit() {
    if (!ready || busy) return
    setPhase('saving')
    setError('')
    const toLog = kept
    const done = new Set(loggedRows)
    const failedIds = new Set<string>()
    let failed = 0
    // One at a time, in the order they were said, so their timestamps keep that order in Activity.
    for (const row of toLog) {
      try {
        const result = await addExpense.mutateAsync(rowToExpense(proposal.id, row, formatMoney, origin))
        if (result.id) expenseIds.current.push(result.id)
        done.add(row.id)
      } catch {
        failed++
        failedIds.add(row.id)
      }
    }
    setFailedRows(failedIds)

    if (failed > 0) {
      // The rows that made it leave the card; the rest stay locked for a retry, which reuses their client_ids.
      // Only on a failure: when all of them made it, they stay put while the check draws.
      setLoggedRows(done)
      setError(`Couldn't log ${failed === toLog.length ? 'these' : spendsLabel(failed)}. Check your connection and try again.`)
      setPhase('idle')
      return
    }

    const loggedAll = rows.filter((r) => done.has(r.id))
    setSummary({ count: loggedAll.length, total: loggedAll.reduce((sum, r) => sum + rowShare(r), 0) })
    setPhase('success')
    track('capture_logged', {
      source: origin.source,
      rows: loggedAll.length,
      edited: editedCount(rows, proposal),
      removed: proposal.items.length - loggedAll.length,
      seconds: secondsSince(shownAt.current),
    })
    onSettled?.('submitted', expenseIds.current)
  }

  function dismiss() {
    if (busy) return
    track('capture_dismissed', { source: origin.source, rows: proposal.items.length, logged: loggedRows.size })
    if (loggedRows.size > 0) {
      // Some rows made it before a failure: the card is a record of those, not "Not logged".
      const logged = rows.filter((r) => loggedRows.has(r.id))
      setSummary({ count: logged.length, total: logged.reduce((sum, r) => sum + rowShare(r), 0) })
      setStatus('submitted')
      onSettled?.('submitted', expenseIds.current)
      return
    }
    setStatus('dismissed')
    onSettled?.('dismissed', [])
  }

  if (status !== 'pending') {
    if (status === 'submitted' && !loggedSummary) return null
    const text =
      status === 'submitted'
        ? `Logged ${spendsLabel(summary.count)}${summary.total !== null ? ` · ${formatMoney(summary.total)}` : ''}`
        : 'Not logged'
    return (
      <View
        testID="capture-summary"
        style={[styles.summary, { backgroundColor: status === 'submitted' ? tokens.mintSoft : tokens.inputBg, borderRadius: radius.full, paddingHorizontal: space.md }]}
      >
        <Text style={{ color: status === 'submitted' ? tokens.mint : tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>
          {text}
        </Text>
      </View>
    )
  }

  const picking = rows.find((r) => r.id === pickingFor)

  return (
    <View
      testID="capture-review"
      style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xs }]}
    >
      {kept.map((row, i) => {
        const total = rowTotal(row)
        const share = rowShare(row)
        const locked = failedRows.has(row.id)
        const unusual = !Number.isNaN(share) && row.category ? unusualAmount(share, row.category, expensesQ.data ?? [], today) : null
        // Names usually carry their emoji already ("🍜 Eating out"): show it once, as the icon.
        const { icon, text: envelope } = splitEmoji(row.category)
        const incomplete = rowIncomplete(row)
        return (
          <View
            key={row.id}
            testID={`capture-row-${row.id}`}
            style={[styles.row, { gap: space.sm, borderTopColor: tokens.border, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}
          >
            <View style={[styles.iconTile, { backgroundColor: incomplete ? tokens.warnSoft : tokens.inputBg, borderRadius: radius.md }]}>
              <Text style={styles.iconText}>{row.category ? icon || categoryEmoji(row.category) : '❔'}</Text>
            </View>

            <View style={[styles.main, { gap: 3 }]}>
              <TextInput
                value={row.item}
                onChangeText={(item) => update(row.id, { item })}
                editable={!busy && !locked}
                accessibilityLabel="What you paid for"
                placeholder="What was it?"
                placeholderTextColor={tokens.text3}
                style={[styles.itemInput, { color: row.item.trim() ? tokens.text : tokens.warn, fontFamily: fontFamily.bodyBold, fontSize: type.body }]}
              />
              <View style={[styles.meta, { gap: space.xs }]}>
                <Pressable
                  onPress={() => setPickingFor(row.id)}
                  disabled={busy || locked}
                  accessibilityLabel={row.category ? `Envelope: ${row.category}. Change it` : 'Pick an envelope'}
                  style={[styles.chip, { backgroundColor: row.category ? tokens.inputBg : tokens.warnSoft, borderRadius: radius.full }]}
                >
                  <Text
                    numberOfLines={1}
                    style={{ flexShrink: 1, color: row.category ? tokens.text2 : tokens.warnInk, fontFamily: row.category ? fontFamily.bodySemiBold : fontFamily.bodyBold, fontSize: type.caption }}
                  >
                    {row.category ? envelope : 'Pick an envelope'}
                  </Text>
                  <Icon icon={ChevronDown} size={13} color={row.category ? tokens.text3 : tokens.warnInk} />
                </Pressable>
                {row.splitWays > 1 && !Number.isNaN(total) && (
                  <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{`${formatMoney(total)} ÷ ${row.splitWays}`}</Text>
                )}
                {row.date !== today && (
                  <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{formatDateShort(row.date)}</Text>
                )}
              </View>
              {unusual && (
                <View style={[styles.meta, { gap: space.xs }]}>
                  <Icon icon={TriangleAlert} size={12} color={tokens.warn} />
                  <Text style={{ color: tokens.warnInk, fontFamily: fontFamily.bodyMedium, fontSize: type.caption, flex: 1 }}>
                    {`Way above your usual ${formatMoney(Math.round(unusual.typical))}. Double-check it.`}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.money}>
              <View style={styles.amountWrap}>
                <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{currencyPrefix}</Text>
                <TextInput
                  value={row.amountText}
                  onChangeText={(amountText) => update(row.id, { amountText: amountText.replace(/[^\d.]/g, '') })}
                  editable={!busy && !locked}
                  keyboardType="decimal-pad"
                  // 1 crore with paise: the server's cap, and all the field can show.
                  maxLength={11}
                  accessibilityLabel={`Amount for ${row.item || 'this spend'}`}
                  style={[styles.amountInput, { color: Number.isNaN(total) ? tokens.warn : tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }]}
                />
              </View>
              {row.splitWays > 1 && !Number.isNaN(share) && (
                <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: type.micro }}>{`your share ${formatMoney(share)}`}</Text>
              )}
            </View>

            <Pressable
              onPress={() => update(row.id, { removed: true })}
              disabled={busy || locked}
              hitSlop={10}
              accessibilityLabel={`Remove ${row.item || 'this spend'}`}
              style={styles.remove}
            >
              <Icon icon={X} size={16} color={tokens.text3} />
            </Pressable>
          </View>
        )
      })}

      {hint && phase === 'idle' && (
        <Text style={{ color: tokens.warnInk, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{hint}</Text>
      )}

      {error !== '' && (
        <Text style={{ color: tokens.coral, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{error}</Text>
      )}

      <View style={[styles.actions, { gap: space.sm }]}>
        <Pressable onPress={dismiss} disabled={busy} hitSlop={8} style={styles.secondary}>
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>Not now</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={!ready || busy}
          accessibilityLabel={kept.length ? `Log ${spendsLabel(kept.length)}` : 'Nothing to log'}
          style={[
            styles.primary,
            {
              backgroundColor: phase === 'success' ? tokens.mint : tokens.accent,
              borderRadius: radius.full,
              opacity: !ready && phase === 'idle' ? 0.5 : 1,
            },
          ]}
        >
          {phase === 'success' ? (
            <CheckIcon color={tokens.onAccent} />
          ) : (
            <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>
              {phase === 'saving' ? 'Logging…' : kept.length ? `Log ${spendsLabel(kept.length)}` : 'Nothing to log'}
            </Text>
          )}
        </Pressable>
      </View>

      <CategoryPickerSheet
        visible={picking !== undefined}
        onClose={() => setPickingFor(null)}
        value={picking?.category ?? ''}
        onSelect={(category) => {
          if (picking) update(picking.id, { category })
          setPickingFor(null)
        }}
        title="Envelope"
        noneLabel="No envelope"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  iconTile: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 16 },
  main: { flex: 1, minWidth: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  itemInput: { paddingVertical: 0, paddingHorizontal: 0 },
  money: { alignItems: 'flex-end' },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  amountInput: { minWidth: 12, maxWidth: 110, paddingVertical: 0, paddingHorizontal: 0, textAlign: 'right' },
  remove: { paddingTop: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', maxWidth: '100%', paddingLeft: 8, paddingRight: 6, paddingVertical: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  secondary: { paddingHorizontal: 12, paddingVertical: 8 },
  primary: { minWidth: 120, height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  summary: { alignSelf: 'flex-start', paddingVertical: 8 },
})
