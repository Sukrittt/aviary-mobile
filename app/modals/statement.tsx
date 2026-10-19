import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { CaretDown, CheckCircle, Circle, FileText, ImageSquare, X } from '@/src/components/shared/icons'
import { CategoryPickerSheet } from '@/src/components/shared/CategoryPickerSheet'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { Icon } from '@/src/components/shared/Icon'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useAddExpense } from '@/src/hooks/useExpenses'
import { readStatement, StatementFailure, type StatementItem, type StatementProposal } from '@/src/api/statement'
import { creditsLine, statementExpense } from '@/src/features/fill-gap/gap'
import { downscaleImage } from '@/src/lib/downscaleImage'
import { canPickFiles, pickFile } from '@/src/lib/filePicker'
import { formatDateShort } from '@/src/lib/format'
import { splitEmoji } from '@/src/lib/emoji'
import { track } from '@/src/lib/analytics'
import { tap } from '@/src/lib/haptics'
import { useOnline } from '@/src/lib/netStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const MAX_SCREENSHOTS = 5
/** Five screenshots have to fit one request, so each goes smaller than a single bill scan. Same as Web. */
const SCREENSHOT_ENCODING = { maxEdge: 1600, quality: 0.6 }
const MAX_FILE_BYTES = 4 * 1024 * 1024
const STATEMENT_FILE = /\.(csv|tsv|txt|xlsx|pdf)$/i
const UNREADABLE = "Couldn't read that one. Try a CSV or Excel statement, or a screenshot of your payments."
const SKIP_LABEL = { logged: 'Looks logged already', before_last: 'Before your last log' } as const
/** Same beat as every other in-place success (CLAUDE.md). */
const SUCCESS_MS = 1100

type RowState = { checked: boolean; category: string }

/**
 * "Add from statement or screenshot", from log-expense's More sheet and the
 * catch-up sheet on Home. The days you didn't log, read from your own UPI or
 * bank history: up to five screenshots, or a csv, xlsx or unlocked pdf. Same
 * propose-then-confirm as chat capture. Rows that look logged already, or are
 * older than your last log, start unticked; credits are only counted. Each
 * row logs through the normal add-expense path with a hashed client_id, so
 * the same file twice adds nothing. Twin of Web's StatementModal.
 */
