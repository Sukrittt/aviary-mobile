import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Path, G } from 'react-native-svg'
import Reanimated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const AnimatedPath = Reanimated.createAnimatedComponent(Path)

export interface DonutSegment {
  key: string
  label: string
  value: number
  color: string
}

interface Props {
  segments: DonutSegment[]
  selectedKey: string | null
  onSelect: (key: string | null) => void
  size?: number
  thickness?: number
  /** Bumped for entrance and scope-change wipes. Ordinary segment updates
   * morph from their previous angular layout. */
  revealKey?: number
  children?: React.ReactNode
}

const DEFAULT_SIZE = 200
const DEFAULT_THICKNESS = 28
const SWEEP_DELAY = 80
const SWEEP_DURATION = 450
export const DONUT_MORPH_DURATION = 420
const LIFT = 6

function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number) {
  'worklet'
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  'worklet'
  const start = pointOnCircle(cx, cy, r, startDeg)
  const end = pointOnCircle(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M${start.x},${start.y} A${r},${r} 0 ${largeArc} 1 ${end.x},${end.y}`
}

export interface DonutArcLayout {
  key: string
  seg: DonutSegment
  startDeg: number
  endDeg: number
}

export interface DonutArcTransition {
  key: string
  seg: DonutSegment
  fromStartDeg: number
  fromEndDeg: number
  toStartDeg: number
  toEndDeg: number
  fromOpacity: number
  toOpacity: number
  exiting: boolean
}

/** Pure helpers keep angle and enter/exit behavior testable without native frames. */
export function layoutDonutSegments(segments: DonutSegment[]): DonutArcLayout[] {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  if (total <= 0) return []
  let cursor = 0
  return segments
    .filter((segment) => segment.value > 0)
    .map((seg) => {
      const startDeg = cursor
      const endDeg = cursor + (seg.value / total) * 360
      cursor = endDeg
      return { key: seg.key, seg, startDeg, endDeg }
    })
}

export function buildDonutTransition(previous: DonutArcLayout[], next: DonutArcLayout[]): DonutArcTransition[] {
  const previousByKey = new Map(previous.map((arc) => [arc.key, arc]))
  const nextByKey = new Map(next.map((arc) => [arc.key, arc]))

  const enteringAndSurviving = next.map((target) => {
    const source = previousByKey.get(target.key)
    return {
      key: target.key,
      seg: target.seg,
      fromStartDeg: source?.startDeg ?? target.startDeg,
      fromEndDeg: source?.endDeg ?? target.startDeg,
      toStartDeg: target.startDeg,
      toEndDeg: target.endDeg,
      fromOpacity: source ? 1 : 0,
      toOpacity: 1,
      exiting: false,
    }
  })

  const exiting = previous
    .filter((source) => !nextByKey.has(source.key))
    .map((source) => ({
      key: source.key,
      seg: source.seg,
      fromStartDeg: source.startDeg,
      fromEndDeg: source.endDeg,
      toStartDeg: source.startDeg,
      toEndDeg: source.startDeg,
      fromOpacity: 1,
      toOpacity: 0,
      exiting: true,
    }))

  return [...enteringAndSurviving, ...exiting]
}

interface SliceProps extends DonutArcTransition {
  cx: number
  cy: number
  r: number
  thickness: number
  entranceSweep: SharedValue<number>
  isSelected: boolean
  anySelected: boolean
  reducedMotion: boolean
  onPress: () => void
}

function DonutSlice({
  seg,
  fromStartDeg,
  fromEndDeg,
  toStartDeg,
  toEndDeg,
  cx,
  cy,
  r,
  thickness,
  entranceSweep,
  isSelected,
  anySelected,
  reducedMotion,
  exiting,
  fromOpacity,
  toOpacity,
  onPress,
}: SliceProps) {
  const { motion } = useTheme()
  const morph = useSharedValue(reducedMotion ? 1 : 0)
  const state = isSelected ? 2 : anySelected ? 0 : 1
  const emphasis = useSharedValue(state)

  useEffect(() => {
    morph.value = reducedMotion
      ? 1
      : withTiming(1, { duration: DONUT_MORPH_DURATION, easing: Easing.inOut(Easing.cubic) })
  }, [morph, reducedMotion])

  useEffect(() => {
    emphasis.value = reducedMotion ? state : withSpring(state, motion.spring)
  }, [emphasis, motion.spring, reducedMotion, state])

  const animatedProps = useAnimatedProps(() => {
    const startDeg = interpolate(morph.value, [0, 1], [fromStartDeg, toStartDeg])
    const rawEndDeg = interpolate(morph.value, [0, 1], [fromEndDeg, toEndDeg])
    const endDeg = Math.min(rawEndDeg, startDeg + 359.999)
    const span = Math.max(0.001, endDeg - startDeg)
    const len = 2 * Math.PI * r * (span / 360)
    const revealedAngle = entranceSweep.value * 360
    const revealedFraction = Math.max(0, Math.min(1, (revealedAngle - startDeg) / span))
    const mid = (startDeg + endDeg) / 2
    const direction = pointOnCircle(0, 0, 1, mid)
    const lift = interpolate(emphasis.value, [0, 1, 2], [0, 0, LIFT])
    const selectionOpacity = interpolate(emphasis.value, [0, 1, 2], [0.35, 1, 1])
    const morphOpacity = interpolate(morph.value, [0, 1], [fromOpacity, toOpacity])

    return {
      d: arcPath(cx, cy, r, startDeg, endDeg),
      strokeWidth: interpolate(emphasis.value, [0, 1, 2], [thickness, thickness, thickness + 4]),
      strokeOpacity: selectionOpacity * morphOpacity,
      strokeDasharray: [len, len],
      strokeDashoffset: len * (1 - revealedFraction),
      translateX: direction.x * lift,
      translateY: direction.y * lift,
    }
  })

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      fill="none"
      stroke={seg.color}
      strokeLinecap="butt"
      onPress={exiting ? undefined : onPress}
    />
  )
}

/** Interactive donut whose segment changes morph in place. */
export function DonutChart({
  segments,
  selectedKey,
  onSelect,
  size = DEFAULT_SIZE,
  thickness = DEFAULT_THICKNESS,
  revealKey,
  children,
}: Props) {
  const { tokens } = useTheme()
  const reducedMotion = useReducedMotion()
  const nextLayout = useMemo(() => layoutDonutSegments(segments), [segments])
  const nextSignature = nextLayout.map((arc) => `${arc.key}:${arc.seg.value}:${arc.seg.color}`).join('|')
  const previousLayout = useRef(nextLayout)
  const [transitionKey, setTransitionKey] = useState(0)
  const [renderedArcs, setRenderedArcs] = useState<DonutArcTransition[]>(() =>
    buildDonutTransition(nextLayout, nextLayout),
  )
  const entranceSweep = useSharedValue(revealKey == null || reducedMotion ? 1 : 0)

  useEffect(() => {
    const transition = buildDonutTransition(previousLayout.current, nextLayout)
    previousLayout.current = nextLayout
    setRenderedArcs(transition)
    setTransitionKey((key) => key + 1)

    if (reducedMotion || !transition.some((arc) => arc.exiting)) return
    const id = setTimeout(() => {
      setRenderedArcs(buildDonutTransition(nextLayout, nextLayout))
    }, DONUT_MORPH_DURATION + 30)
    return () => clearTimeout(id)
    // nextSignature is a value-based detector; array identity alone would
    // retrigger this effect on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextSignature, reducedMotion])

  useEffect(() => {
    if (revealKey == null || reducedMotion) {
      entranceSweep.value = 1
      return
    }
    if (!nextLayout.length || !revealKey) return
    cancelAnimation(entranceSweep)
    entranceSweep.value = 0
    entranceSweep.value = withDelay(
      SWEEP_DELAY,
      withTiming(1, { duration: SWEEP_DURATION, easing: Easing.inOut(Easing.cubic) }),
    )
  }, [entranceSweep, nextLayout.length, reducedMotion, revealKey])

  if (!nextLayout.length) {
    return (
      <View style={[styles.empty, { width: size, height: size }]}>
        <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: 12 }}>
          No spending data yet
        </Text>
      </View>
    )
  }

  const cx = size / 2
  const cy = size / 2
  const r = (size - thickness) / 2 - (LIFT + 2)

  function toggle(key: string) {
    onSelect(selectedKey === key ? null : key)
  }

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G>
          {renderedArcs.map((arc) => (
            <DonutSlice
              {...arc}
              key={`${transitionKey}:${arc.key}`}
              cx={cx}
              cy={cy}
              r={r}
              thickness={thickness}
              entranceSweep={entranceSweep}
              isSelected={!arc.exiting && selectedKey === arc.key}
              anySelected={selectedKey != null}
              reducedMotion={reducedMotion}
              onPress={() => toggle(arc.key)}
            />
          ))}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="box-none">
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
})
