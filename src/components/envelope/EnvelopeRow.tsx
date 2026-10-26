import { useCategoryTint } from '@/src/hooks/useCategories'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useCallback, useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { splitEmoji } from '@/src/lib/emoji'
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/shared/CategoryIcon'
import type { CategoryIconKey } from '@/src/lib/categoryIcons'
import { parseLocalDate, toLocalDateString } from '@/src/lib/date'
import { ProgressBar } from './ProgressBar'
import { BottomSheet } from '@/src/components/shared/Modal'
import { tap } from '@/src/lib/haptics'
import type { Envelope } from '@/src/lib/envelope'
import type { ThemeTokens } from '@/src/theme/tokens'
import { RollingAmount } from './RollingAmount'
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { currentMonthKey } from '@/src/lib/envelope'
import { rolledOverLine } from '@/src/lib/rollover'
import { Toggle } from '@/src/components/ui/Toggle'
import { useWeeklyCategories } from '@/src/hooks/useWeeklyCategories'
import { allowanceNote, paceLine, resetChip, weekLabel, type WeekPace } from '@/src/lib/weekly'

const TIP_MS = 2000

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Tinted pill for what's left, on the progress bar's thresholds. Red is only
 * for overspent. Fully spent (not over) gets no pill at all: empty is fine, so
 * it shouldn't read as a badge. */
export function availablePill(e: Envelope, tokens: ThemeTokens): { color: string; bg: string } {
  if (e.isOverspent) return { color: tokens.pillOver, bg: tokens.pillOverBg }
  if (e.spentPct === 100) return { color: tokens.text3, bg: 'transparent' }
  if (e.spentPct > 75) return { color: tokens.pillLow, bg: tokens.pillLowBg }
  return { color: tokens.pillGood, bg: tokens.pillGoodBg }
}

/** A weekly row's pill: what's left this week, toned by pace rather than fullness. */
export function weeklyPill(p: WeekPace, tokens: ThemeTokens): { color: string; bg: string } {
  if (p.status === 'over') return { color: tokens.pillOver, bg: tokens.pillOverBg }
  if (p.status === 'ahead') return { color: tokens.pillLow, bg: tokens.pillLowBg }
  return { color: tokens.pillGood, bg: tokens.pillGoodBg }
}

