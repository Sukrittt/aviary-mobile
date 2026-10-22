import { useEffect, useRef, useState } from 'react'
import { Dimensions, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Reanimated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { AmountText } from '@/src/components/ui/AmountText'
import type { fontFamily } from '@/src/theme/fonts'

// Slow enough to follow: a beat on the old amount, then the odometer ticks
// through a few eased steps (big jumps first) before it lands.
const HOLD_MS = 500
const STEP_MS = 300
const STEPS = 5
const SPLASH_MS = 620
const DOTS = 10

type Tone = { color: string; bg: string }

/** The amounts each tick lands on, eased out so the last ticks are small. Twin of Web's rollSteps. */
export function rollSteps(from: number, to: number, steps = STEPS): number[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps
    return i === steps - 1 ? to : Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)))
  })
}

/**
 * A category's Left pill that can roll in what last month left behind: it
 * shows `from` (the amount without the carry), waits until it's on screen,
 * ticks to `to` on AmountText's odometer, then pops and splashes. Each new
 * `play` (above 0) runs it again, so the rollover strip can replay it. With
 * `play` at 0 it's just `to`.
 * While it ticks it takes `tones.up` going up and `tones.down` going down (a
 * shortfall eating into this month), then settles back into `color`/`style`.
 * Twin of Web's src/components/home/RollingAmount.tsx.
 */
export function RollingAmount({ from, to, play, delayMs = 0, style, color, size, weight, tones }: {
  from: number
  to: number
  play: number
  delayMs?: number
  style?: StyleProp<ViewStyle>
  color: string
  size: number
  weight: keyof typeof fontFamily
  tones?: { up: Tone; down: Tone }
}) {
  const ref = useRef<View>(null)
  const reduceMotion = useReducedMotion()
  // null shows `to`; a number is mid-roll.
  const [shown, setShown] = useState<number | null>(null)
  const [armed, setArmed] = useState(0)
  const [box, setBox] = useState({ w: 64, h: 20 })
  const scale = useSharedValue(1)
  const burst = useSharedValue(0)
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  // A new play goes back to the old amount during render, so the new one never
  // flashes first. Re-renders with the same play leave a roll alone.
  const [seenPlay, setSeenPlay] = useState(0)
  if (play !== seenPlay) {
    setSeenPlay(play)
    if (play > 0 && !reduceMotion && from !== to) {
      setShown(from)
      setArmed(play)
    }
  }

  useEffect(() => {
    if (!armed) return
    let started = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const roll = () => {
      const steps = rollSteps(from, to)
      steps.forEach((n, i) => timers.push(setTimeout(() => setShown(n), HOLD_MS + delayMs + i * STEP_MS)))
      // After the last tick's odometer roll: settle, pop, splash.
      timers.push(setTimeout(() => {
        setShown(null)
        setArmed(0)
        scale.value = withSequence(withTiming(1.12, { duration: 180 }), withSpring(1, { damping: 12, stiffness: 260 }))
        burst.value = 0
        burst.value = withTiming(1, { duration: SPLASH_MS, easing: Easing.out(Easing.cubic) })
      }, HOLD_MS + delayMs + steps.length * STEP_MS))
    }
    // No IntersectionObserver here: look until most of the pill is on screen.
    // ponytail: polls every 200ms while armed; a scroll listener if this ever shows up in a profile.
    const look = () => ref.current?.measureInWindow((_x, y, _w, h) => {
      if (started || !h || y < 0 || y + h * 0.6 > Dimensions.get('window').height) return
      started = true
      clearInterval(poll)
      roll()
    })
    const poll = setInterval(look, 200)
    look()
    return () => {
      clearInterval(poll)
      timers.forEach(clearTimeout)
    }
  }, [armed]) // eslint-disable-line react-hooks/exhaustive-deps -- from/to are read at the start of a roll

  const tone = shown !== null && tones ? (to < from ? tones.down : tones.up) : null
  return (
    <View>
      <Reanimated.View
        ref={ref}
        testID="rolling-pill"
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={[style, tone && { backgroundColor: tone.bg }, popStyle]}
      >
        <AmountText value={shown ?? to} size={size} weight={weight} color={tone?.color ?? color} animate />
      </Reanimated.View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
        {Array.from({ length: DOTS }, (_, i) => (
          <SplashDot key={i} angle={(i / DOTS) * Math.PI * 2} rx={box.w / 2 + 12} ry={box.h / 2 + 10} color={color} burst={burst} />
        ))}
      </View>
    </View>
  )
}

/** One dot of the landing burst: flies off the pill's edge along an ellipse the pill's shape and fades. */
function SplashDot({ angle, rx, ry, color, burst }: { angle: number; rx: number; ry: number; color: string; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = burst.value
    const r = 0.55 + 0.45 * t
    return {
      opacity: t > 0 && t < 1 ? 1 - t : 0,
      transform: [{ translateX: Math.cos(angle) * rx * r }, { translateY: Math.sin(angle) * ry * r }, { scale: 1 - 0.8 * t }],
    }
  })
  return <Reanimated.View style={[styles.dot, { backgroundColor: color }, style]} />
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5 },
})