export default function StatementScreen() {
  const { tokens, space, radius, type } = useTheme()
  const { formatMoney } = useCurrency()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const addExpense = useAddExpense()
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review'>('pick')
  const [proposal, setProposal] = useState<StatementProposal | null>(null)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'success'>('idle')
  const [pickingFor, setPickingFor] = useState<string | null>(null)
  const logged = useRef(new Set<string>())
  const online = useOnline()

  // Cleared on unmount, so a screen already dismissed during the tick can't pop the one underneath.
  useEffect(() => {
    if (saving !== 'success') return
    const timer = setTimeout(() => router.back(), SUCCESS_MS)
    return () => clearTimeout(timer)
  }, [saving, router])

  async function read(input: Parameters<typeof readStatement>[0], kind: 'screenshots' | 'file') {
    setError('')
    setPhase('reading')
    try {
      const result = await readStatement(input)
      if (result.items.length === 0) throw new StatementFailure(result.credits ? "Only money coming in there, so there's nothing to add." : UNREADABLE)
      setProposal(result)
      setRows(Object.fromEntries(result.items.map((i) => [i.id, { checked: !i.suggestSkip, category: i.category }])))
      setPhase('review')
      track('statement_read', { kind, rows: result.items.length, credits: result.credits })
    } catch (err) {
      setError(err instanceof StatementFailure ? err.message : UNREADABLE)
      setPhase('pick')
    }
  }

  async function pickScreenshots() {
    if (!online) return
    tap()
    try {
      await chooseScreenshots()
    } catch {
      setError("Couldn't open that. Try again.")
    }
  }

  async function chooseScreenshots() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo access is off. You can turn it on in Settings.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_SCREENSHOTS,
      quality: 0.5,
      base64: true,
    })
    if (result.canceled || !result.assets?.length) return
    if (result.assets.length > MAX_SCREENSHOTS) {
      setError(`Up to ${MAX_SCREENSHOTS} screenshots at a time. Pick the ones that cover the days you missed.`)
      return
    }
    const images = []
    for (const asset of result.assets) {
      if (!asset.base64) continue
      const small = await downscaleImage(asset, SCREENSHOT_ENCODING)
      images.push(small ? { data: small.base64, mimeType: small.mimeType } : { data: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' })
    }
    if (images.length === 0) return setError("Couldn't read those screenshots. Try others.")
    void read({ images }, 'screenshots')
  }

  async function pickStatement() {
    if (!online) return
    tap()
    let file
    try {
      file = await pickFile()
    } catch {
      return setError("Couldn't open that. Try again.")
    }
    if (!file) return
    if (!STATEMENT_FILE.test(file.name)) return setError('Pick a CSV, Excel or PDF statement.')
    if ((file.size ?? 0) > MAX_FILE_BYTES) return setError("That's too big to upload. Try a shorter date range.")
    void read({ file }, 'file')
  }

  async function log() {
    if (!proposal) return
    const toLog = proposal.items.filter((i) => rows[i.id].checked)
    tap()
    setSaving('saving')
    setError('')
    let failed = 0
    // One at a time, oldest first, so Activity keeps the statement's order.
    for (const item of toLog) {
      if (logged.current.has(item.id)) continue
      try {
        await addExpense.mutateAsync(statementExpense(item, rows[item.id].category))
        logged.current.add(item.id)
      } catch {
        failed++
      }
    }
    if (failed > 0) {
      setSaving('idle')
      setError(`Couldn't log ${failed === toLog.length ? 'these' : failed}. Check your connection and try again.`)
      return
    }
    track('statement_logged', { rows: toLog.length, unchecked: proposal.items.length - toLog.length })
    setSaving('success')
  }

  const busy = saving !== 'idle'
  const items = proposal?.items ?? []
  const checked = items.filter((i) => rows[i.id]?.checked)
  const missing = checked.some((i) => !rows[i.id].category)
  const total = checked.reduce((sum, i) => sum + i.amount, 0)
  const credits = proposal ? creditsLine(proposal.credits) : null
  const picking = items.find((i) => i.id === pickingFor)
  const caption = { color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, gap: space.md, borderBottomColor: tokens.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          disabled={busy}
          hitSlop={12}
          style={[styles.headerBtn, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.full }]}
        >
          <X size={16} color={tokens.text} />
        </Pressable>
        <Text style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>
          {phase === 'review' ? 'Check these, then log' : 'Add from statement or screenshot'}
        </Text>
      </View>

      {phase === 'pick' && (
        <View style={{ padding: space.lg, gap: space.md }}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title }}>Fill in the days you missed</Text>
          <Text style={caption}>Your UPI or bank app already has them. We&apos;ll read the payments, you pick what to add. Nothing&apos;s logged until you say so.</Text>
          {!online && <Text style={{ ...caption, color: tokens.warnInk }}>You&apos;re offline. Uploads need a connection.</Text>}
          <PickButton icon={ImageSquare} label="Choose screenshots" hint="Up to 5 from your UPI or bank app" onPress={pickScreenshots} disabled={!online} />
          {canPickFiles && <PickButton icon={FileText} label="Choose a statement" hint="CSV, Excel or PDF from net banking" onPress={pickStatement} disabled={!online} />}
          {error !== '' && <Text accessibilityRole="alert" style={{ color: tokens.coral, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{error}</Text>}
        </View>
      )}

      {phase === 'reading' && (
        <View style={[styles.center, { gap: space.md }]}>
          <ActivityIndicator color={tokens.accentInk} />
          <LoadingCaption phrases={['Reading your payments…', 'Matching payees to categories…', 'Checking what you already logged…', 'Almost done…']} />
        </View>
      )}

      {phase === 'review' && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
            {items.map((item, i) => (
              <ReviewRow
                key={item.id}
                item={item}
                row={rows[item.id]}
                first={i === 0}
                busy={busy}
                onToggle={() => setRows((prev) => ({ ...prev, [item.id]: { ...prev[item.id], checked: !prev[item.id].checked } }))}
                onPickCategory={() => setPickingFor(item.id)}
              />
            ))}
          </ScrollView>
          <View style={[styles.footer, { padding: space.lg, paddingBottom: insets.bottom + space.md, gap: space.sm, borderTopColor: tokens.border }]}>
            {credits && <Text style={caption}>{credits}</Text>}
            {missing && <Text style={{ ...caption, color: tokens.warnInk }}>Pick a category for the ticked rows to log them.</Text>}
            {error !== '' && <Text accessibilityRole="alert" style={{ ...caption, color: tokens.coral }}>{error}</Text>}
            <Pressable
              accessibilityRole="button"
              onPress={log}
              disabled={busy || checked.length === 0 || missing}
              style={[
                styles.primary,
                {
                  backgroundColor: saving === 'success' ? tokens.successBg : tokens.accent,
                  borderRadius: radius.full,
                  opacity: saving === 'saving' || (saving === 'idle' && (checked.length === 0 || missing)) ? 0.5 : 1,
                },
              ]}
            >
              {saving === 'success' ? (
                <CheckIcon color={tokens.onSuccess} />
              ) : (
                <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>
                  {saving === 'saving' ? 'Logging…' : checked.length ? `Log ${checked.length} · ${formatMoney(total)}` : 'Tick what to add'}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}

      <CategoryPickerSheet
        visible={picking !== undefined}
        onClose={() => setPickingFor(null)}
        value={picking ? rows[picking.id].category : ''}
        onSelect={(category) => {
          if (picking) setRows((prev) => ({ ...prev, [picking.id]: { ...prev[picking.id], category } }))
          setPickingFor(null)
        }}
        title="Category"
        noneLabel="No category"
      />
    </View>
  )
}

function PickButton({ icon, label, hint, onPress, disabled }: { icon: typeof ImageSquare; label: string; hint: string; onPress: () => void; disabled?: boolean }) {
  const { tokens, space, radius, type } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.pick, { gap: space.md, padding: space.md, backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, opacity: disabled ? 0.5 : 1 }]}
    >
      <Icon icon={icon} size={20} color={tokens.accentInk} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{label}</Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{hint}</Text>
      </View>
    </Pressable>
  )
}

