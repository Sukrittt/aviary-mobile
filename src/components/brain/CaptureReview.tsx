import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { TriangleAlert, X } from 'lucide-react-native'
import { updateProposalStatus, type CaptureProposal, type ProposalStatus } from '@/src/api/ai'
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
  type CaptureRow,
} from '@/src/features/capture/captureRows'
import { useAddExpense, useRecentExpenses } from '@/src/hooks/useExpenses'
import { track } from '@/src/lib/analytics'
import { todayLocal } from '@/src/lib/date'
import { categoryEmoji } from '@/src/lib/emoji'
import { formatDateShort } from '@/src/lib/format'
import { unusualAmount } from '@/src/lib/unusualAmount'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/** Same beat as every other in-place success in the app (CLAUDE.md): let the check draw, then settle. */
const SUCCESS_MS = 1100

interface Props {
  proposal: CaptureProposal
  /** The chat the proposal belongs to, for recording what became of it. Null for the stateless demo. */
  sessionId: string | null
}

function secondsSince(startedAt: number): number {
  return Math.round((Date.now() - startedAt) / 1000)
}

function spendsLabel(n: number): string {
  return `${n} ${n === 1 ? 'spend' : 'spends'}`
}

/**
 * The review card under a money-brain reply to "auto 240, lunch 150, turf
 * 1200 split 6". Nothing is logged until the user taps Log: rows can be
 * renamed, re-priced, moved to another envelope or removed first. Each row is
 * logged through the normal add-expense path (offline queue included) with a
 * client_id fixed by the proposal, so logging a card twice can't double it.
 */
