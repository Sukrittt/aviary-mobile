import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Calendar, ChevronDown } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Button } from '@/src/components/ui/Button'
import { BottomSheet } from '@/src/components/shared/Modal'

const STRIP_CELL_WIDTH = 56
const STRIP_GAP = 8
const STRIP_RADIUS_DAYS = 7 // at least a week either side before falling back to "Another date…"
const STRIP_CENTER_INDEX = STRIP_RADIUS_DAYS

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_SHORT2 = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const WEEKDAY_SHORT3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseISO(value: string): Date | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const key = (d: Date) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate()
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const fmt = (d: Date | null) => (d ? `${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}` : '—')
const fmtShort = (d: Date) => `${d.getDate()} ${SHORT[d.getMonth()]}`
const dayDiff = (a: Date, b: Date) =>
  Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) / 86400000)

interface Cell {
  day: string
  date: Date | null
  disabled: boolean
  isToday: boolean
  isSelected: boolean
}

function buildCells(view: Date, today: Date, selected: Date | null, disableFuture: boolean): Cell[] {
  const first = monthStart(view)
  const lead = (first.getDay() + 6) % 7
  const daysIn = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
  const kSel = selected ? key(selected) : null
  const kToday = key(today)
  // Blocks future months only; later days in the current month stay pickable.
  const futureMonth = view.getFullYear() > today.getFullYear() || (view.getFullYear() === today.getFullYear() && view.getMonth() > today.getMonth())
  const cells: Cell[] = []
  for (let i = 0; i < lead; i++) cells.push({ day: '', date: null, disabled: true, isToday: false, isSelected: false })
  for (let day = 1; day <= daysIn; day++) {
    const d = new Date(view.getFullYear(), view.getMonth(), day)
    const k = key(d)
    cells.push({
      day: String(day),
      date: d,
      disabled: disableFuture && futureMonth,
      isToday: k === kToday,
      isSelected: kSel === k,
    })
  }
  return cells
}

export interface DateRange {
  from: string
  to: string
}

interface SingleProps {
  mode: 'single'
  value: string
  onChange: (value: string) => void
  disableFuture?: boolean
  /** Renders the date strip for the flood screen, where a same-color accent fill on the selected chip would vanish into the ground. */
  onAccent?: boolean
}

interface RangeProps {
  mode: 'range'
  value: DateRange
  onChange: (value: DateRange) => void
  disableFuture?: boolean
}

type Props = SingleProps | RangeProps

const RANGE_PRESETS: [string, number, boolean][] = [
  ['This month', 0, true],
  ['Last 7 days', 7, false],
  ['Last 30 days', 30, false],
  ['Last 90 days', 90, false],
]

export function DatePicker(props: Props) {
  if (props.mode === 'range') return <RangeDatePicker {...props} />
  return <SingleDatePicker {...props} />
}

function presetRange(today: Date, days: number, useMonthStart: boolean): DateRange {
  const start = useMonthStart ? new Date(today.getFullYear(), today.getMonth(), 1) : addDays(today, -(days - 1))
  return { from: toISO(start), to: toISO(today) }
}