function ReviewRow({ item, row, first, busy, onToggle, onPickCategory }: {
  item: StatementItem
  row: RowState
  first: boolean
  busy: boolean
  onToggle: () => void
  onPickCategory: () => void
}) {
  const { tokens, space, radius, type } = useTheme()
  const { formatMoney } = useCurrency()
  const dim = !row.checked
  return (
    <View style={[styles.row, { gap: space.sm, borderTopColor: tokens.border, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: row.checked }}
        accessibilityLabel={`Add ${item.item}, ${formatMoney(item.amount)}`}
        onPress={onToggle}
        disabled={busy}
        hitSlop={10}
      >
        <Icon icon={row.checked ? CheckCircle : Circle} size={22} color={row.checked ? tokens.accentInk : tokens.text3} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: dim ? tokens.text3 : tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{item.item}</Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.micro }}>
          {formatDateShort(item.date)}
          {item.suggestSkip ? ` · ${SKIP_LABEL[item.suggestSkip]}` : ''}
        </Text>
        <Pressable
          onPress={onPickCategory}
          disabled={busy}
          accessibilityLabel={row.category ? `Category: ${row.category}. Change it` : `Pick a category for ${item.item}`}
          style={[styles.chip, { backgroundColor: row.category || dim ? tokens.inputBg : tokens.warnSoft, borderRadius: radius.full }]}
        >
          <Text numberOfLines={1} style={{ flexShrink: 1, color: row.category || dim ? tokens.text2 : tokens.warnInk, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
            {row.category ? splitEmoji(row.category).text : 'Pick a category'}
          </Text>
          <Icon icon={CaretDown} size={12} color={tokens.text3} />
        </Pressable>
      </View>
      <Text style={{ color: dim ? tokens.text3 : tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{formatMoney(item.amount)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pick: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', maxWidth: '100%', paddingLeft: 8, paddingRight: 6, paddingVertical: 2 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
  primary: { height: 48, alignItems: 'center', justifyContent: 'center' },
})