export function CaptureReview({ proposal, sessionId }: Props) {
  const { tokens, space, radius, type } = useTheme()
  const { formatMoney, currencyPrefix } = useCurrency()
  const expensesQ = useRecentExpenses()
  const addExpense = useAddExpense()

  const [status, setStatus] = useState<ProposalStatus>(proposal.status ?? 'pending')
  const [rows, setRows] = useState<CaptureRow[]>(() => toRows(proposal))
  const [phase, setPhase] = useState<'idle' | 'saving' | 'success'>('idle')
  const [error, setError] = useState('')
  const [pickingFor, setPickingFor] = useState<string | null>(null)
  // Rows already logged by an earlier attempt that partly failed. They leave the card, and a retry skips them.
  const [loggedRows, setLoggedRows] = useState<ReadonlySet<string>>(new Set())
  const [summary, setSummary] = useState<{ count: number; total: number | null }>({
    // Offline-queued rows have no id yet, so an empty or missing list falls back to the row count.
    count: proposal.expenseIds?.length || proposal.items.length,
    total: null,
  })
  const expenseIds = useRef<string[]>([])
  const shownAt = useRef(0)
  const today = todayLocal()

  const open = rows.filter((r) => !loggedRows.has(r.id))
  const kept = keptRows(open)
  const busy = phase !== 'idle'
  const ready = canLog(open)

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
    let failed = 0
    // One at a time, in the order they were said, so their timestamps keep that order in Activity.
    for (const row of toLog) {
      try {
        const result = await addExpense.mutateAsync(rowToExpense(proposal.id, row, formatMoney))
        if (result.id) expenseIds.current.push(result.id)
        done.add(row.id)
      } catch {
        failed++
      }
    }
    setLoggedRows(done)

    if (failed > 0) {
      // The rows that made it leave the card; the rest stay editable. A retry reuses their client_ids.
      setError(`Couldn't log ${failed === toLog.length ? 'these' : spendsLabel(failed)}. Check your connection and try again.`)
      setPhase('idle')
      return
    }

    const loggedAll = rows.filter((r) => done.has(r.id))
    setSummary({ count: loggedAll.length, total: loggedAll.reduce((sum, r) => sum + rowShare(r), 0) })
    setPhase('success')
    track('capture_logged', {
      rows: loggedAll.length,
      edited: editedCount(rows, proposal),
      removed: proposal.items.length - loggedAll.length,
      seconds: secondsSince(shownAt.current),
    })
    if (sessionId) updateProposalStatus(sessionId, proposal.id, 'submitted', expenseIds.current).catch(() => {})
  }

  function dismiss() {
    if (busy) return
    setStatus('dismissed')
    track('capture_dismissed', { rows: proposal.items.length })
    if (sessionId) updateProposalStatus(sessionId, proposal.id, 'dismissed').catch(() => {})
  }

  if (status !== 'pending') {
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
      style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, padding: space.md, gap: space.sm }]}
    >
      {kept.map((row) => {
        const total = rowTotal(row)
        const share = rowShare(row)
        const unusual = !Number.isNaN(share) && row.category ? unusualAmount(share, row.category, expensesQ.data ?? [], today) : null
        return (
          <View
            key={row.id}
            testID={`capture-row-${row.id}`}
            style={[
              styles.row,
              { backgroundColor: tokens.inputBg, borderColor: rowIncomplete(row) ? tokens.warn : tokens.border, borderRadius: radius.md, padding: space.sm, gap: space.xs },
            ]}
          >
            <View style={[styles.rowTop, { gap: space.sm }]}>
              <TextInput
                value={row.item}
                onChangeText={(item) => update(row.id, { item })}
                editable={!busy}
                accessibilityLabel="What you paid for"
                placeholder="What was it?"
                placeholderTextColor={tokens.text3}
                style={[styles.itemInput, { color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }]}
              />
              <View style={styles.amountWrap}>
                <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{currencyPrefix}</Text>
                <TextInput
                  value={row.amountText}
                  onChangeText={(amountText) => update(row.id, { amountText: amountText.replace(/[^\d.]/g, '') })}
                  editable={!busy}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Amount for ${row.item || 'this spend'}`}
                  style={[styles.amountInput, { color: Number.isNaN(total) ? tokens.warn : tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }]}
                />
              </View>
              <Pressable
                onPress={() => update(row.id, { removed: true })}
                disabled={busy}
                hitSlop={8}
                accessibilityLabel={`Remove ${row.item || 'this spend'}`}
              >
                <Icon icon={X} size={16} color={tokens.text3} />
              </Pressable>
            </View>

            <View style={[styles.rowBottom, { gap: space.sm }]}>
              <Pressable
                onPress={() => setPickingFor(row.id)}
                disabled={busy}
                accessibilityLabel={row.category ? `Envelope: ${row.category}. Change it` : 'Pick an envelope'}
                style={[styles.chip, { backgroundColor: row.category ? tokens.pillBg : tokens.warnSoft, borderRadius: radius.full }]}
              >
                <Text style={{ color: row.category ? tokens.text2 : tokens.warnInk, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>
                  {row.category ? `${categoryEmoji(row.category)} ${row.category}` : 'Pick an envelope'}
                </Text>
              </Pressable>
              {row.date !== today && (
                <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{formatDateShort(row.date)}</Text>
              )}
              {row.splitWays > 1 && !Number.isNaN(total) && (
                <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>
                  {`${formatMoney(total)} ÷ ${row.splitWays} = ${formatMoney(share)}`}
                </Text>
              )}
            </View>

            {unusual && (
              <View style={[styles.rowBottom, { gap: space.xs }]}>
                <Icon icon={TriangleAlert} size={13} color={tokens.warn} />
                <Text style={{ color: tokens.warnInk, fontFamily: fontFamily.bodyMedium, fontSize: type.caption, flex: 1 }}>
                  {`Way above your usual ${formatMoney(Math.round(unusual.typical))}. Double-check it.`}
                </Text>
              </View>
            )}
          </View>
        )
      })}

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
  row: { borderWidth: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  itemInput: { flex: 1, paddingVertical: 4 },
  amountWrap: { flexDirection: 'row', alignItems: 'center' },
  amountInput: { minWidth: 56, paddingVertical: 4, textAlign: 'right' },
  chip: { paddingHorizontal: 10, paddingVertical: 5 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  secondary: { paddingHorizontal: 12, paddingVertical: 10 },
  primary: { minWidth: 140, height: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  summary: { alignSelf: 'flex-start', paddingVertical: 8 },
})