function RangeDatePicker({ value, onChange, disableFuture = true }: RangeProps) {
  const { tokens } = useTheme()
  const [open, setOpen] = useState(false)
  const [editingField, setEditingField] = useState<'from' | 'to' | null>(null)
  const today = new Date()
  const from = parseISO(value.from)
  const to = parseISO(value.to)
  const [view, setView] = useState(() => monthStart(from ?? today))

  const cells = buildCells(view, today, from, disableFuture)
  const kFrom = from ? key(from) : null
  const kTo = to ? key(to) : null
  const days = from && to ? dayDiff(to, from) + 1 : 0

  // Range as it was when the picker opened, so Cancel can restore it.
  const snapshot = useRef(value)

  function openSheet() {
    snapshot.current = value
    setView(monthStart(from ?? today))
    setEditingField(null)
    setOpen(true)
  }

  function close() {
    setEditingField(null)
    setOpen(false)
  }

  function cancel() {
    onChange(snapshot.current)
    setEditingField(null)
    setOpen(false)
  }

  function pick(d: Date) {
    Haptics.selectionAsync().catch(() => {})
    const iso = toISO(d)
    let newFrom = value.from
    let newTo = value.to
    if (editingField === 'from') {
      newFrom = iso
    } else if (editingField === 'to') {
      newTo = iso
    } else if (!from || (from && to)) {
      newFrom = iso
      newTo = ''
    } else if (key(d) < kFrom!) {
      newTo = value.from
      newFrom = iso
    } else {
      newTo = iso
    }
    if (newFrom && newTo && newFrom > newTo) [newFrom, newTo] = [newTo, newFrom]
    setEditingField(null)
    onChange({ from: newFrom, to: newTo })
    if (newFrom && newTo) setOpen(false)
  }

  function applyPreset(presetDays: number, useMonthStart: boolean) {
    Haptics.selectionAsync().catch(() => {})
    const range = presetRange(today, presetDays, useMonthStart)
    onChange(range)
    setView(monthStart(parseISO(range.from)!))
    setEditingField(null)
    setOpen(false)
  }

  const label =
    from && to
      ? `${fmtShort(from)}${from.getFullYear() === to.getFullYear() ? '' : ` ${from.getFullYear()}`} – ${fmtShort(to)} ${to.getFullYear()} · ${days} day${days === 1 ? '' : 's'}`
      : from
        ? 'Pick an end date'
        : 'Custom range'

  const statusText = editingField
    ? `Editing ${editingField} date`
    : !from
      ? 'Tap a start date'
      : !to
        ? 'Now tap an end date'
        : `${days} day${days === 1 ? '' : 's'} selected`

  return (
    <View>
      <Pressable
        onPress={openSheet}
        style={[styles.field, { backgroundColor: tokens.inputBg, borderColor: open ? tokens.accent : tokens.border }]}
      >
        <View style={styles.fieldLeft}>
          <View style={[styles.iconWrap, { backgroundColor: tokens.accentSoft }]}>
            <Calendar size={15} color={tokens.accentInk} />
          </View>
          <Text style={[styles.fieldText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>
        </View>
        <ChevronDown size={16} color={tokens.text3} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>

      <BottomSheet visible={open} onClose={close}>
        <View style={styles.sheetBody}>
          <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Custom range</Text>
          <Text style={[styles.statusText, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>{statusText}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick}>
            {RANGE_PRESETS.map(([pLabel, pDays, useMonthStart]) => {
              const preset = presetRange(today, pDays, useMonthStart)
              const active = value.from === preset.from && value.to === preset.to
              return (
                <Pressable
                  key={pLabel}
                  onPress={() => applyPreset(pDays, useMonthStart)}
                  style={[
                    styles.chip,
                    { borderColor: active ? 'transparent' : tokens.borderStrong, backgroundColor: active ? tokens.accent : 'transparent' },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
                    {pLabel}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          <View style={styles.nav}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))
              }}
              style={[styles.navBtn, styles.navBtnLarge, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}
            >
              <Text style={[styles.navBtnText, { color: tokens.text }]}>‹</Text>
            </Pressable>
            <Text style={[styles.monthLabel, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))
              }}
              style={[styles.navBtn, styles.navBtnLarge, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}
            >
              <Text style={[styles.navBtnText, { color: tokens.text }]}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdays}>
            {WEEKDAY_SHORT2.map((w, i) => (
              <Text key={i} style={[styles.weekday, { color: tokens.text3 }]}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
              <View key={row} style={styles.gridRow}>
                {Array.from({ length: 7 }, (_, i) => cells[row * 7 + i]).map((c, i) => {
                  const k = c?.date ? key(c.date) : null
                  const isStart = k !== null && k === kFrom
                  const isEnd = k !== null && k === kTo
                  const inRange = kFrom !== null && kTo !== null && k !== null && k > kFrom && k < kTo
                  const bandLeft = isEnd && !isStart ? '0%' : isStart && !isEnd ? '50%' : '0%'
                  const bandRight = isStart && !isEnd ? '0%' : isEnd && !isStart ? '50%' : '0%'
                  const showBand = !!(kFrom !== null && kTo !== null && kFrom !== kTo && (isStart || isEnd || inRange))
                  return (
                    <View key={i} style={[styles.cellWrapLarge]}>
                      {showBand && (
                        <View
                          pointerEvents="none"
                          style={{ position: 'absolute', top: 0, bottom: 0, left: bandLeft, right: bandRight, backgroundColor: tokens.accentSoft }}
                        />
                      )}
                      {c?.date && (
                        <Pressable
                          disabled={c.disabled}
                          onPress={() => pick(c.date!)}
                          style={[
                            styles.cellLarge,
                            { borderColor: c.isToday && !(isStart || isEnd) ? tokens.accent : 'transparent' },
                            (isStart || isEnd) && { backgroundColor: tokens.accent },
                            c.disabled && { opacity: 0.6 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.cellText,
                              {
                                color: c.disabled ? tokens.text3 : isStart || isEnd ? tokens.onAccent : tokens.text,
                                fontFamily: fontFamily.bodySemiBold,
                              },
                            ]}
                          >
                            {c.day}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )
                })}
              </View>
            ))}
          </View>

          <View style={styles.fromToRow}>
            <Pressable
              onPress={() => setEditingField('from')}
              style={[styles.fromToPill, { borderColor: editingField === 'from' ? tokens.accent : tokens.border }]}
            >
              <Text style={[styles.fromToLabel, { color: tokens.text3 }]}>FROM</Text>
              <Text style={[styles.fromToValue, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{fmt(from)}</Text>
            </Pressable>
            <View style={[styles.fromToDivider, { backgroundColor: tokens.border }]} />
            <Pressable
              onPress={() => setEditingField('to')}
              style={[styles.fromToPill, { borderColor: editingField === 'to' ? tokens.accent : tokens.border }]}
            >
              <Text style={[styles.fromToLabel, { color: tokens.text3 }]}>TO</Text>
              <Text style={[styles.fromToValue, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{fmt(to)}</Text>
            </Pressable>
          </View>

          <View style={styles.rangeFooter}>
            <Button label="Cancel" variant="secondary" style={styles.footerButton} onPress={cancel} />
            <Button label="Apply" style={styles.footerButton} disabled={!from} onPress={close} />
          </View>
        </View>
      </BottomSheet>
    </View>
  )
}

function SingleDatePicker({ value, onChange, disableFuture = true, onAccent = false }: SingleProps) {
  const { tokens } = useTheme()
  const [open, setOpen] = useState(false)
  const today = new Date()
  const selected = parseISO(value)
  const [view, setView] = useState(() => monthStart(selected ?? today))
  const stripRef = useRef<ScrollView>(null)
  const stripWidth = useRef(0)

  function openCalendar() {
    setView(monthStart(selected ?? today))
    setOpen(true)
  }

  function pick(d: Date) {
    Haptics.selectionAsync().catch(() => {})
    onChange(toISO(d))
  }

  function pickFromCalendar(d: Date) {
    pick(d)
    setOpen(false)
  }

  const cells = buildCells(view, today, selected, disableFuture)
  const kToday = key(today)
  const kYesterday = key(addDays(today, -1))
  const kSel = selected ? key(selected) : null

  // Strip is centered on the selected date (falling back to today) so it's always in view on open.
  const stripCenter = selected ?? today
  const stripDays = Array.from({ length: STRIP_RADIUS_DAYS * 2 + 1 }, (_, i) => addDays(stripCenter, i - STRIP_RADIUS_DAYS))
  function centerStrip(viewportWidth: number) {
    stripWidth.current = viewportWidth
    const stride = STRIP_CELL_WIDTH + STRIP_GAP
    const offset = STRIP_CENTER_INDEX * stride - viewportWidth / 2 + STRIP_CELL_WIDTH / 2
    stripRef.current?.scrollTo({ x: Math.max(0, offset), animated: false })
  }
  // A calendar pick rebuilds the strip around the new date, so scroll it back to the middle.
  useEffect(() => {
    if (stripWidth.current) centerStrip(stripWidth.current)
  }, [value])
  function stripLabel(d: Date) {
    const k = key(d)
    if (k === kToday) return 'Today'
    if (k === kYesterday) return 'Yest'
    return WEEKDAY_SHORT3[d.getDay()]
  }

  let daysAgoText = ''
  if (selected) {
    const diff = dayDiff(today, selected)
    daysAgoText = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff > 1 ? `${diff} days ago` : 'In the future'
  }

  return (
    <View>
      <View style={styles.dateHeader}>
        <Text style={[styles.dateHeaderLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
          Date · {MONTHS[stripCenter.getMonth()]}
        </Text>
        {!!daysAgoText && <Text style={[styles.daysAgo, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{daysAgoText}</Text>}
      </View>

      <ScrollView
        ref={stripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        onLayout={(e) => centerStrip(e.nativeEvent.layout.width)}
      >
        {stripDays.map((d) => {
          const k = key(d)
          const active = kSel === k
          const activeBg = onAccent ? tokens.onAccent : tokens.accent
          const activeText = onAccent ? tokens.accentInk : tokens.onAccent
          return (
            <Pressable
              key={k}
              onPress={() => pick(d)}
              style={[
                styles.stripCell,
                { backgroundColor: active ? activeBg : tokens.inputBg, borderColor: active ? activeBg : tokens.border },
              ]}
            >
              <Text style={[styles.stripDay, { color: active ? activeText : tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
                {stripLabel(d)}
              </Text>
              <Text style={[styles.stripNum, { color: active ? activeText : tokens.text, fontFamily: fontFamily.bodyBold }]}>{d.getDate()}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <Pressable onPress={openCalendar} style={styles.linkRow} hitSlop={8}>
        <Calendar size={14} color={onAccent ? tokens.onAccent : tokens.accent} />
        <Text style={[styles.link, { color: onAccent ? tokens.onAccent : tokens.accent, fontFamily: fontFamily.bodySemiBold }]}>
          Another date…
        </Text>
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <View style={styles.sheetBody}>
          <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Pick a date</Text>

          <View style={styles.nav}>
            <Pressable
              accessibilityLabel="Previous month"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))
              }}
              style={[styles.navBtn, styles.navBtnLarge, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}
            >
              <Text style={[styles.navBtnText, { color: tokens.text }]}>‹</Text>
            </Pressable>
            <Text style={[styles.monthLabel, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </Text>
            <Pressable
              accessibilityLabel="Next month"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))
              }}
              style={[styles.navBtn, styles.navBtnLarge, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}
            >
              <Text style={[styles.navBtnText, { color: tokens.text }]}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdays}>
            {WEEKDAY_SHORT2.map((w, i) => (
              <Text key={i} style={[styles.weekday, { color: tokens.text3 }]}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
              <View key={row} style={styles.gridRow}>
                {Array.from({ length: 7 }, (_, i) => cells[row * 7 + i]).map((c, i) => (
                  <View key={i} style={styles.cellWrapLarge}>
                    {c?.date && (
                      <Pressable
                        disabled={c.disabled}
                        onPress={() => pickFromCalendar(c.date!)}
                        style={[
                          styles.cellLarge,
                          { borderColor: c.isToday && !c.isSelected ? tokens.accent : 'transparent' },
                          c.isSelected && { backgroundColor: tokens.accent },
                          c.disabled && { opacity: 0.4 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.cellText,
                            { color: c.disabled ? tokens.text3 : c.isSelected ? tokens.onAccent : tokens.text, fontFamily: fontFamily.bodySemiBold },
                          ]}
                        >
                          {c.day}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      </BottomSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, borderWidth: 1 },
  fieldLeft: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  iconWrap: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  fieldText: { fontSize: 14 },
  quick: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 12 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  navBtnLarge: { width: 44, height: 44, borderRadius: 22 },
  navBtnText: { fontSize: 14 },
  monthLabel: { fontSize: 14 },
  weekdays: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 10 },
  grid: { gap: 0 },
  gridRow: { flexDirection: 'row' },
  cellWrapLarge: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cellLarge: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 13 },
  rangeFooter: { flexDirection: 'row', gap: 8 },
  footerButton: { flex: 1 },
  statusText: { fontSize: 12.5 },
  fromToRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fromToPill: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  fromToLabel: { fontSize: 10, letterSpacing: 0.5 },
  fromToValue: { fontSize: 13 },
  fromToDivider: { width: 1, height: 26 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dateHeaderLabel: { fontSize: 11, letterSpacing: 0.5 },
  daysAgo: { fontSize: 11 },
  strip: { flexDirection: 'row', gap: STRIP_GAP },
  stripCell: { width: STRIP_CELL_WIDTH, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 14, borderWidth: 1, gap: 2 },
  stripDay: { fontSize: 10 },
  stripNum: { fontSize: 15 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  link: { fontSize: 13 },
  sheetBody: { gap: 12 },
  sheetTitle: { fontSize: 17 },
})
