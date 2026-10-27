import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useCurrency } from '@/src/context/CurrencyContext'
import { Chip } from '@/src/components/ui/Chip'
import { Icon } from '@/src/components/shared/Icon'
import { CaretLeft, CaretRight } from '@/src/components/shared/icons'
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
export function GoalByFields({ draft, onChange }: { draft: GoalDraft; onChange: (d: GoalDraft) => void }) {
  const { tokens } = useTheme()
  const thisMonth = currentMonthKey()
  const over = !!draft.by && !draft.yearly && draft.by < thisMonth
  const back = () => onChange({ ...draft, by: draft.by > thisMonth ? shiftMonthKey(draft.by, -1) : '' })
  const forward = () => onChange({ ...draft, by: draft.by ? shiftMonthKey(draft.by, 1) : thisMonth })
  return (
    <>
      <Text style={[styles.label, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>BY</Text>
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
 * The row's one line under a goal's bar, with its actions as pills at the end:
 * Set pulls what a behind goal is short this month; a done one can repeat or
 * go back to spending. Nothing changes without the tap; without onPull it's
 * the plain line.
 */
export function GoalLine({ category, goal, progress, month, money, onPull }: {
  category: string
  goal: CategoryGoal
  progress: GoalProgress
  month: string
  money: (n: number) => string
  /** Opens Pull money into this category for what it's behind by. Omitted: no actions (read-only). */
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
  if (onPull && progress.status === 'behind' && progress.behindBy) {
    const short = progress.behindBy
    actions.push(pill('Set', { color: tokens.pillLow, bg: tokens.pillLowBg }, () => onPull(category, short)))
  } else if (onPull && done) {
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
  hint: { fontSize: 12, marginTop: 6 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10 },
  // Wraps rather than spilling into the Left column when the pills don't fit (big text, narrow phone).
  lineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  line: { flexShrink: 1, fontSize: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 12 },
})
