import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const VISIBLE_MS = 2600
// Bouncier than motion.spring: the drop-in should land with a little overshoot.
export const DROP_SPRING = { mass: 0.8, damping: 13, stiffness: 190 }

/** Shared with MaintenanceBanner. Reduced motion keeps only the fade. */
export function dropInStyle(progress: number, bump = 1, wiggle = 0, reduceMotion = false) {
  'worklet'
  return {
    opacity: Math.max(0, Math.min(1, progress * 1.5)),
    transform: reduceMotion ? [] : [
      { translateY: (1 - progress) * -24 },
      { scaleX: (0.94 + progress * 0.06) * bump },
      { scaleY: (0.9 + progress * 0.1) / bump },
      { rotate: `${wiggle * 1.5}deg` },
    ],
  }
}

/**
 * A warm floating notice that squashes a little as it lands, and floats
 * back up after VISIBLE_MS. Bump `trigger` to show it; bumping again while it's
 * up wiggles it and restarts the timer instead of re-entering. An empty
 * `message` hides it early (e.g. the user fixed what it was nagging about).
 */
export function Toast({
  message,
  trigger,
  icon: Icon,
  style,
}: {
  message: string
  trigger: number
  icon?: LucideIcon
  style?: StyleProp<ViewStyle>
}) {
  const { tokens, space, radius, type, elevation, motion } = useTheme()
  const reduceMotion = useReducedMotion()
  const [shown, setShown] = useState(false)
  const [seenTrigger, setSeenTrigger] = useState(trigger)
  // Last non-empty copy, so the exit animation doesn't flash an empty pill.
  const [text, setText] = useState(message)
  if (message && message !== text) setText(message)
  if (trigger !== seenTrigger) {
    setSeenTrigger(trigger)
    if (trigger > 0 && message) setShown(true)
  }
  if (!message && shown) setShown(false)

  // Whether the pill was already up when this trigger landed (wiggle vs drop-in).
  const upRef = useRef(false)
  const progress = useSharedValue(0)
  const wiggle = useSharedValue(0)
  const bump = useSharedValue(1)
  const badge = useSharedValue(0)

  useEffect(() => {
    if (!shown) {
      upRef.current = false
      progress.value = withTiming(0, { duration: motion.base, easing: Easing.bezier(0.23, 1, 0.32, 1) })
      badge.value = withTiming(0, { duration: motion.fast })
      cancelAnimation(wiggle)
      cancelAnimation(bump)
      wiggle.value = 0
      bump.value = 1
      return
    }
    if (!upRef.current) {
      upRef.current = true
      progress.value = reduceMotion ? withTiming(1, { duration: motion.fast }) : withSpring(1, DROP_SPRING)
      badge.value = reduceMotion ? 1 : withDelay(60, withSpring(1, motion.springTight))
    } else if (!reduceMotion) {
      wiggle.value = withSequence(
        withTiming(-1, { duration: 50 }),
        withTiming(1, { duration: 90 }),
        withTiming(-0.5, { duration: 80 }),
        withTiming(0, { duration: 60 }),
      )
      bump.value = withSequence(withTiming(1.025, { duration: motion.fast }), withSpring(1, motion.springTight))
      badge.value = withSequence(withTiming(0.85, { duration: motion.fast }), withSpring(1, motion.springTight))
    }
    const timer = setTimeout(() => setShown(false), VISIBLE_MS)
    return () => clearTimeout(timer)
    // Re-runs per trigger so a repeat tap wiggles and restarts the timer.
  }, [shown, trigger, reduceMotion, progress, wiggle, bump, badge, motion])

  useEffect(() => () => {
    cancelAnimation(progress)
    cancelAnimation(wiggle)
    cancelAnimation(bump)
    cancelAnimation(badge)
  }, [progress, wiggle, bump, badge])

  const animStyle = useAnimatedStyle(() => dropInStyle(progress.value, bump.value, wiggle.value, reduceMotion))
  const badgeStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [
      { scale: 0.9 + badge.value * 0.1 },
      { rotate: `${(1 - badge.value) * -12}deg` },
    ],
  }))

  return (
    <Reanimated.View pointerEvents="none" style={[styles.wrap, style, animStyle]}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityElementsHidden={!shown}
        importantForAccessibility={shown ? 'yes' : 'no-hide-descendants'}
        style={[
          styles.pill,
          elevation.floating,
          {
            backgroundColor: tokens.toastBg,
            borderColor: tokens.toastEdge,
            borderRadius: radius.xl,
            paddingLeft: Icon ? space.sm : space.lg,
            paddingRight: space.lg,
            gap: space.md,
          },
        ]}
      >
        {Icon ? (
          <View style={styles.badgeWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.badgeBack, { backgroundColor: tokens.accentSoft, borderRadius: radius.md }]} />
            <Reanimated.View style={[styles.badge, { backgroundColor: tokens.accent, borderRadius: radius.md }, badgeStyle]}>
              <Icon size={18} color="#ffffff" strokeWidth={2.3} />
            </Reanimated.View>
          </View>
        ) : null}
        <Text
          style={{ flexShrink: 1, color: tokens.toastText, fontFamily: fontFamily.bodyBold, fontSize: type.body, lineHeight: 21 }}
        >
          {text}
        </Text>
      </View>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, minHeight: 58, maxWidth: '90%', borderWidth: 1 },
  badgeWrap: { width: 36, height: 36 },
  badgeBack: { ...StyleSheet.absoluteFill, transform: [{ rotate: '-12deg' }] },
  badge: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
})
