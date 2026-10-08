import { useEffect } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from '@/src/theme/ThemeProvider'

const AnimatedPath = Animated.createAnimatedComponent(Path)
// Length of the "M5 13l4 4L19 7" checkmark path, as in CheckIcon.tsx.
const CHECK_PATH_LENGTH = 19.8
const SIZE = 22
const SLIDE = Easing.bezier(0.22, 1, 0.36, 1)
const OVERSHOOT = Easing.bezier(0.34, 1.56, 0.64, 1)

// Web's multi-select tick (expense-redesign.css .txn-check-slot / .txn-check):
// a zero-width slot beside the avatar grows when select mode starts so the row
// glides right, the ring scales in, and picking a row pops it accent and draws
// its tick. `gap` is the row's flex gap, eaten while the slot is closed.
export function SelectCheck({ selecting, selected, gap }: { selecting: boolean; selected: boolean; gap: number }) {
  const { tokens } = useTheme()
  const reduce = useReducedMotion()
  const open = useSharedValue(selecting ? 1 : 0)
  const ring = useSharedValue(selecting ? 1 : 0)
  const on = useSharedValue(selected ? 1 : 0)
  const pop = useSharedValue(1)
  const draw = useSharedValue(selected ? 0 : CHECK_PATH_LENGTH)

  useEffect(() => {
    const target = selecting ? 1 : 0
    if (reduce) {
      open.value = target
      ring.value = target
      return
    }
    open.value = withTiming(target, { duration: 280, easing: SLIDE })
    ring.value = selecting
      ? withDelay(80, withTiming(1, { duration: 260, easing: OVERSHOOT }))
      : withTiming(0, { duration: 180 })
  }, [selecting, reduce, open, ring])

  useEffect(() => {
    if (reduce) {
      on.value = selected ? 1 : 0
      draw.value = selected ? 0 : CHECK_PATH_LENGTH
      return
    }
    on.value = withTiming(selected ? 1 : 0, { duration: 140 })
    if (selected) {
      pop.value = withSequence(
        withTiming(0.7, { duration: 0 }),
        withTiming(1.18, { duration: 175, easing: OVERSHOOT }),
        withTiming(1, { duration: 145 }),
      )
      draw.value = CHECK_PATH_LENGTH
      draw.value = withDelay(60, withTiming(0, { duration: 260, easing: Easing.out(Easing.ease) }))
    } else {
      draw.value = withTiming(CHECK_PATH_LENGTH, { duration: 120 })
    }
  }, [selected, reduce, on, pop, draw])

  const slotStyle = useAnimatedStyle(() => ({
    width: open.value * SIZE,
    marginRight: (open.value - 1) * gap,
  }))
  const checkStyle = useAnimatedStyle(() => ({
    opacity: ring.value,
    borderColor: on.value > 0.5 ? tokens.accent : tokens.borderStrong,
    backgroundColor: on.value > 0.5 ? tokens.accent : 'transparent',
    transform: [{ scale: (0.5 + ring.value * 0.5) * pop.value }],
  }))
  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: draw.value }))

  return (
    <Animated.View style={[styles.slot, slotStyle]} pointerEvents="none">
      <Animated.View style={[styles.check, checkStyle]}>
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
          <AnimatedPath
            d="M5 13l4 4L19 7"
            stroke={tokens.onAccent}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[CHECK_PATH_LENGTH, CHECK_PATH_LENGTH]}
            animatedProps={pathProps}
          />
        </Svg>
      </Animated.View>
    </Animated.View>
  )
}

// The picked-row wash: fades in under the row content instead of snapping,
// kept lighter than a full accentSoft fill (Web uses a 7% tint).
export function SelectTint({ selected, style }: { selected: boolean; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme()
  const reduce = useReducedMotion()
  const on = useSharedValue(selected ? 1 : 0)
  useEffect(() => {
    on.value = reduce ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, { duration: 160 })
  }, [selected, reduce, on])
  const tintStyle = useAnimatedStyle(() => ({ opacity: on.value * 0.6 }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: tokens.accentSoft }, style, tintStyle]}
    />
  )
}

const styles = StyleSheet.create({
  slot: { height: SIZE, overflow: 'visible' },
  check: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
