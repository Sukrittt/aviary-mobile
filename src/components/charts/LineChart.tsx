import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, type GestureResponderEvent } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import Reanimated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const AnimatedPath = Reanimated.createAnimatedComponent(Path)

const PAD_Y = 8
const DRAW_DURATION = 900

export interface LinePoint {
  /** Any monotonic x (e.g. epoch ms); scaled to the width. */
  x: number
  y: number
}

/** Smooth path through the points: quadratic curves via each point to the
 *  midpoint of the next, which never overshoots the data's min/max. */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    d += ` Q${pts[i].x},${pts[i].y} ${mx},${my}`
  }
  const last = pts[pts.length - 1]
  return `${d} L${last.x},${last.y}`
}

/** Smooth line with a soft gradient fill, drawn on at mount. Touch-dragging
 *  snaps a dot + tooltip to the nearest point. Mirrors Web's LineChart. */
export function LineChart({
  data,
  height = 150,
  color,
  formatX,
  formatY,
}: {
  data: LinePoint[]
  height?: number
  color?: string
  formatX: (x: number) => string
  formatY: (y: number) => string
}) {
  const { tokens } = useTheme()
  const stroke = color ?? tokens.accent
  const reducedMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const draw = useSharedValue(reducedMotion ? 1 : 0)

  useEffect(() => {
    if (!reducedMotion) draw.value = withTiming(1, { duration: DRAW_DURATION, easing: Easing.out(Easing.cubic) })
    // Mount-only: refetches shouldn't replay the draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const xs = data.map((p) => p.x)
  const ys = data.map((p) => p.y)
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const pts = data.map((p) => ({
    x: maxX === minX ? 0 : ((p.x - minX) / (maxX - minX)) * width,
    // Flat series sits mid-height instead of dividing by zero.
    y: maxY === minY ? height / 2 : PAD_Y + (1 - (p.y - minY) / (maxY - minY)) * (height - PAD_Y * 2),
  }))
  const line = smoothPath(pts)
  const area = `${line} L${width},${height} L0,${height} Z`
  // Upper bound on the curve's length: the polyline through the control points.
  const length = pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) + 1

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }))
  const areaProps = useAnimatedProps(() => ({ opacity: draw.value }))

  function scrub(e: GestureResponderEvent) {
    const fx = e.nativeEvent.locationX
    let best = 0
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - fx) < Math.abs(pts[best].x - fx)) best = i
    setActive(best)
  }

  const p = active != null ? pts[active] : null
  const axisText = [styles.axis, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]

  return (
    <View>
      <View
        testID="line-plot"
        style={{ height }}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => true}
        onResponderGrant={scrub}
        onResponderMove={scrub}
        onResponderRelease={() => setActive(null)}
        onResponderTerminate={() => setActive(null)}
      >
        {width > 0 && data.length > 1 && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.25} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <AnimatedPath animatedProps={areaProps} d={area} fill="url(#lineFill)" />
            <AnimatedPath
              animatedProps={lineProps}
              d={line}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${length},${length}`}
            />
            {p && (
              <>
                <Line x1={p.x} x2={p.x} y1={0} y2={height} stroke={tokens.border} strokeWidth={1} />
                <Circle cx={p.x} cy={p.y} r={5} fill={stroke} stroke={tokens.card} strokeWidth={3} />
              </>
            )}
          </Svg>
        )}
        {p && active != null && (
          <View
            pointerEvents="none"
            style={[
              styles.tip,
              {
                backgroundColor: tokens.card,
                borderColor: tokens.border,
                left: Math.min(width - TIP_WIDTH, Math.max(0, p.x - TIP_WIDTH / 2)),
                top: Math.max(0, p.y - 56),
              },
            ]}
          >
            <Text style={[styles.tipValue, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>
              {formatY(data[active].y)}
            </Text>
            <Text style={axisText}>{formatX(data[active].x)}</Text>
          </View>
        )}
      </View>
      <View style={styles.axisRow}>
        <Text style={axisText}>{formatX(minX)}</Text>
        <Text style={axisText}>{formatX(maxX)}</Text>
      </View>
    </View>
  )
}

const TIP_WIDTH = 110

const styles = StyleSheet.create({
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axis: { fontSize: 11 },
  tip: { position: 'absolute', width: TIP_WIDTH, alignItems: 'center', paddingVertical: 5, borderWidth: 1, borderRadius: 10 },
  tipValue: { fontSize: 12 },
})