/** Mirrors Web's EnvelopeGrid lastSpentLabel(), written by hand (no Intl) per this app's date-formatting convention. */
export function lastSpentLabel(iso: string | undefined): string {
  if (!iso) return '—'
  const d = parseLocalDate(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const today = new Date()
  const todayStr = toLocalDateString(today)
  if (iso === todayStr) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === toLocalDateString(yesterday)) return 'Yesterday'
  // Both sides at local midnight so the count is calendar days; round absorbs DST's 23/25h days.
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((midnight.getTime() - d.getTime()) / 86400000)
  if (days >= 1 && days <= 31) return `${days}d ago`
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

interface Props {
  envelope: Envelope
  icon: CategoryIconKey
  hideAmounts: boolean
  /** Overrides the displayed name (used for the Credit Card Payment special envelope). */
  displayName?: string
  onMoveMoney: (category: string) => void
  /** Opens the full-screen edit-assigned-amount modal (app/modals/edit-assigned-amount.tsx). */
  onEditAmount: (category: string) => void
  onViewTransactions: (category: string) => void
  /** Told when this row's action sheet opens/closes — Home uses it to hold
   * Ready to Assign's displayed value frozen while the sheet covers it, so
   * an edit's odometer roll plays on reveal instead of finishing unseen
   * behind the sheet. Optional: only Home's rows need to report this. */
  onSheetOpenChange?: (open: boolean) => void
  /** Bump to roll last month's carry into the Left pill (see RollingAmount). 0 shows it settled. */
  rollPlay?: number
  /** This row's wait in the top-to-bottom roll. */
  rollDelayMs?: number
  /** This week's pace, when the category is tracked weekly (src/lib/weekly.ts). */
  pace?: WeekPace
}

/** A single envelope row + its tap-to-open action sheet (move money / edit amount / view transactions). */
export function EnvelopeRow({
  envelope,
  icon,
  hideAmounts,
  displayName,
  onMoveMoney,
  onEditAmount,
  onViewTransactions,
  onSheetOpenChange,
  rollPlay = 0,
  rollDelayMs = 0,
  pace,
}: Props) {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const tintOf = useCategoryTint()
  const [sheetOpen, setSheetOpen] = useState(false)
  const { weekly, setWeekly } = useWeeklyCategories()
  const money = (n: number) => formatCurrency(n, hideAmounts)
  // What carried in, on a long press of the pill, since the row no longer says it.
  const tip = hideAmounts ? null : rolledOverLine(envelope.rolledOver, currentMonthKey(), (n) => formatCurrency(n))
  const [tipOpen, setTipOpen] = useState(false)
  useEffect(() => {
    if (!tipOpen) return
    const t = setTimeout(() => setTipOpen(false), TIP_MS)
    return () => clearTimeout(t)
  }, [tipOpen])

  function openSheet() {
    tap()
    setSheetOpen(true)
    onSheetOpenChange?.(true)
  }

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    onSheetOpenChange?.(false)
  }, [onSheetOpenChange])

  const pill = pace ? weeklyPill(pace, tokens) : availablePill(envelope, tokens)
  const Icon = CATEGORY_ICON_COMPONENTS[icon]
  const tint = tintOf(envelope.category)
  const name = displayName ?? splitEmoji(envelope.category).text
  // Spending with nothing assigned: "₹713/₹0" and "Used ∞" said nothing useful.
  const unbudgeted = envelope.assigned === 0 && envelope.spent > 0

  return (
    <View style={styles.row}>
      <Pressable style={styles.main} onPress={openSheet}>
        <View style={styles.topLine}>
          <View style={[styles.iconTile, { backgroundColor: tint.bg }]}>
            <Icon size={14} color={tint.ink} />
          </View>
          <Text
            style={[styles.name, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={[styles.spentOf, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            {pace
              ? `${money(pace.current.spent)}/${money(pace.current.allowance)}`
              : unbudgeted
              ? `${formatCurrency(envelope.spent, hideAmounts)} spent`
              : `${formatCurrency(envelope.spent, hideAmounts)}/${formatCurrency(envelope.assigned, hideAmounts)}`}
          </Text>
        </View>
        {pace ? (
          <>
            <ProgressBar pct={pace.spentPct} over={pace.status === 'over'} tick={pace.tickPct} />
            <View style={styles.paceLine}>
              <Text style={[styles.metaLine, styles.paceText, { color: pace.status === 'over' ? tokens.pillOver : tokens.text3, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>
                {paceLine(pace, money)}
              </Text>
              <Text style={[styles.metaLine, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{resetChip(pace)}</Text>
            </View>
          </>
        ) : (
          <ProgressBar pct={envelope.spentPct} over={envelope.isOverspent} />
        )}
        {!pace && !envelope.isCreditCardPayment && (
          <Text style={[styles.metaLine, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
            {unbudgeted ? 'Not budgeted · ' : ''}Last spent {lastSpentLabel(envelope.lastSpentDate)}
          </Text>
        )}
      </Pressable>
      <Pressable
        style={styles.availableCol}
        disabled={!tip}
        onLongPress={() => {
          tap()
          setTipOpen(true)
        }}
        accessibilityHint={tip ?? undefined}
      >
        {tipOpen && tip && (
          <Reanimated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(200)} style={[styles.tip, { backgroundColor: tokens.text }]}>
            <Text style={[styles.tipText, { color: tokens.bg, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>
              {tip}
            </Text>
          </Reanimated.View>
        )}
        <RollingAmount
          style={[styles.availablePill, { backgroundColor: pill.bg }]}
          color={pill.color}
          size={12}
          weight="bodySemiBold"
          from={pace ? pace.left : envelope.available - envelope.rolledOver}
          to={pace ? pace.left : envelope.available}
          play={hideAmounts || pace ? 0 : rollPlay}
          delayMs={rollDelayMs}
          tones={{ up: { color: tokens.pillGood, bg: tokens.pillGoodBg }, down: { color: tokens.pillOver, bg: tokens.pillOverBg } }}
        />
      </Pressable>

      <BottomSheet visible={sheetOpen} onClose={closeSheet}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          {name}
        </Text>
        {pace && <WeekBreakdown pace={pace} envelope={envelope} money={money} />}
        {!envelope.isCreditCardPayment && (
          <View style={[styles.weeklySwitch, { borderBottomColor: tokens.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>Track weekly</Text>
              {!pace && (
                <Text style={[styles.metaLine, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
                  {"Split the month into weeks and see if you're on pace."}
                </Text>
              )}
            </View>
            <Toggle
              value={weekly?.has(envelope.category) ?? false}
              onValueChange={(on) => setWeekly(envelope.category, on)}
              // Until the saved set loads, a flip would save over it.
              disabled={weekly === undefined}
              accessibilityLabel={`Track ${name} weekly`}
            />
          </View>
        )}
        <Pressable
          style={styles.sheetBtn}
          onPress={() => {
            closeSheet()
            onMoveMoney(envelope.category)
          }}
        >
          <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>
            Pull money from categories
          </Text>
        </Pressable>
        <Pressable
          style={styles.sheetBtn}
          onPress={() => {
            closeSheet()
            onEditAmount(envelope.category)
          }}
        >
          <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>
            Edit assigned amount
          </Text>
        </Pressable>
        {!envelope.isCreditCardPayment && (
          <Pressable
            style={styles.sheetBtn}
            onPress={() => {
              closeSheet()
              onViewTransactions(envelope.category)
            }}
          >
            <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>
              View transactions
            </Text>
          </Pressable>
        )}
      </BottomSheet>
    </View>
  )
}

/** The sheet's week-by-week list: every week so far, this one with its tick. */
function WeekBreakdown({ pace, envelope, money }: { pace: WeekPace; envelope: Envelope; money: (n: number) => string }) {
  const { tokens } = useTheme()
  const month = currentMonthKey()
  const note = allowanceNote(pace, money)
  return (
    <View style={styles.weeks}>
      <Text style={[styles.metaLine, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold, marginBottom: 4 }]}>
        {money(envelope.spent)} of {money(envelope.assigned + envelope.rolledOver)} this month
      </Text>
      {pace.weeks.map((w, i) => {
        const isNow = i === pace.weeks.length - 1
        return (
          <View key={w.from} style={styles.weekRow}>
            <Text style={[styles.weekLabel, { color: isNow ? tokens.text : tokens.text2, fontFamily: isNow ? fontFamily.bodySemiBold : fontFamily.bodyMedium }]}>
              {isNow ? 'This week' : weekLabel(w, month)}
            </Text>
            <View style={{ flex: 1 }}>
              {isNow ? (
                <ProgressBar pct={pace.spentPct} over={pace.status === 'over'} tick={pace.tickPct} />
              ) : (
                <ProgressBar pct={w.allowance > 0 ? Math.min(100, (w.spent / w.allowance) * 100) : w.spent > 0 ? 100 : 0} over={w.spent > w.allowance} tick={100} />
              )}
            </View>
            <Text style={[styles.weekAmount, { color: w.spent > w.allowance ? tokens.pillOver : tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
              {money(w.spent)}/{money(w.allowance)}
            </Text>
          </View>
        )
      })}
      {note && (
        <Text style={[styles.note, { color: tokens.text2, backgroundColor: tokens.inputBg, fontFamily: fontFamily.bodyMedium }]}>{note}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  main: { flex: 1, gap: 6 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconTile: { width: 26, height: 26, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, flexShrink: 1 },
  metaLine: { fontSize: 12, marginTop: 2 },
  spentOf: { marginLeft: 'auto', fontSize: 12, fontVariant: ['tabular-nums'] },
  // Fixed width so every row's bar ends at the same x, whatever the amount.
  availableCol: { width: 84, alignItems: 'flex-end' },
  availablePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tip: { position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, zIndex: 1 },
  tipText: { fontSize: 11 },
  sheetTitle: { fontSize: 16, marginBottom: 8 },
  sheetBtn: { paddingVertical: 12 },
  sheetBtnText: { fontSize: 14 },
  paceLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paceText: { flex: 1 },
  weeklySwitch: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  weeks: { gap: 2, marginBottom: 8 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  weekLabel: { width: 64, fontSize: 12 },
  weekAmount: { minWidth: 92, textAlign: 'right', fontSize: 12, fontVariant: ['tabular-nums'] },
  note: { fontSize: 12, lineHeight: 17, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6, overflow: 'hidden' },
})
