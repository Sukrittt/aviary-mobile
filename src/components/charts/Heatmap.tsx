import { useEffect, useMemo, useRef } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Reanimated, {
  ZoomIn,
  ZoomOut,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable)

const MOUNT_START_DELAY_MS = 150
const COLUMN_STAGGER_MS = 70
const ROW_STAGGER_MS = 15
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// One hue (accent), four clearly separated opacities — the old heatA/heatB
// pair read as near-identical browns in dark mode.
const LEVEL_OPACITY = [0.16, 0.4, 0.65, 0.9]

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function accentAt(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export interface HeatmapCell {
  date: string
  day: number
  value: number
}

interface Props {
  cells: HeatmapCell[]
  todayDate?: string
  onSelectDate?: (date: string) => void
}

interface DayCellProps {
  row: number
  col: number
  day: number
  isToday: boolean
  isFuture: boolean
  bg: string
  textColor: string
  borderColor: string
  bold: boolean
  disabled: boolean
  onPress?: () => void
  playMountStagger: boolean
}

/**
 * Reanimated's `entering` layout-animation prop doesn't reliably fire for
 * elements that mount as part of the screen's own first paint this deep
 * inside a ScrollView (confirmed: cells rendered static, no pop, on a true
 * cold mount) — it only works for genuine later remounts, like the
 * month-change boundary cells swapping in/out. So the mount stagger is
 * driven explicitly via a shared value instead of relying on `entering`.
 */
function DayCell({ row, col, day, isToday, isFuture, bg, textColor, borderColor, bold, disabled, onPress, playMountStagger }: DayCellProps) {
  const scale = useSharedValue(playMountStagger ? 0 : 1)

  useEffect(() => {
    if (!playMountStagger) return
    scale.value = withDelay(
      MOUNT_START_DELAY_MS + col * COLUMN_STAGGER_MS + row * ROW_STAGGER_MS,
      withSpring(1, { mass: 0.7, damping: 12, stiffness: 160 }),
    )
    // Intentionally runs once for this cell's own mount — playMountStagger is read only for its
    // initial value, not tracked reactively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mountStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <AnimatedPressable
      entering={playMountStagger ? undefined : ZoomIn.springify().mass(0.5).damping(16).stiffness(500)}
      exiting={ZoomOut.springify().mass(0.5).damping(16).stiffness(500)}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.cell,
        styles.filledCell,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: isToday ? 1.5 : isFuture ? 1 : 0,
          borderStyle: isFuture && !isToday ? 'dashed' : 'solid',
        },
        mountStyle,
      ]}
    >
      <Text style={{ color: textColor, fontSize: 12, fontFamily: bold ? fontFamily.bodyBold : undefined }}>{day}</Text>
    </AnimatedPressable>
  )
}

/** Calendar heatmap of daily spend — 7-column grid, weekday header, a
 *  less/more legend anchoring the scale, and 4 shading levels on one hue. */
export function Heatmap({ cells, todayDate, onSelectDate }: Props) {
  const { tokens } = useTheme()

  // True only for this instance's very first render; flips after mount so
  // month-change re-renders (same instance, cells prop just swaps) never
  // replay the mount stagger on top of the existing ZoomIn/ZoomOut transition.
  // A ref, not state: nothing needs to re-render off this flip — the next
  // read happens naturally on the month-change re-render that cells triggers.
  const isMountingRef = useRef(true)
  useEffect(() => {
    isMountingRef.current = false
  }, [])

  // Percentile rank among non-zero days, not value/max — a single outlier day
  // would otherwise squash every other day into the "no color" bucket.
  const levels = useMemo(() => {
    const nonZero = cells.filter((c) => c.day > 0 && c.value > 0).map((c) => c.value).sort((a, b) => a - b)
    const map = new Map<string, number>()
    for (const c of cells) {
      if (c.day === 0 || c.value <= 0) continue
      const rank = nonZero.findIndex((v) => v >= c.value)
      const percentile = rank / nonZero.length
      map.set(c.date, Math.min(Math.floor(percentile * 4), 3) + 1)
    }
    return map
  }, [cells])

  const rows: HeatmapCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7)
    while (row.length < 7) row.push({ date: `pad-${i}-${row.length}`, day: 0, value: 0 })
    rows.push(row)
  }

  return (
    <View>
      <View style={styles.row}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={[styles.weekdayLabel, { color: tokens.text3 }]}>
            {label}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((c, j) => {
            const pos = i * 7 + j // stable grid slot, unlike c.date which changes every month
            if (c.day === 0) return <View key={pos} style={styles.cell} />
            const isToday = c.date === todayDate
            const isFuture = !!todayDate && c.date > todayDate
            const level = levels.get(c.date) ?? 0
            const bg = isFuture ? tokens.card : level === 0 ? tokens.chipActiveBg : accentAt(tokens.accent, LEVEL_OPACITY[level - 1])
            const textColor = isFuture ? tokens.text3 : level >= 3 ? tokens.onAccent : tokens.text2
            const borderColor = isToday ? tokens.mint : isFuture ? tokens.borderStrong : 'transparent'
            return (
              <DayCell
                key={pos}
                row={i}
                col={j}
                day={c.day}
                isToday={isToday}
                isFuture={isFuture}
                bg={bg}
                textColor={textColor}
                borderColor={borderColor}
                bold={c.day === 1}
                disabled={isFuture || !onSelectDate}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {})
                  onSelectDate?.(c.date)
                }}
                playMountStagger={isMountingRef.current}
              />
            )
          })}
        </View>
      ))}
      <View style={styles.legendRow}>
        <Text style={[styles.legendLabel, { color: tokens.text3 }]}>Less</Text>
        <View style={[styles.legendSwatch, { backgroundColor: tokens.chipActiveBg }]} />
        {LEVEL_OPACITY.map((op, i) => (
          <View key={i} style={[styles.legendSwatch, { backgroundColor: accentAt(tokens.accent, op) }]} />
        ))}
        <Text style={[styles.legendLabel, { color: tokens.text3 }]}>More</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, marginTop: 6 },
  cell: { flex: 1, aspectRatio: 1 },
  filledCell: { alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 },
  legendLabel: { fontSize: 12 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
})
