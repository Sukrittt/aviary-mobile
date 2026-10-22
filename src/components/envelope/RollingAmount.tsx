import { useEffect, useRef, useState } from 'react'
import { Dimensions, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'

const DURATION_MS = 600

/**
 * A category's Left pill that can roll in what last month left behind: it
 * shows `from` (the amount without the carry), waits until it's on screen,
 * counts to `to` and pops. Each new `play` (above 0) runs it again, so the
 * rollover strip can replay it. With `play` at 0 it's just `to`.
 * Twin of Web's src/components/home/RollingAmount.tsx.
 */
export function RollingAmount({ from, to, play, delayMs = 0, format, style, textStyle }: {
  from: number
  to: number
  play: number
  delayMs?: number
  format: (n: number) => string
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}) {
  const ref = useRef<View>(null)
  const reduceMotion = useReducedMotion()
  // null shows `to`; a number is mid-roll.
  const [shown, setShown] = useState<number | null>(null)
  const [armed, setArmed] = useState(0)
  const scale = useSharedValue(1)
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
    let frame = 0
    const roll = () => {
      const start = Date.now() + delayMs
      const tick = () => {
        const t = Math.max(0, Math.min(1, (Date.now() - start) / DURATION_MS))
        setShown(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))))
        if (t < 1) {
          frame = requestAnimationFrame(tick)
          return
        }
        setShown(null)
        setArmed(0)
        scale.value = withSequence(withTiming(1.12, { duration: 180 }), withSpring(1, { damping: 12, stiffness: 260 }))
      }
      frame = requestAnimationFrame(tick)
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
      cancelAnimationFrame(frame)
    }
  }, [armed]) // eslint-disable-line react-hooks/exhaustive-deps -- from/to are read at the start of a roll

  return (
    <Reanimated.View ref={ref} style={[style, popStyle]}>
      <Text style={textStyle} numberOfLines={1} adjustsFontSizeToFit>
        {format(shown ?? to)}
      </Text>
    </Reanimated.View>
  )
}
