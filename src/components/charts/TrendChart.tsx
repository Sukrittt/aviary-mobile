import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Svg, { G, Rect, Line, Text as SvgText } from 'react-native-svg'
import Reanimated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import type { ThemeTokens } from '@/src/theme/tokens'
import { fontFamily } from '@/src/theme/fonts'

import { monthAbbrev } from '@/src/lib/envelope'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { TrendSkeleton } from '@/src/components/shared/TabSkeleton'

const AnimatedRect = Reanimated.createAnimatedComponent(Rect)
const AnimatedLine = Reanimated.createAnimatedComponent(Line)

export interface TrendPoint {
  /** Month key, "YYYY-MM". */
  date: string
  value: number
  /** No income on record for this month: drawn as an outlined placeholder, not a value. */
  missing?: boolean
}

interface Props {
  data: TrendPoint[]
  /** Mean of the trailing months, drawn as a dashed reference line. Omit to
   *  hide it (not enough history yet). */
  baseline?: number | null
  /** Month key of the bar to highlight solid; the rest sit at reduced opacity. */
  selectedKey?: string | null
  height?: number
  hideAmounts?: boolean
  /** Data is still being fetched: hold the chart's space without the empty illustration. */
  loading?: boolean
  /** Tapping a bar moves the screen's selected month. */
  onSelect?: (key: string) => void
  /** Month key still in progress. Its bar stays at full opacity regardless of
   *  selection (opacity means "not selected" everywhere else, and reusing it
   *  for "partial" reads as disabled) and its axis label gets a `*` plus a
   *  caption spelling out what the asterisk means. */
  partialKey?: string | null
  partialNote?: string | null
  /** Shown instead of the chart when `data` is empty. */
  emptyNote?: string
}

/** Bar colour. Dimmed bars are the accent at reduced opacity in light; in dark that
 *  reads as muddy brown, so they go neutral and only the highlighted bars keep colour. */
export function barFill(
  tokens: ThemeTokens,
  scheme: 'light' | 'dark',
  value: number,
  dimmed: boolean,
): { fill: string; fillOpacity: number } {
  if (dimmed && scheme === 'dark') return { fill: tokens.chipActiveBg, fillOpacity: 1 }
  return { fill: value < 0 ? tokens.coral : tokens.accent, fillOpacity: dimmed ? 0.42 : 1 }
}

const PAD_TOP = 30
const PAD_BOTTOM = 28
const PAD_X = 4
const STAGGER_STEP = 30
const GROW_DURATION = 350

interface BarProps {
  x: number
  y: number
  w: number
  h: number
  index: number
  signature: string
  fill: string
  fillOpacity: number
  reducedMotion: boolean
  /** Negative bars hang from the zero line, so they grow downward. */
  downward: boolean
}

/** Single bar, grown from the baseline with a per-index stagger delay. Regrows
 *  whenever `signature` changes (month navigation swaps the data). */
