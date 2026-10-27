import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useCurrency } from '@/src/context/CurrencyContext'
import { Chip } from '@/src/components/ui/Chip'
import { Icon } from '@/src/components/shared/Icon'
import { CalendarBlank, CaretLeft, CaretRight } from '@/src/components/shared/icons'
import { BottomSheet } from '@/src/components/shared/Modal'
import { Wheel } from '@/src/components/ui/Wheel'
import { currentMonthKey, monthAbbrev, shiftMonthKey } from '@/src/lib/envelope'
import { nextGoalMonth, shortMonth, type GoalProgress } from '@/src/lib/goal'
import { useUpdateCategory } from '@/src/hooks/useCategories'
import type { CategoryGoal } from '@/src/types'

/** A goal as typed: the amount as text, no deadline as ''. Web's GoalSheet.tsx twin. */
export interface GoalDraft {
  amount: string
  by: string
  yearly: boolean
}

export const draftOf = (goal?: CategoryGoal): GoalDraft => ({ amount: goal ? String(goal.amount) : '', by: goal?.by ?? '', yearly: goal?.repeat === 'yearly' })

/** The goal a draft describes, or null while it has no amount or it's a one-off whose month is over. A yearly one just rolls on. */
export function goalOf(d: GoalDraft): CategoryGoal | null {
  const amount = Number(d.amount)
  if (!(amount > 0) || (d.by && !d.yearly && d.by < currentMonthKey())) return null
  return { amount, ...(d.by ? { by: d.by } : {}), ...(d.by && d.yearly ? { repeat: 'yearly' as const } : {}) }
}

export const GOAL_SAVE_FAILED = "Couldn't save. Check your connection and try again."

