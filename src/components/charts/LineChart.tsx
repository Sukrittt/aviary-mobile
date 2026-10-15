import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, ClipPath, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Reanimated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { tap } from '@/src/lib/haptics'

const AnimatedPath = Reanimated.createAnimatedComponent(Path)
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle)

const PAD_TOP = 36
const PAD_BOTTOM = 8
// Room for the end dot so it isn't clipped at the right edge.
const PAD_RIGHT = 8
const DRAW_DURATION = 900
const MORPH_DURATION = 450
const DAY_MS = 86_400_000
// The line is drawn through this many evenly spaced samples, so every range
// has the same shape to morph between.
const SAMPLES = 90
// Box-blur radius (in samples) that softens each step into a short curve.
const SOFTEN = 2

export interface LinePoint {
  /** Epoch ms; scaled to the width. */
  x: number
  y: number
}

/** The y held at `x`: the last point at or before it. */
function heldAt(data: LinePoint[], x: number): number {
  let y = data[0].y
  for (const p of data) {
    if (p.x > x) break
    y = p.y
  }
  return y
}

/** The step series sampled at `n` evenly spaced x's, then lightly blurred so
 *  each jump curves over a few samples instead of a hard corner. */
export function sampleSteps(data: LinePoint[], n = SAMPLES, soften = SOFTEN): number[] {
  if (data.length === 0) return []
  const minX = data[0].x
  const span = data[data.length - 1].x - minX
  const raw = Array.from({ length: n }, (_, i) => heldAt(data, minX + (span * i) / (n - 1)))
  return raw.map((_, i) => {
    let sum = 0
    for (let k = -soften; k <= soften; k++) sum += raw[Math.min(n - 1, Math.max(0, i + k))]
    return sum / (soften * 2 + 1)
  })
}

/** The day under `frac` (0..1) of the plot, snapped to local midnight and kept inside the data. */
export function scrubDay(minX: number, maxX: number, frac: number): number {
  const snapped = new Date(minX + Math.min(1, Math.max(0, frac)) * (maxX - minX) + DAY_MS / 2)
  snapped.setHours(0, 0, 0, 0)
  return Math.min(maxX, Math.max(minX, snapped.getTime()))
}

/** Smooth path through evenly spaced ys: quadratic curves via each point to
 *  the midpoint of the next, which never overshoots. */
function curvePath(ys: number[], width: number): string {
  'worklet'
  const n = ys.length
  const x = (i: number) => (n === 1 ? 0 : (i * width) / (n - 1))
  let d = `M0,${ys[0]}`
  for (let i = 1; i < n - 1; i++) d += ` Q${x(i)},${ys[i]} ${(x(i) + x(i + 1)) / 2},${(ys[i] + ys[i + 1]) / 2}`
  return `${d} L${x(n - 1)},${ys[n - 1]}`
}

function mix(from: number[], to: number[], t: number): number[] {
  'worklet'
  if (from.length !== to.length) return to
  return to.map((y, i) => from[i] + (y - from[i]) * t)
}

/** Softened step line with a gradient fill, drawn on at mount and morphed
 *  when the data changes, edge to edge. A horizontal drag (or a press and
 *  hold) scrubs by day: a date pill rides the crosshair, the line past it
 *  greys out, each new day ticks, and `onScrub` hands the parent the day and
 *  value (null on release). Vertical drags fall through to the page scroll. */