function Bar({ x, y, w, h, index, signature, fill, fillOpacity, reducedMotion, downward }: BarProps) {
  const grow = useSharedValue(reducedMotion ? 1 : 0)

  useEffect(() => {
    grow.value = reducedMotion
      ? 1
      : withDelay(index * STAGGER_STEP, withTiming(1, { duration: GROW_DURATION, easing: Easing.out(Easing.cubic) }))
    // signature (not index) is what should retrigger the grow-in on data swaps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reducedMotion])

  const animatedProps = useAnimatedProps(() => ({
    height: h * grow.value,
    y: downward ? y : y + h * (1 - grow.value),
  }))

  return <AnimatedRect animatedProps={animatedProps} x={x} width={w} rx={7} fill={fill} fillOpacity={fillOpacity} />
}

interface BaselineProps {
  x1: number
  x2: number
  y: number
  /** Starts once the last bar has finished growing. */
  delay: number
  signature: string
  reducedMotion: boolean
  stroke: string
}

/** Dashed average line, drawn left to right after the bars land. Replays
 *  whenever the bars regrow. Its label lives in the header legend: inside the
 *  plot it always ended up sitting on a bar. */
function Baseline({ x1, x2, y, delay, signature, reducedMotion, stroke }: BaselineProps) {
  const draw = useSharedValue(reducedMotion ? 1 : 0)

  useEffect(() => {
    draw.value = 0
    draw.value = reducedMotion
      ? 1
      : withDelay(delay, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reducedMotion])

  const lineProps = useAnimatedProps(() => ({ x2: x1 + (x2 - x1) * draw.value }))

  return (
    <AnimatedLine
      animatedProps={lineProps}
      x1={x1}
      y1={y}
      y2={y}
      stroke={stroke}
      strokeOpacity={0.5}
      strokeWidth={1.5}
      strokeDasharray="4,5"
    />
  )
}

/** Trailing-12-months bar chart. Bars only (a smoothed area over discrete
 *  months implied a continuity that wasn't there) with a dashed baseline so
 *  the card can answer "is this normal" instead of just "it went up". */
export function TrendChart({
  data,
  baseline,
  selectedKey,
  height = 220,
  hideAmounts = false,
  loading = false,
  onSelect,
  partialKey,
  partialNote,
  emptyNote = 'No spending data yet',
}: Props) {
  const { formatCompact } = useCurrency()

  const { tokens, scheme } = useTheme()
  const reducedMotion = useReducedMotion()
  // viewBox tracks the measured width so bars keep true proportions (a fixed
  // viewBox letterboxed the plot into a thin strip on phones).
  const [width, setWidth] = useState(0)
  const signature = data.map((d) => `${d.date}:${d.value}`).join('|')

  if (loading) return <TrendSkeleton height={height} />
  if (data.length === 0) {
    return (
      <EmptyState
        testID="trend-empty"
        compact
        subject="insights"
        title={emptyNote}
        description="A few logged expenses will turn this quiet card into a trend."
        style={{ height }}
      />
    )
  }

  const max = Math.max(...data.map((d) => d.value), baseline ?? 0, 1)
  // Savings can go negative (a month that spent more than it earned): those
  // bars hang below a zero line instead of the chart's floor.
  const min = Math.min(0, ...data.map((d) => d.value))
  const range = max - min
  const n = data.length
  const plotH = height - PAD_TOP - PAD_BOTTOM
  const zeroY = height - PAD_BOTTOM - (-min / range) * plotH
  const slot = (width - PAD_X * 2) / n
  // Bars fill their slot, so they widen/narrow as months are added (matches web).
  const barW = Math.max(6, slot - Math.min(12, slot * 0.2))

  const bars = data.map((d, i) => {
    const h = d.missing
      ? (zeroY - PAD_TOP) * 0.45
      : d.value !== 0 ? Math.max(3, (Math.abs(d.value) / range) * plotH) : 2
    return {
      key: d.date,
      value: d.value,
      missing: d.missing ?? false,
      x: PAD_X + i * slot + (slot - barW) / 2,
      y: d.value < 0 ? zeroY : zeroY - h,
      w: barW,
      h,
    }
  })

  const baselineY = baseline != null ? zeroY - (baseline / range) * plotH : null
  const selected = selectedKey != null ? bars.find((b) => b.key === selectedKey) : undefined
  const labelFont = { fontSize: 12, fontFamily: fontFamily.bodySemiBold }
  const boldFont = { fontSize: 12, fontFamily: fontFamily.bodyExtraBold }

  return (
    <View>
      <View style={styles.header}>
        <Text style={[styles.axisLabel, { color: tokens.text3 }]}>{formatCompact(max, hideAmounts)}</Text>
        {baseline != null && (
          <View style={styles.legend}>
            <Svg width={16} height={2}>
              <Line x1={0} x2={16} y1={1} y2={1} stroke={tokens.text3} strokeWidth={1.5} strokeDasharray="4,3" />
            </Svg>
            <Text style={[styles.legendLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
              avg {formatCompact(baseline, hideAmounts)}
            </Text>
          </View>
        )}
      </View>
      <View style={{ height }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 && (
          <Svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
            {min < 0 && (
              <Line x1={PAD_X} x2={width - PAD_X} y1={zeroY} y2={zeroY} stroke={tokens.text3} strokeWidth={1} strokeOpacity={0.5} />
            )}
            {bars.map((b, i) => {
              const isSelected = selected ? b.key === selected.key : false
              const dimmed = (b.value === 0 && !b.missing) || (selected != null && !isSelected && b.key !== partialKey)
              const cx = b.x + b.w / 2
              return (
                <G key={b.key}>
                  {b.missing ? (
                    <Rect
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      rx={7}
                      fill="none"
                      stroke={tokens.text3}
                      strokeWidth={1.5}
                      strokeDasharray="5,5"
                      strokeOpacity={dimmed ? 0.42 : 1}
                    />
                  ) : (
                    <Bar
                      x={b.x}
                      y={b.y}
                      w={b.w}
                      h={b.h}
                      index={i}
                      signature={signature}
                      {...barFill(tokens, scheme, b.value, dimmed)}
                      reducedMotion={reducedMotion}
                      downward={b.value < 0}
                    />
                  )}
                  {isSelected && (
                    <SvgText
                      x={cx}
                      y={b.value < 0 ? Math.min(height - PAD_BOTTOM - 4, b.y + b.h + 14) : Math.max(15, b.y - 10)}
                      textAnchor="middle"
                      fill={tokens.text}
                      {...boldFont}
                    >
                      {b.missing ? 'Add income' : formatCompact(b.value, hideAmounts)}
                    </SvgText>
                  )}
                  <SvgText
                    x={cx}
                    y={height - 8}
                    textAnchor="middle"
                    fill={isSelected ? tokens.text : tokens.text3}
                    {...(isSelected ? boldFont : labelFont)}
                  >
                    {monthAbbrev(b.key)}
                    {b.key === partialKey ? '*' : ''}
                  </SvgText>
                </G>
              )
            })}
            {/* Drawn after the bars so tall bars don't hide it. */}
            {baselineY != null && (
              <Baseline
                x1={PAD_X}
                x2={width - PAD_X}
                y={baselineY}
                delay={(n - 1) * STAGGER_STEP + GROW_DURATION}
                signature={`${signature}#${baseline}`}
                reducedMotion={reducedMotion}
                stroke={tokens.text3}
              />
            )}
          </Svg>
        )}
        {onSelect && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View style={styles.columnRow}>
              {data.map((d) => (
                <Pressable key={d.date} style={{ flex: 1 }} onPress={() => onSelect(d.date)} />
              ))}
            </View>
          </View>
        )}
      </View>
      {partialKey != null && partialNote && data.some((d) => d.date === partialKey) && (
        <Text style={[styles.partialNote, { color: tokens.text3 }]}>* {partialNote}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  axisLabel: { fontSize: 12, paddingHorizontal: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  legendLabel: { fontSize: 12 },
  columnRow: { flex: 1, flexDirection: 'row' },
  partialNote: { fontSize: 12, paddingHorizontal: 4, paddingTop: 4 },
})
