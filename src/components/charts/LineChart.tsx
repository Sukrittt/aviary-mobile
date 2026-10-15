import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { tap } from '@/src/lib/haptics'

const AnimatedPath = Reanimated.createAnimatedComponent(Path)
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle)
const AnimatedLine = Reanimated.createAnimatedComponent(Line)
const AnimatedRect = Reanimated.createAnimatedComponent(Rect)

const PAD_TOP = 36
const PAD_BOTTOM = 8
// Room for the end dot so it isn't clipped at the right edge.
const PAD_RIGHT = 8
const DRAW_DURATION = 900
const MORPH_DURATION = 450
// How long a press must hold before the chart starts scrubbing.
const HOLD_MS = 400
const PILL_WIDTH = 104
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
  'worklet'
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
 *  when the data changes, edge to edge. Press and hold, then slide, to scrub
 *  by day: a date pill rides the crosshair, the line past it fades, each
 *  new day ticks, and `onScrub` hands the parent the day and value (null on
 *  release). Taps and quick drags fall through to the page scroll. */
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
  // Finger x on the plot, -1 when not scrubbing. Lives on the UI thread so
  // the crosshair tracks the finger without a JS round trip.
  const scrubX = useSharedValue(-1)
  const lastDay = useSharedValue(-1)
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

  const endProps = useAnimatedProps(() => {
    const ys = mix(fromYs.value, toYs.value, morph.value)
    return { cy: ys.length ? ys[ys.length - 1] : 0, opacity: scrubX.value < 0 ? 1 : 0 }
  })
  const veilProps = useAnimatedProps(() => ({
    x: Math.max(0, scrubX.value),
    width: scrubX.value < 0 ? 0 : width - scrubX.value,
    opacity: scrubX.value < 0 ? 0 : 0.65,
  }))
  const crossProps = useAnimatedProps(() => ({ x1: scrubX.value, x2: scrubX.value, opacity: scrubX.value < 0 ? 0 : 1 }))
  const dotProps = useAnimatedProps(() => {
    const ys = mix(fromYs.value, toYs.value, morph.value)
    const i = Math.round((Math.max(0, scrubX.value) / (plotW || 1)) * (ys.length - 1))
    return { cx: scrubX.value, cy: ys[i] ?? 0, opacity: scrubX.value < 0 ? 0 : 1 }
  })
  const pillStyle = useAnimatedStyle(() => ({
    opacity: scrubX.value < 0 ? 0 : 1,
    transform: [{ translateX: Math.min(width - PILL_WIDTH, Math.max(0, scrubX.value - PILL_WIDTH / 2)) }],
  }))

  // JS side of a scrub, only on a new day: tick, readout, header. The
  // gesture is built once, so it reaches the latest data through a ref, and
  // hands runOnJS stable functions defined on the JS runtime.
  const latest = useRef({ data, onScrub })
  latest.current = { data, onScrub }
  const emitDay = useCallback((x: number) => {
    tap()
    const point = { x, y: heldAt(latest.current.data, x) }
    setActive(point)
    latest.current.onScrub?.(point)
  }, [])
  const emitRelease = useCallback(() => {
    setActive(null)
    latest.current.onScrub?.(null)
  }, [])

  // Geometry the UI-thread gesture reads; a closure would freeze the first
  // render's values (width 0 before layout).
  const geo = useSharedValue({ plotW: 0, minX: 0, maxX: 0 })
  useEffect(() => {
    geo.value = { plotW, minX, maxX }
  }, [geo, plotW, minX, maxX])

  // Like Fold: press and hold to wake the chart, then slide. A tap or a drag
  // that moves before the hold lands fails it, so the page still scrolls.
  // Runs on the UI thread; only day changes hop to JS.
  const hold = useMemo(() => {
    const follow = (fingerX: number) => {
      'worklet'
      const { plotW: w, minX: lo, maxX: hi } = geo.value
      if (w === 0 || hi === lo) return
      scrubX.value = Math.min(w, Math.max(0, fingerX))
      const day = scrubDay(lo, hi, scrubX.value / w)
      if (day === lastDay.value) return
      lastDay.value = day
      runOnJS(emitDay)(day)
    }
    return Gesture.Pan()
      .activateAfterLongPress(HOLD_MS)
      .onStart((e) => follow(e.x))
      .onUpdate((e) => follow(e.x))
      .onFinalize(() => {
        if (scrubX.value < 0) return
        scrubX.value = -1
        lastDay.value = -1
        runOnJS(emitRelease)()
      })
  }, [geo, scrubX, lastDay, emitDay, emitRelease])

  return (
    <GestureDetector gesture={hold}>
      <View testID="line-plot" style={{ height }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 && data.length > 1 && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.25} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <AnimatedPath animatedProps={areaProps} fill="url(#lineFill)" />
            <AnimatedPath
              animatedProps={lineProps}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Fades the line past the finger. A veil, not an animated ClipPath:
                react-native-svg doesn't redraw a clip when its rect changes. */}
            <AnimatedRect animatedProps={veilProps} y={0} height={height} fill={tokens.bg} />
            <AnimatedLine animatedProps={crossProps} y1={PAD_TOP - 6} y2={height} stroke={tokens.text3} strokeWidth={1} />
            <AnimatedCircle animatedProps={dotProps} r={5} fill={stroke} stroke={tokens.bg} strokeWidth={3} />
            <AnimatedCircle animatedProps={endProps} cx={plotW} r={4.5} fill={stroke} stroke={tokens.bg} strokeWidth={2.5} />
          </Svg>
        )}
        <Reanimated.View pointerEvents="none" style={[styles.pill, { backgroundColor: tokens.pillBg }, pillStyle]}>
          <Text style={[styles.pillText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
            {active ? formatX(active.x) : ''}
          </Text>
        </Reanimated.View>
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  pill: { position: 'absolute', top: 0, left: 0, width: PILL_WIDTH, alignItems: 'center', paddingVertical: 5, borderRadius: 999 },
  pillText: { fontSize: 12 },
})