export function LineChart({
  data,
  height = 180,
  color,
  formatX,
  onScrub,
}: {
  data: LinePoint[]
  height?: number
  color?: string
  formatX: (x: number) => string
  onScrub?: (point: LinePoint | null) => void
}) {
  const { tokens } = useTheme()
  const stroke = color ?? tokens.accent
  const reducedMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<LinePoint | null>(null)
  const lastDay = useRef<string | null>(null)
  const draw = useSharedValue(reducedMotion ? 1 : 0)
  const fromYs = useSharedValue<number[]>([])
  const toYs = useSharedValue<number[]>([])
  const morph = useSharedValue(1)

  useEffect(() => {
    if (!reducedMotion) draw.value = withTiming(1, { duration: DRAW_DURATION, easing: Easing.out(Easing.cubic) })
    // Mount-only: refetches shouldn't replay the draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const plotW = Math.max(0, width - PAD_RIGHT)
  const minX = data[0]?.x ?? 0
  const maxX = data[data.length - 1]?.x ?? 0
  const samples = sampleSteps(data)
  const [minY, maxY] = [Math.min(...samples), Math.max(...samples)]
  // Flat series sits mid-plot instead of dividing by zero.
  const toY = (y: number) =>
    maxY === minY ? (PAD_TOP + height - PAD_BOTTOM) / 2 : PAD_TOP + (1 - (y - minY) / (maxY - minY)) * (height - PAD_TOP - PAD_BOTTOM)
  const target = samples.map(toY)
  const targetKey = target.join(',')

  useEffect(() => {
    if (width === 0 || target.length === 0) return
    if (toYs.value.length === 0 || reducedMotion) {
      fromYs.value = target
      toYs.value = target
      morph.value = 1
      return
    }
    // Start from wherever the line is now, so a mid-morph switch doesn't jump.
    fromYs.value = mix(fromYs.value, toYs.value, morph.value)
    toYs.value = target
    morph.value = 0
    morph.value = withTiming(1, { duration: MORPH_DURATION, easing: Easing.inOut(Easing.cubic) })
    // targetKey stands in for target's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, width])

  const lineProps = useAnimatedProps(() => {
    const ys = mix(fromYs.value, toYs.value, morph.value)
    if (ys.length === 0) return { d: '', strokeDasharray: [0, 0], strokeDashoffset: 0 }
    // Polyline length bounds the curve's, so the dash fully covers it.
    let len = 1
    for (let i = 1; i < ys.length; i++) len += Math.hypot(plotW / (ys.length - 1), ys[i] - ys[i - 1])
    return { d: curvePath(ys, plotW), strokeDasharray: [len, len], strokeDashoffset: len * (1 - draw.value) }
  })
  const areaProps = useAnimatedProps(() => {
    const ys = mix(fromYs.value, toYs.value, morph.value)
    return { d: ys.length ? `${curvePath(ys, plotW)} L${plotW},${height} L0,${height} Z` : '', opacity: draw.value }
  })
  const greyProps = useAnimatedProps(() => {
    const ys = mix(fromYs.value, toYs.value, morph.value)
    return { d: ys.length ? curvePath(ys, plotW) : '' }
  })
  const endProps = useAnimatedProps(() => {
    const ys = mix(fromYs.value, toYs.value, morph.value)
    return { cy: ys.length ? ys[ys.length - 1] : 0 }
  })

  function scrub(locationX: number) {
    if (plotW === 0 || maxX === minX) return
    const x = scrubDay(minX, maxX, locationX / plotW)
    const day = new Date(x).toDateString()
    if (day === lastDay.current) return
    tap()
    lastDay.current = day
    const point = { x, y: heldAt(data, x) }
    setActive(point)
    onScrub?.(point)
  }

  function release() {
    if (lastDay.current == null) return
    lastDay.current = null
    setActive(null)
    onScrub?.(null)
  }

  // A sideways drag scrubs at once; a vertical one fails it so the page
  // scrolls. Press and hold scrubs too, for picking a day without sliding.
  const slide = Gesture.Pan().activeOffsetX([-6, 6]).failOffsetY([-10, 10])
  const hold = Gesture.Pan().activateAfterLongPress(220)
  for (const g of [slide, hold]) {
    g.runOnJS(true)
      .onStart((e) => scrub(e.x))
      .onUpdate((e) => scrub(e.x))
      // onEnd, not onFinalize: the gesture that loses the race finalizes too,
      // and mustn't clear the one still scrubbing.
      .onEnd(release)
  }

  const ax = active ? ((active.x - minX) / (maxX - minX || 1)) * plotW : null
  const activeY = active && ax != null ? target[Math.round((ax / (plotW || 1)) * (SAMPLES - 1))] : 0

  return (
    <GestureDetector gesture={Gesture.Race(slide, hold)}>
      <View testID="line-plot" style={{ height }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 && data.length > 1 && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.25} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </LinearGradient>
              <ClipPath id="scrubbed">
                <Rect x={0} y={0} width={ax ?? width} height={height} />
              </ClipPath>
            </Defs>
            {ax != null && (
              <AnimatedPath animatedProps={greyProps} fill="none" stroke={tokens.text3} strokeOpacity={0.5} strokeWidth={2.5} strokeLinejoin="round" />
            )}
            <AnimatedPath animatedProps={areaProps} fill="url(#lineFill)" clipPath="url(#scrubbed)" />
            <AnimatedPath
              animatedProps={lineProps}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              clipPath="url(#scrubbed)"
            />
            {ax != null ? (
              <>
                <Line x1={ax} x2={ax} y1={PAD_TOP - 6} y2={height} stroke={tokens.text3} strokeWidth={1} />
                <Circle cx={ax} cy={activeY} r={5} fill={stroke} stroke={tokens.bg} strokeWidth={3} />
              </>
            ) : (
              <AnimatedCircle animatedProps={endProps} cx={plotW} r={4.5} fill={stroke} stroke={tokens.bg} strokeWidth={2.5} />
            )}
          </Svg>
        )}
        {active && ax != null && (
          <View
            pointerEvents="none"
            style={[
              styles.pill,
              { backgroundColor: tokens.pillBg, left: Math.min(width - PILL_WIDTH, Math.max(0, ax - PILL_WIDTH / 2)) },
            ]}
          >
            <Text style={[styles.pillText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{formatX(active.x)}</Text>
          </View>
        )}
      </View>
    </GestureDetector>
  )
}

const PILL_WIDTH = 104

const styles = StyleSheet.create({
  pill: { position: 'absolute', top: 0, width: PILL_WIDTH, alignItems: 'center', paddingVertical: 5, borderRadius: 999 },
  pillText: { fontSize: 12 },
})
