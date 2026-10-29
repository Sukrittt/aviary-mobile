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

/**
 * `loop`: "in progress", a soft band with the text resting at 78%.
 * `once`: "just arrived", one soft pass.
 * `nudge`: "needs you", a bright streak running nonstop across text at full strength.
 */
export type SweepMode = 'once' | 'loop' | 'nudge'

// How many letters either side of the band's centre catch some of the light.
const BAND = 3
// The nudge's streak is narrower, so it reads as a glint rather than a wash.
const NUDGE_BAND = 2
const PASS = { duration: 1500, easing: Easing.inOut(Easing.quad) }
const NUDGE_PASS = { duration: 1800, easing: Easing.inOut(Easing.quad) }

/**
 * Drives a band across some text, left to right (see SweepMode). A single
 * pass runs on mount while `on`, and again each time `on` turns true.
 * Remount with a new key to replay it. Reduced motion: never moves.
 * `running` is false once a single pass is over, so callers can go back to
 * plain text.
 */
export function useSweep(on: boolean, mode: SweepMode = 'once') {
  const reduceMotion = useReducedMotion()
  const sweep = useSharedValue(0)
  const [prevOn, setPrevOn] = useState(on)
  const [running, setRunning] = useState(on)
  if (on !== prevOn) {
    setPrevOn(on)
    setRunning(on)
  }
  useEffect(() => {
    // Off mid-pass: back to rest, not frozen where it was, or some letters stay dim.
    if (!on || reduceMotion) {
      sweep.value = 0
      return
    }
    sweep.value = 0
    sweep.value = mode === 'nudge'
      ? withRepeat(withTiming(1, NUDGE_PASS), -1, false)
      : mode === 'loop'
        ? withRepeat(withSequence(withTiming(1, PASS), withDelay(900, withTiming(0, { duration: 0 }))), -1)
        : withDelay(250, withTiming(1, PASS, (finished) => {
            if (finished) runOnJS(setRunning)(false)
          }))
    return () => cancelAnimation(sweep)
  }, [on, mode, reduceMotion, sweep])
  return { sweep, running: on && running && !reduceMotion }
}

/**
 * How strong one letter is as the band passes. A loop rests at 0.78 and the band
 * lifts it to full; a single pass fades that dip in and out; a nudge stays at full
 * and the streak fades it to 0.3, so on dark text it reads as light.
 */
function useShimmerStyle(sweep: SharedValue<number>, index: number, count: number, mode: SweepMode) {
  return useAnimatedStyle(() => {
    const band = mode === 'nudge' ? NUDGE_BAND : BAND
    // The band starts off the left edge and finishes off the right, so every pass reads as one motion.
    const centre = -band + sweep.value * (count + band * 2)
    const lit = Math.max(0, 1 - Math.abs(index - centre) / band)
    if (mode === 'nudge') return { opacity: 1 - lit * 0.7 }
    const depth = mode === 'loop' ? 1 : Math.min(1, 4 * Math.min(sweep.value, 1 - sweep.value))
    return { opacity: 1 - (1 - lit) * 0.22 * depth }
  })
}

/** One slot (a letter, an odometer digit) lit up as the sweep passes over it. */
export function ShimmerSlot({ sweep, index, count, mode = 'once', children }: { sweep: SharedValue<number>; index: number; count: number; mode?: SweepMode; children: ReactNode }) {
  return <Animated.View style={useShimmerStyle(sweep, index, count, mode)}>{children}</Animated.View>
}

function ShimmerChar({ ch, index, count, sweep, mode, style }: { ch: string; index: number; count: number; sweep: SharedValue<number>; mode: SweepMode; style: StyleProp<TextStyle> }) {
  return <Animated.Text style={[style, useShimmerStyle(sweep, index, count, mode)]}>{ch}</Animated.Text>
}

/**
 * One line of text with the shimmer over it. Plain text when it isn't sweeping.
 * `loop` for "in progress", `nudge` for something waiting on the user (see SweepMode).
 */
export function ShimmerText({ text, style, on = true, loop = false, nudge = false }: { text: string; style?: StyleProp<TextStyle>; on?: boolean; loop?: boolean; nudge?: boolean }) {
  const mode: SweepMode = nudge ? 'nudge' : loop ? 'loop' : 'once'
  const { sweep, running } = useSweep(on, mode)
  if (!running) {
    return <Text numberOfLines={1} style={style}>{text}</Text>
  }
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={text}>
      {Array.from(text).map((ch, i, all) => (
        <ShimmerChar key={i} ch={ch} index={i} count={all.length} sweep={sweep} mode={mode} style={style} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
})
