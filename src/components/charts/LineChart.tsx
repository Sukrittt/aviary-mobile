import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, type GestureResponderEvent } from 'react-native'
import Svg, { Circle, ClipPath, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import Reanimated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { tap } from '@/src/lib/haptics'

const AnimatedPath = Reanimated.createAnimatedComponent(Path)

const PAD_TOP = 36
const PAD_BOTTOM = 8
const DRAW_DURATION = 900
const DAY_MS = 86_400_000

export interface LinePoint {
  /** Epoch ms; scaled to the width. */
  x: number
  y: number
}

/** Step path: holds each value flat until the next point, then moves. Values
 *  that only change at events (manual holdings) never drift in between. */
export function stepPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    d += ` H${pts[i].x}`
    if (pts[i].y !== pts[i - 1].y) d += ` V${pts[i].y}`
  }
  return d
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

/** Step line with a soft gradient fill, drawn on at mount, edge to edge.
 *  Touch-dragging scrubs by day: a date pill rides the crosshair, the line
 *  past it greys out, each new day ticks, and `onScrub` hands the parent the
 *  day and value so the header can show it (null on release). */
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
  const draw = useSharedValue(reducedMotion ? 1 : 0)
  const lastDay = useRef<string | null>(null)

  useEffect(() => {
    if (!reducedMotion) draw.value = withTiming(1, { duration: DRAW_DURATION, easing: Easing.out(Easing.cubic) })
    // Mount-only: refetches shouldn't replay the draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const xs = data.map((p) => p.x)
  const ys = data.map((p) => p.y)
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const toX = (x: number) => (maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * width)
  // Flat series sits mid-plot instead of dividing by zero.
  const toY = (y: number) =>
    maxY === minY ? (PAD_TOP + height - PAD_BOTTOM) / 2 : PAD_TOP + (1 - (y - minY) / (maxY - minY)) * (height - PAD_TOP - PAD_BOTTOM)
  const pts = data.map((p) => ({ x: toX(p.x), y: toY(p.y) }))
  const line = stepPath(pts)
  const area = `${line} L${width},${height} L0,${height} Z`
  const length = pts.reduce((s, p, i) => (i ? s + Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) : 0), 0) + 1

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }))
  const areaProps = useAnimatedProps(() => ({ opacity: draw.value }))

  function scrub(e: GestureResponderEvent) {
    if (width === 0 || maxX === minX) return
    const frac = Math.min(1, Math.max(0, e.nativeEvent.locationX / width))
    // Snap to the nearest local midnight so the readout (and the tick) moves
    // day by day on the same calendar day the date pill shows.
    const snapped = new Date(minX + frac * (maxX - minX) + DAY_MS / 2)
    snapped.setHours(0, 0, 0, 0)
    const x = Math.min(maxX, Math.max(minX, snapped.getTime()))
    const day = new Date(x).toDateString()
    if (day === lastDay.current) return
    tap()
    lastDay.current = day
    const point = { x, y: heldAt(data, x) }
    setActive(point)
    onScrub?.(point)
  }

  function release() {
    lastDay.current = null
    setActive(null)
    onScrub?.(null)
  }

  const ax = active ? toX(active.x) : null
  const last = pts[pts.length - 1]

  return (
    <View
      testID="line-plot"
      style={{ height }}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onResponderGrant={scrub}
      onResponderMove={scrub}
      onResponderRelease={release}
      onResponderTerminate={release}
    >
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
          {ax != null && <Path d={line} fill="none" stroke={tokens.text3} strokeOpacity={0.5} strokeWidth={2.5} strokeLinejoin="round" />}
          <AnimatedPath animatedProps={areaProps} d={area} fill="url(#lineFill)" clipPath="url(#scrubbed)" />
          <AnimatedPath
            animatedProps={lineProps}
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${length},${length}`}
            clipPath="url(#scrubbed)"
          />
          {active && ax != null ? (
            <>
              <Line x1={ax} x2={ax} y1={PAD_TOP - 6} y2={height} stroke={tokens.text3} strokeWidth={1} />
              <Circle cx={ax} cy={toY(active.y)} r={5} fill={stroke} stroke={tokens.bg} strokeWidth={3} />
            </>
          ) : (
            <Circle cx={last.x} cy={last.y} r={4.5} fill={stroke} stroke={tokens.bg} strokeWidth={2.5} />
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
  )
}

const PILL_WIDTH = 104

const styles = StyleSheet.create({
  pill: { position: 'absolute', top: 0, width: PILL_WIDTH, alignItems: 'center', paddingVertical: 5, borderRadius: 999 },
  pillText: { fontSize: 12 },
})
