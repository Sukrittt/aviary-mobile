import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

// How many letters either side of the band's centre catch some of the light.
const BAND = 3
const PASS = { duration: 1500, easing: Easing.inOut(Easing.quad) }
/** A nudge's rest between passes: long enough to read as "still waiting on you", not "loading". */
export const NUDGE_REST_MS = 3000

/**
 * Drives a soft bright band across some text, left to right. Looping means
 * "in progress" or "needs you now"; a single pass means "just arrived". A
 * single pass runs on mount while `on`, and again each time `on` turns true.
 * `restMs` is the pause between looping passes.
 * Remount with a new key to replay it. Reduced motion: never moves.
 * `running` is false once a single pass is over, so callers can go back to
 * plain text.
 */
export function useSweep(on: boolean, loop = false, restMs = 900) {
  const reduceMotion = useReducedMotion()
  const sweep = useSharedValue(0)
  const [prevOn, setPrevOn] = useState(on)
  const [running, setRunning] = useState(on)
  if (on !== prevOn) {
    setPrevOn(on)
    setRunning(on)
  }
  useEffect(() => {
    if (!on || reduceMotion) return
    sweep.value = 0
    sweep.value = loop
      ? withRepeat(withSequence(withTiming(1, PASS), withDelay(restMs, withTiming(0, { duration: 0 }))), -1)
      : withDelay(250, withTiming(1, PASS, (finished) => {
          if (finished) runOnJS(setRunning)(false)
        }))
    return () => cancelAnimation(sweep)
  }, [on, loop, restMs, reduceMotion, sweep])
  return { sweep, running: on && running && !reduceMotion }
}

/** How lit one letter is as the band passes. A loop rests at 0.78; a single pass fades in and out of full. */
function useShimmerStyle(sweep: SharedValue<number>, index: number, count: number, loop: boolean) {
  return useAnimatedStyle(() => {
    // The band starts off the left edge and finishes off the right, so every pass reads as one motion.
    const centre = -BAND + sweep.value * (count + BAND * 2)
    const lit = Math.max(0, 1 - Math.abs(index - centre) / BAND)
    const depth = loop ? 1 : Math.min(1, 4 * Math.min(sweep.value, 1 - sweep.value))
    return { opacity: 1 - (1 - lit) * 0.22 * depth }
  })
}

/** One slot (a letter, an odometer digit) lit up as the sweep passes over it. */
export function ShimmerSlot({ sweep, index, count, loop = false, children }: { sweep: SharedValue<number>; index: number; count: number; loop?: boolean; children: ReactNode }) {
  return <Animated.View style={useShimmerStyle(sweep, index, count, loop)}>{children}</Animated.View>
}

function ShimmerChar({ ch, index, count, sweep, loop, style }: { ch: string; index: number; count: number; sweep: SharedValue<number>; loop: boolean; style: StyleProp<TextStyle> }) {
  return <Animated.Text style={[style, useShimmerStyle(sweep, index, count, loop)]}>{ch}</Animated.Text>
}

/**
 * One line of text with the shimmer over it. Plain text when it isn't sweeping.
 * `nudge` is for something waiting on the user: the single pass, again every
 * few seconds, with the text at full strength between passes.
 */
export function ShimmerText({ text, style, on = true, loop = false, nudge = false }: { text: string; style?: StyleProp<TextStyle>; on?: boolean; loop?: boolean; nudge?: boolean }) {
  const { sweep, running } = useSweep(on, loop || nudge, nudge ? NUDGE_REST_MS : undefined)
  if (!running) {
    return <Text numberOfLines={1} style={style}>{text}</Text>
  }
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={text}>
      {Array.from(text).map((ch, i, all) => (
        <ShimmerChar key={i} ch={ch} index={i} count={all.length} sweep={sweep} loop={loop} style={style} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
})
