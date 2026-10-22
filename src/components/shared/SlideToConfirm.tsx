import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { CaretRight } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const HEIGHT = 52
const PAD = 4
const KNOB = HEIGHT - PAD * 2
// How far along the knob has to be when you let go for it to count.
const THRESHOLD = 0.85

/**
 * A slide-to-confirm CTA for the few moments that deserve one: finishing setup,
 * Fresh Start, logging a statement. Not for anything done every day, where a
 * slide is just friction. Tapping does nothing on purpose; screen readers get
 * the "activate" action instead, so it's never slide-only. Callers swap it out
 * for their normal button once saving starts, so the saving fill and the shared
 * CheckIcon success beat stay exactly as they were.
 */
export function SlideToConfirm({ label, onConfirm, disabled = false }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const { tokens } = useTheme()
  const reduceMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const x = useSharedValue(0)
  const armed = useSharedValue(false)
  const max = Math.max(width - KNOB - PAD * 2, 1)

  // One small nudge so the knob reads as something you drag, not a button.
  useEffect(() => {
    if (reduceMotion || disabled || !width) return
    x.value = withDelay(600, withSequence(withTiming(18, { duration: 260 }), withSpring(0, { damping: 9 })))
  }, [reduceMotion, disabled, width, x])

  const tick = () => Haptics.selectionAsync().catch(() => {})

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = Math.min(max, Math.max(0, e.translationX))
      const past = x.value >= max * THRESHOLD
      if (past !== armed.value) {
        armed.value = past
        runOnJS(tick)()
      }
    })
    // Judged on the release, not the last update: a quick flick can end before any update lands.
    .onEnd((e) => {
      if (e.translationX >= max * THRESHOLD) {
        x.value = reduceMotion ? max : withTiming(max, { duration: 120 })
        runOnJS(onConfirm)()
      } else {
        x.value = reduceMotion ? 0 : withSpring(0, { damping: 18, stiffness: 220 })
      }
      armed.value = false
    })

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const trailStyle = useAnimatedStyle(() => ({ width: x.value + KNOB + PAD }))
  const labelStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, max * 0.6], [1, 0], Extrapolation.CLAMP) }))

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Slide right to confirm"
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !disabled) onConfirm()
      }}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={[styles.track, { backgroundColor: disabled ? tokens.inputBg : tokens.accent }]}
    >
      <Animated.View pointerEvents="none" style={[styles.trail, { backgroundColor: tokens.onAccent }, trailStyle]} />
      <Animated.View pointerEvents="none" style={[styles.labelWrap, labelStyle]}>
        <Text numberOfLines={1} style={[styles.label, { color: disabled ? tokens.text3 : tokens.onAccent }]}>{label}</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View hitSlop={12} style={[styles.knob, { backgroundColor: disabled ? tokens.card : tokens.onAccent }, knobStyle]}>
          <CaretRight size={18} weight="bold" color={disabled ? tokens.text3 : tokens.accent} />
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: HEIGHT / 2, justifyContent: 'center', overflow: 'hidden' },
  trail: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: HEIGHT / 2, opacity: 0.18 },
  labelWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: KNOB + PAD * 2 },
  label: { fontFamily: fontFamily.bodyBold, fontSize: 15 },
  knob: { position: 'absolute', left: PAD, width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
})