/** Target, optional month, and once or every year, for the Categories sheets (their name field already has the keyboard up). */
export function GoalFields({ draft, onChange, autoFocus }: { draft: GoalDraft; onChange: (d: GoalDraft) => void; autoFocus?: boolean }) {
  const { tokens } = useTheme()
  const { currencySymbol } = useCurrency()
  return (
    <>
      <Text style={[styles.label, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>TARGET</Text>
      <View style={[styles.amount, { backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong }]}>
        <Text style={[styles.symbol, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>{currencySymbol}</Text>
        <TextInput
          style={[styles.amountInput, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}
          value={draft.amount}
          onChangeText={(amount) => { if (/^\d{0,9}(\.\d{0,2})?$/.test(amount)) onChange({ ...draft, amount }) }}
          placeholder="0"
          placeholderTextColor={tokens.text3}
          keyboardType="decimal-pad"
          accessibilityLabel="Goal amount"
          autoFocus={autoFocus}
        />
      </View>
      <GoalByFields draft={draft} onChange={onChange} />
    </>
  )
}

/** The deadline half: a month stepper (No date sits just before this month) and once or every year. */
export function GoalByFields({ draft, onChange, compact }: { draft: GoalDraft; onChange: (d: GoalDraft) => void; compact?: boolean }) {
  const { tokens } = useTheme()
  const thisMonth = currentMonthKey()
  const over = !!draft.by && !draft.yearly && draft.by < thisMonth
  const back = () => onChange({ ...draft, by: draft.by > thisMonth ? shiftMonthKey(draft.by, -1) : '' })
  const forward = () => onChange({ ...draft, by: draft.by ? shiftMonthKey(draft.by, 1) : thisMonth })
  const [picking, setPicking] = useState(false)
  const stepper = (
      <View style={[styles.stepper, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
        <Pressable onPress={back} disabled={!draft.by} hitSlop={8} accessibilityRole="button" accessibilityLabel="Earlier month" style={{ opacity: draft.by ? 1 : 0.3 }}>
          <Icon icon={CaretLeft} size={16} color={tokens.text2} />
        </Pressable>
        <Text style={[styles.month, { color: draft.by ? tokens.text : tokens.text3, fontFamily: fontFamily.bodyBold }]}>
          {draft.by ? shortMonth(draft.by) : 'No date'}
        </Text>
        <Pressable onPress={forward} hitSlop={8} accessibilityRole="button" accessibilityLabel="Later month">
          <Icon icon={CaretRight} size={16} color={tokens.text2} />
        </Pressable>
      </View>
  )
  // One row under the goal screen's amount: the month (a tap opens the wheels), and a repeat toggle once there is one.
  if (compact) {
    return (
      <>
        <View style={styles.compactRow}>
          {/* Log expense's date chips: soft red once a month's picked, neutral while it asks. Bounce and tick from Chip. */}
          <Chip
            soft
            selected={!!draft.by}
            icon={(color) => <Icon icon={CalendarBlank} size={14} color={color} />}
            label={draft.by ? shortMonth(draft.by) : 'Pick a month'}
            onPress={() => setPicking(true)}
          />
          {!!draft.by && <Chip soft label="Every year" selected={draft.yearly} onPress={() => onChange({ ...draft, yearly: !draft.yearly })} />}
        </View>
        {over && <Text style={[styles.hint, { color: tokens.coral, fontFamily: fontFamily.bodyMedium, textAlign: 'center' }]}>{"That month's over. Pick this one or later."}</Text>}
        <MonthPickerSheet visible={picking} value={draft.by} onClose={() => setPicking(false)} onPick={(by) => { setPicking(false); onChange({ ...draft, by }) }} />
      </>
    )
  }
  return (
    <>
      <Text style={[styles.label, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>BY</Text>
      {stepper}
      <Text style={[styles.hint, { color: over ? tokens.coral : tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
        {over ? "That month's over. Pick this one or later." : draft.by ? 'Need it again next year? Repeat it.' : 'No date means you save at your own pace.'}
      </Text>
      {!!draft.by && (
        <View style={styles.chips}>
          <Chip label="Just once" selected={!draft.yearly} onPress={() => onChange({ ...draft, yearly: false })} />
          <Chip label="Every year" selected={draft.yearly} onPress={() => onChange({ ...draft, yearly: true })} />
        </View>
      )}
    </>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const YEARS_AHEAD = 30

/** A month and year on two wheels, like Apple's. A month that's already over springs back to this one. '' is No date. */
function MonthPickerSheet({ visible, value, onClose, onPick }: { visible: boolean; value: string; onClose: () => void; onPick: (by: string) => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Mounted per open, so the wheels start on the goal's month every time. */}
      {visible && <MonthWheels value={value} onPick={onPick} />}
    </BottomSheet>
  )
}

function MonthWheels({ value, onPick }: { value: string; onPick: (by: string) => void }) {
  const { tokens } = useTheme()
  const thisMonth = currentMonthKey()
  const thisYear = Number(thisMonth.slice(0, 4))
  const start = value && value >= thisMonth ? value : thisMonth
  const [year, setYear] = useState(Number(start.slice(0, 4)))
  const [month, setMonth] = useState(Number(start.slice(5, 7)) - 1)
  const years = useMemo(() => Array.from({ length: YEARS_AHEAD + 1 }, (_, i) => String(thisYear + i)), [thisYear])
  const keyOf = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`

  // Lands on a month that's over (this year, earlier month): back to this month, like Apple's grayed-out rows.
  function set(y: number, m: number) {
    const clamped = keyOf(y, m) < thisMonth ? thisMonth : keyOf(y, m)
    setYear(Number(clamped.slice(0, 4)))
    setMonth(Number(clamped.slice(5, 7)) - 1)
  }

  const action = (label: string, primary: boolean, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.sheetBtn, { backgroundColor: primary ? tokens.accent : tokens.inputBg }]}>
      <Text style={{ color: primary ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodyBold, fontSize: 15 }}>{label}</Text>
    </Pressable>
  )
  return (
    <>
      <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Save it by</Text>
      <View style={styles.wheels}>
        <Wheel loop items={MONTHS} index={month} onChange={(m) => set(year, m)} accessibilityLabel="Month" />
        <Wheel items={years} index={year - thisYear} onChange={(i) => set(thisYear + i, month)} accessibilityLabel="Year" />
      </View>
      <View style={styles.sheetActions}>
        {action('No date', false, () => onPick(''))}
        {action('Done', true, () => onPick(keyOf(year, month)))}
      </View>
    </>
  )
}

/**
 * Web's goalLine, cut to fit one line on a phone: the deadline's month and
 * year stay, "to make it by" goes. Web's line also wraps; this one can't.
 */
export function shortGoalLine(p: GoalProgress, money: (n: number) => string): string {
  switch (p.status) {
    case 'funded': return 'Funded'
    case 'done': return 'Done'
    case 'onTrack':
      if (p.nextNeed === undefined || !p.nextMonth || !p.by) return 'On track'
      return p.nextMonth === p.by ? `On track · ${money(p.nextNeed)} more in ${monthAbbrev(p.by)}` : `On track · ${money(p.nextNeed)}/mo from ${monthAbbrev(p.nextMonth)}`
    case 'behind': return p.by && p.monthlyNeed !== undefined ? `Behind · ${money(p.monthlyNeed)}/mo by ${shortMonth(p.by)}` : 'Behind'
    case 'saving': return p.paceMonth ? `At this pace, by ${shortMonth(p.paceMonth)}` : 'Assign monthly to see when'
  }
}

/**
 * The row's one line under a goal's bar. A done goal gets Repeat and Back to
 * spending as pills at the end; a behind goal's Set lives in the row's money
 * column (EnvelopeRow). Without onPull it's the plain line.
 */
export function GoalLine({ category, goal, progress, month, money, onPull }: {
  category: string
  goal: CategoryGoal
  progress: GoalProgress
  month: string
  money: (n: number) => string
  /** Present where the goal can be changed. Omitted: no actions (read-only). */
  onPull?: (category: string, amount: number) => void
}) {
  const { tokens } = useTheme()
  const update = useUpdateCategory()
  const [busy, setBusy] = useState<'repeat' | 'remove' | null>(null)
  const [error, setError] = useState('')

  async function run(key: NonNullable<typeof busy>, value: CategoryGoal | null) {
    if (busy) return
    setBusy(key)
    setError('')
    try {
      await update.mutateAsync({ name: category, updates: { goal: value } })
    } catch {
      setError(GOAL_SAVE_FAILED)
    } finally {
      setBusy(null)
    }
  }
  const pill = (label: string, tone: { color: string; bg: string }, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} disabled={!!busy} hitSlop={10} accessibilityRole="button"
      style={[styles.pill, { backgroundColor: tone.bg, opacity: busy ? 0.6 : 1 }]}>
      <Text style={[styles.pillText, { color: tone.color, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>
    </Pressable>
  )

  const done = progress.status === 'done'
  const actions: ReactNode[] = []
  if (onPull && done) {
    const neutral = { color: tokens.text, bg: tokens.inputBg }
    if (goal.by) actions.push(pill(busy === 'repeat' ? 'Saving…' : 'Repeat', neutral, () => void run('repeat', { ...goal, by: nextGoalMonth(progress.by ?? goal.by!, month) })))
    actions.push(pill(busy === 'remove' ? 'Saving…' : 'Back to spending', neutral, () => void run('remove', null)))
  }
  const color = progress.status === 'behind' ? tokens.pillLow : progress.status === 'funded' || done ? tokens.pillGood : tokens.text3
  return (
    <>
      <View style={styles.lineRow}>
        <Text style={[styles.line, { color, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>
          {shortGoalLine(progress, money)}
        </Text>
        {actions}
      </View>
      {!!error && <Text style={[styles.line, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>{error}</Text>}
    </>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 12, letterSpacing: 0.8, marginTop: 18, marginBottom: 8 },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16 },
  symbol: { fontSize: 15 },
  amountInput: { flex: 1, paddingVertical: 14, fontSize: 15 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  month: { fontSize: 14 },
  sheetTitle: { fontSize: 16, marginBottom: 12 },
  wheels: { flexDirection: 'row', gap: 8 },
  sheetActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  sheetBtn: { flex: 1, paddingVertical: 14, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  compactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  hint: { fontSize: 12, marginTop: 6 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10 },
  // Wraps rather than spilling into the Left column when the pills don't fit (big text, narrow phone).
  lineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  line: { flexShrink: 1, fontSize: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 12 },
})
