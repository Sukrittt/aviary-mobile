import { useCategories, useCategoryTint, useSaveNote } from '@/src/hooks/useCategories'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef, useState } from 'react'
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
import Reanimated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { currentMonthKey } from '@/src/lib/envelope'
import { rolledOverLine } from '@/src/lib/rollover'
import { Toggle } from '@/src/components/ui/Toggle'
import { useWeeklyCategories } from '@/src/hooks/useWeeklyCategories'
import { allowanceNote, paceLine, resetChip, weekResult, type WeekPace } from '@/src/lib/weekly'
import { goalProgress } from '@/src/lib/goal'
import { GoalLine } from './GoalFields'
import { ShimmerText } from '@/src/components/shared/ShimmerText'
import { NOTE_CHANGED, NoteBlock, draftKey, keptDrafts } from './NoteBlock'
import { HttpError } from '@/src/api/client'
import { checklistCount } from '@/src/lib/noteRender'
import { Note } from '@/src/components/shared/icons'
import { PopIn } from '@/src/components/shared/PopIn'
import { PopOnChange } from '@/src/components/shared/PopOnChange'
import { motion } from '@/src/theme/scale'

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

/** A pace-toned pill: green on track, amber ahead of the tick, red over. */
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
  /** With an amount: a goal's Set, which opens on the sources for that much. */
  onMoveMoney: (category: string, amount?: number) => void
  /** Opens the full-screen edit-assigned-amount modal (app/modals/edit-assigned-amount.tsx). */
  onEditAmount: (category: string) => void
  onViewTransactions: (category: string) => void
  /** Opens the full-screen goal modal (app/modals/goal.tsx). Omitted: no goal option. */
  onEditGoal?: (category: string) => void
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
  /** False while a screen covers Home (Pull money's modal), so a rise waits to roll where it can be seen. */
  active?: boolean
  /** Shows a quiet notice on the screen, e.g. a note saved as its sheet closed. */
  onToast?: (message: string) => void
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
  onEditGoal,
  onSheetOpenChange,
  rollPlay = 0,
  active = true,
  rollDelayMs = 0,
  pace: weeklyPace,
  onToast,
}: Props) {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const tintOf = useCategoryTint()
  const [sheetOpen, setSheetOpen] = useState(false)
  // Flipped with the sheet open: the weeks and the switch's caption trade
  // places on one curve, so the card's top eases. Opened already on or off,
  // the sheet's own slide covers it.
  const [weeklyFlipped, setWeeklyFlipped] = useState(false)
  const { weekly, setWeekly, readOnly } = useWeeklyCategories()
  const money = (n: number) => formatCurrency(n, hideAmounts)
  // A goal row is about filling up, so its bar and line say that instead of spending or pace.
  const month = currentMonthKey()
  const categories = useCategories().data
  const row = envelope.isCreditCardPayment ? undefined : categories?.find((c) => c.name === envelope.category)
  const goal = row?.goal ? goalProgress({ goal: row.goal, month, available: envelope.available, assigned: envelope.assigned, spent: envelope.spent, since: row.since }) : null
  // A goal's bar grows from where it was when money lands (Set, Pull money, Edit amount), alongside the pill's roll.
  const [seenPct, setSeenPct] = useState(goal?.pct)
  const [grow, setGrow] = useState<{ from: number; n: number } | null>(null)
  if (goal && goal.pct !== seenPct) {
    setSeenPct(goal.pct)
    if (seenPct !== undefined && goal.pct > seenPct && !hideAmounts) setGrow({ from: seenPct, n: (grow?.n ?? 0) + 1 })
  }
  // Played once Home's in front; then back to a plain bar, so a later modal doesn't hold it at the old fill.
  useEffect(() => {
    if (!grow || !active) return
    const t = setTimeout(() => setGrow(null), 2500)
    return () => clearTimeout(t)
  }, [grow, active])
  const behind = !readOnly && goal?.status === 'behind' && goal.behindBy ? goal.behindBy : 0
  const pace = goal ? undefined : weeklyPace
  // What carried in, on a long press of the pill, since the row no longer says it.
  const tip = hideAmounts ? null : rolledOverLine(envelope.rolledOver, currentMonthKey(), (n) => formatCurrency(n))
  const [tipOpen, setTipOpen] = useState(false)
  useEffect(() => {
    if (!tipOpen) return
    const t = setTimeout(() => setTipOpen(false), TIP_MS)
    return () => clearTimeout(t)
  }, [tipOpen])

  // Bumped when a note lands, so the row's glyph pops in once the sheet is out of the way.
  const [notePop, setNotePop] = useState(0)
  const [noteEditing, setNoteEditing] = useState(false)
  const pendingNote = useRef<(() => { text: string; base: string } | undefined) | null>(null)
  // The row's note as the sheet opened: a change lands on the row once the sheet is gone, not behind it.
  const [noteAtOpen, setNoteAtOpen] = useState<string | undefined>()
  const saveNote = useSaveNote()

  function openSheet() {
    tap()
    setNoteAtOpen(row?.note)
    setSheetOpen(true)
    onSheetOpenChange?.(true)
  }

  function closeSheet() {
    // Closing mid-edit keeps what was typed: save it on the way out.
    const pending = pendingNote.current?.()
    // Taken: the sheet's unmount mustn't keep it as unsaved too.
    pendingNote.current = null
    if (pending !== undefined) {
      const { text: draft, base } = pending
      const key = draftKey(envelope.category)
      const category = envelope.category
      saveNote(category, draft.trim() || null, base).then(
        () => {
          keptDrafts.delete(key)
          setNotePop((n) => n + 1)
          onToast?.(draft.trim() ? 'Note saved' : 'Note cleared')
        },
        (e) => {
          keptDrafts.set(key, draft)
          onToast?.(e instanceof HttpError && e.status === 409
            ? `${NOTE_CHANGED} Your draft's waiting in the sheet.`
            : "Couldn't save your note. It's waiting for you in the sheet.")
        },
      )
    }
    setSheetOpen(false)
    setWeeklyFlipped(false)
    setNoteEditing(false)
    onSheetOpenChange?.(false)
  }

  function noteSaved() {
    closeSheet()
    setNotePop((n) => n + 1)
  }

  // Kept after weekly turns off, so the weeks can collapse instead of vanishing.
  const lastPace = useRef(pace)
  if (pace) lastPace.current = pace
  // Home keeps the month for every row; a weekly row adds the pace tick and
  // tones its bar and pill by month pace. The weeks live in the sheet.
  const pill = pace ? weeklyPill({ ...pace, status: pace.monthStatus }, tokens) : availablePill(envelope, tokens)
  const Icon = CATEGORY_ICON_COMPONENTS[icon]
  const tint = tintOf(envelope.category)
  const name = displayName ?? splitEmoji(envelope.category).text
  // Spending with nothing assigned: "₹713/₹0" and "Used ∞" said nothing useful.
  const unbudgeted = envelope.assigned === 0 && envelope.spent > 0
  const rowNote = sheetOpen ? noteAtOpen : row?.note
  const todos = rowNote ? checklistCount(rowNote) : null

  // Rides the row's bottom line so the name keeps the top line's width. A card payment row has no bottom line.
  const noteGlyph = todos && (
    // Keyed on notePop: a fresh note pops in after the sheet's slide-out; a first paint just sits there.
    <PopIn key={notePop} play={notePop > 0} delay={motion.base} style={styles.noteGlyph}>
      <View accessible accessibilityLabel={todos.total > todos.done ? `Note, ${todos.done} of ${todos.total} done` : 'Has a note'} style={styles.noteGlyph}>
        <Note size={13} color={tokens.text3} />
        {todos.total > todos.done && (
          <PopOnChange value={todos.done}>
            <Text style={[styles.noteCount, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{todos.done}/{todos.total}</Text>
          </PopOnChange>
        )}
      </View>
    </PopIn>
  )

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
          {envelope.isCreditCardPayment && noteGlyph}
          <Text style={[styles.spentOf, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            {goal
              ? `${money(goal.saved)} of ${money(goal.target)}`
              : unbudgeted
              ? `${formatCurrency(envelope.spent, hideAmounts)} spent`
              : `${formatCurrency(envelope.spent, hideAmounts)}/${formatCurrency(envelope.assigned, hideAmounts)}`}
          </Text>
        </View>
        {goal && row?.goal ? (
          <>
            {/* tick at 100: mint all the way, filling up is the point. */}
            {grow ? (
              // One mounted bar per rise: held at the old fill while covered, then its target moves.
              // Remounting on focus would draw it empty for a frame.
              <ProgressBar key={grow.n} pct={active ? goal.pct : grow.from} from={grow.from} tick={100} />
            ) : (
              <ProgressBar pct={goal.pct} tick={100} />
            )}
            <GoalLine category={envelope.category} goal={row.goal} progress={goal} month={month} money={money} onPull={readOnly ? undefined : onMoveMoney} trailing={noteGlyph} />
          </>
        ) : pace ? (
          <>
            <ProgressBar pct={pace.monthSpentPct} over={pace.monthStatus === 'over'} tick={pace.monthTickPct} />
            <View style={styles.paceLine}>
              <Text style={[styles.metaLine, styles.paceText, { color: pace.status === 'over' ? tokens.pillOver : tokens.text3, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>
                {paceLine(pace, money)}
              </Text>
              {noteGlyph}
              <Text style={[styles.metaLine, styles.resetChip, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{resetChip(pace)}</Text>
            </View>
          </>
        ) : (
          <ProgressBar pct={envelope.spentPct} over={envelope.isOverspent} />
        )}
        {!pace && !goal && !envelope.isCreditCardPayment && (
          <View style={styles.paceLine}>
            <Text style={[styles.metaLine, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
              {unbudgeted ? 'Not budgeted · ' : ''}Last spent {lastSpentLabel(envelope.lastSpentDate)}
            </Text>
            {noteGlyph}
          </View>
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
          from={envelope.available - envelope.rolledOver}
          to={envelope.available}
          play={hideAmounts ? 0 : rollPlay}
          delayMs={rollDelayMs}
          tones={{ up: { color: tokens.pillGood, bg: tokens.pillGoodBg }, down: { color: tokens.pillOver, bg: tokens.pillOverBg } }}
          rise={!hideAmounts}
          active={active}
        />
        {/* A behind goal's Set sits under its Left pill: the money column, and the same spot on every row. */}
        {behind > 0 && (
          <Pressable onPress={() => onMoveMoney(envelope.category, behind)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Set ${name}: pull ${money(behind)}`}
            style={[styles.setPill, { backgroundColor: tokens.pillLowBg }]}>
            {/* A streak runs across Set nonstop: it's something the user still has to do. */}
            <ShimmerText nudge on={active} text="Set" style={[styles.setText, { color: tokens.pillLow, fontFamily: fontFamily.bodySemiBold }]} />
          </Pressable>
        )}
      </Pressable>

      <BottomSheet visible={sheetOpen} onClose={closeSheet}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          {name}
        </Text>
        {row && <NoteBlock row={row} readOnly={readOnly} pending={pendingNote} onSaved={noteSaved} onEditingChange={setNoteEditing} />}
        {/* Editing, the note is all the sheet holds: Save stays in reach above the keyboard. */}
        {!noteEditing && <>
        <Collapse open={!!pace} animateOpen={weeklyFlipped}>
          {lastPace.current && <WeekBreakdown pace={lastPace.current} envelope={envelope} money={money} />}
        </Collapse>
        {!envelope.isCreditCardPayment && !readOnly && !row?.goal && (
          <View style={[styles.weeklySwitch, { borderBottomColor: tokens.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>Track weekly</Text>
              {/* Collapsed, not dropped, when tracking starts: unmounting it shrank the
                  card a frame before the weeks began to grow, a visible jolt. */}
              <Collapse open={!pace} animateOpen={weeklyFlipped}>
                <Text style={[styles.metaLine, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
                  {"Split the month into weeks and see if you're on pace."}
                </Text>
              </Collapse>
            </View>
            <Toggle
              value={weekly?.has(envelope.category) ?? false}
              onValueChange={(on) => {
                setWeeklyFlipped(true)
                setWeekly(envelope.category, on)
              }}
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
        {!envelope.isCreditCardPayment && !readOnly && onEditGoal && (
          <Pressable
            style={styles.sheetBtn}
            onPress={() => {
              closeSheet()
              onEditGoal(envelope.category)
            }}
          >
            <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>
              {row?.goal ? 'Edit goal' : 'Make this a goal'}
            </Text>
          </Pressable>
        )}
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
        </>}
      </BottomSheet>
    </View>
  )
}

/**
 * Animates its own height between 0 and its content's, so the bottom-anchored
 * sheet's top edge glides both ways while its bottom stays put. (BottomSheet
 * itself can't use a layout transition: see the note in Modal.tsx.) The
 * content is absolutely placed so it measures at full height even while the
 * box is collapsed, and pinned to the box's bottom: the box's bottom edge is
 * what stays put on screen, so the content holds still and the top edge lifts
 * off it. Pinned to the top it rode up with the edge while the bottom clipped
 * it, row by row.
 */
function Collapse({ open, animateOpen, children }: { open: boolean; animateOpen: boolean; children: React.ReactNode }) {
  const height = useSharedValue(0)
  const measured = useSharedValue(0)
  const ease = { duration: 280, easing: Easing.out(Easing.cubic) }

  useEffect(() => {
    if (!open) height.value = withTiming(0, ease)
    else if (measured.value > 0) height.value = animateOpen ? withTiming(measured.value, ease) : measured.value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A short fade, just enough to cover the clip edge's first frames; longer
  // and the rows sat washed out for most of the travel.
  const style = useAnimatedStyle(() => ({ height: height.value, opacity: measured.value ? Math.min(1, height.value / Math.min(measured.value, 24)) : 0 }))
  return (
    <Reanimated.View style={[styles.collapse, style]}>
      <View
        style={styles.collapseInner}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height
          if (h === measured.value) return
          measured.value = h
          if (open) height.value = animateOpen ? withTiming(h, ease) : h
        }}
      >
        {children}
      </View>
    </Reanimated.View>
  )
}

/** The sheet's week-by-week list: the weeks you spent in so far, and this one with its tick. */
function WeekBreakdown({ pace, envelope, money }: { pace: WeekPace; envelope: Envelope; money: (n: number) => string }) {
  const { tokens } = useTheme()
  const note = allowanceNote(pace, money)
  return (
    <View style={styles.weeks}>
      <Text style={[styles.metaLine, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold, marginBottom: 4 }]}>
        {money(envelope.spent)} of {money(envelope.assigned + envelope.rolledOver)} this month
      </Text>
      {/* Weeks you spent in, and this one. Empty past weeks are just noise. */}
      {pace.weeks.map((w, i) => ({ w, i })).filter(({ w, i }) => w.spent !== 0 || i === pace.weeks.length - 1).map(({ w, i }) => {
        const isNow = i === pace.weeks.length - 1
        const result = weekResult(w, isNow, pace.left, money)
        // This week's pill matches the row's on Home; a finished week is just under or over.
        const tone = isNow ? weeklyPill(pace, tokens) : result.over ? { color: tokens.pillOver, bg: tokens.pillOverBg } : { color: tokens.pillGood, bg: tokens.pillGoodBg }
        return (
          <View key={w.from} style={styles.weekRow}>
            <Text style={[styles.weekLabel, { color: isNow ? tokens.text : tokens.text2, fontFamily: isNow ? fontFamily.bodySemiBold : fontFamily.bodyMedium }]}>
              {isNow ? 'This week' : `Week ${i + 1}`}
            </Text>
            <View style={{ flex: 1 }}>
              {isNow ? (
                <ProgressBar pct={pace.spentPct} over={pace.status === 'over'} tick={pace.tickPct} />
              ) : (
                <ProgressBar pct={w.allowance > 0 ? Math.min(100, (w.spent / w.allowance) * 100) : w.spent > 0 ? 100 : 0} over={w.spent > w.allowance} tick={100} />
              )}
            </View>
            <View style={styles.weekAmountCol}>
              <Text style={[styles.weekPill, { color: tone.color, backgroundColor: tone.bg, fontFamily: fontFamily.bodySemiBold }]}>{result.text}</Text>
            </View>
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
  availableCol: { width: 84, alignItems: 'flex-end', gap: 8 },
  setPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  setText: { fontSize: 12 },
  availablePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tip: { position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, zIndex: 1 },
  tipText: { fontSize: 11 },
  noteGlyph: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  noteCount: { fontSize: 12, fontVariant: ['tabular-nums'] },
  sheetTitle: { fontSize: 16, marginBottom: 8 },
  sheetBtn: { paddingVertical: 12 },
  sheetBtnText: { fontSize: 14 },
  paceLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapse: { overflow: 'hidden' },
  collapseInner: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  paceText: { flexShrink: 1 },
  resetChip: { marginLeft: 'auto' },
  weeklySwitch: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  weeks: { gap: 2, marginBottom: 8 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  weekLabel: { width: 64, fontSize: 12 },
  // Same width as the row's pill column, so the week bars end where Home's do.
  weekAmountCol: { width: 84, alignItems: 'flex-end' },
  weekPill: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', fontVariant: ['tabular-nums'] },
  note: { fontSize: 12, lineHeight: 17, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6, overflow: 'hidden' },
})
