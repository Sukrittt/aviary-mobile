import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import Svg, { Path } from 'react-native-svg'
import { CaretRight, type PhosphorIcon } from '@/src/components/shared/icons'
import { BIRD_PATH } from '@/src/components/splash/birdPath'
import { ShimmerText } from '@/src/components/shared/ShimmerText'
import { tap } from '@/src/lib/haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const HEIGHT = 52
const PAD = 4
const KNOB = HEIGHT - PAD * 2
// How far along the knob has to be when you let go for it to count.
const THRESHOLD = 0.85
// The track is cut into this many notches; the knob ticks over each one like a ratchet.
const NOTCHES = 12
const BIRD = 24
// The bird takes off a little before the confirm point, so even a quick flick doesn't catch it.
const TAKEOFF = 0.72

// Android's impact haptics fall back to a buzzy vibrator, so it gets the system's own drag and tick effects.
const android = Platform.OS === 'android'
const grab = () =>
  (android ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Drag_Start) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).catch(() => {})
const notch = () =>
  (android ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick) : Haptics.selectionAsync()).catch(() => {})

/**
 * A slide-to-confirm CTA for the few moments that deserve one: finishing setup,
 * Fresh Start, logging a statement. Not for anything done every day, where a
 * slide is just friction. Tapping does nothing on purpose; screen readers get
 * the "activate" action instead, so it's never slide-only. Callers swap it out
 * for their normal button once saving starts, so the saving fill and the shared
 * CheckIcon success beat stay exactly as they were.
 *
 * The bird waits at the far end. It perks up as the knob gets close, takes off
 * just before the confirm point, and lands back if you let go early.
 * `icon` is what you're carrying to it: the thing the screen is about.
 */
export function SlideToConfirm({ label, onConfirm, disabled = false, icon: KnobIcon = CaretRight }: { label: string; onConfirm: () => void; disabled?: boolean; icon?: PhosphorIcon }) {
  const { tokens } = useTheme()
  const reduceMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const x = useSharedValue(0)
  const armed = useSharedValue(false)
  const step = useSharedValue(0)
  const bob = useSharedValue(0)
  const flight = useSharedValue(0)
  const flown = useSharedValue(false)
  // 1 when live, 0 when disabled. The disabled look is a layer that fades over the live one, so the
  // track, label, knob and bird all change together instead of the text snapping before the fill.
  const live = useSharedValue(disabled ? 0 : 1)
  useEffect(() => {
    live.value = reduceMotion ? (disabled ? 0 : 1) : withTiming(disabled ? 0 : 1, { duration: 240, easing: Easing.out(Easing.quad) })
  }, [disabled, reduceMotion, live])
  const max = Math.max(width - KNOB - PAD * 2, 1)

  // One slow lean to the right and back, no bounce, so the knob reads as something you drag, not a button.
  useEffect(() => {
    if (reduceMotion || disabled || !width) return
    const ease = Easing.inOut(Easing.cubic)
    x.value = withDelay(500, withSequence(withTiming(14, { duration: 420, easing: ease }), withTiming(0, { duration: 420, easing: ease })))
  }, [reduceMotion, disabled, width, x])

  // A slow breathing bob while it waits.
  useEffect(() => {
    if (reduceMotion || disabled) return
    bob.value = withRepeat(withSequence(withTiming(-2, { duration: 900, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1)
  }, [reduceMotion, disabled, bob])

  // Haptics: a soft grab, a fine tick per notch while dragging, and a firm click once letting go would confirm.
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart(() => {
      step.value = 0
      runOnJS(grab)()
    })
    .onUpdate((e) => {
      x.value = Math.min(max, Math.max(0, e.translationX))
      const past = x.value >= max * THRESHOLD
      const away = x.value >= max * TAKEOFF
      if (away !== flown.value) {
        flown.value = away
        flight.value = reduceMotion ? (away ? 1 : 0) : withTiming(away ? 1 : 0, { duration: away ? 300 : 260, easing: away ? Easing.out(Easing.quad) : Easing.out(Easing.back(1.6)) })
      }
      if (past !== armed.value) {
        armed.value = past
        runOnJS(tap)()
        return
      }
      const n = Math.floor((x.value / max) * NOTCHES)
      if (n !== step.value) {
        step.value = n
        runOnJS(notch)()
      }
    })
    // Judged on the release, not the last update: a quick flick can end before any update lands.
    // A cancelled pan (a system gesture, an incoming call) never confirms.
    .onEnd((e, success) => {
      if (success && e.translationX >= max * THRESHOLD) {
        x.value = reduceMotion ? max : withTiming(max, { duration: 120 })
        runOnJS(onConfirm)()
      } else {
        // Eased, not sprung: a spring overshoots past the left edge and the knob vanishes for a beat.
        x.value = reduceMotion ? 0 : withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) })
        flight.value = reduceMotion ? 0 : withTiming(0, { duration: 260, easing: Easing.out(Easing.back(1.6)) })
        flown.value = false
      }
      armed.value = false
    })

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const trailStyle = useAnimatedStyle(() => ({ width: x.value + KNOB + PAD }))
  // Leans in and grows a touch as the knob closes in, then lifts off up and away to the right.
  const birdStyle = useAnimatedStyle(() => {
    const near = interpolate(x.value, [max * 0.3, max * TAKEOFF], [0, 1], Extrapolation.CLAMP)
    return {
      opacity: (0.8 + near * 0.2) * (1 - flight.value),
      transform: [
        { translateX: flight.value * 26 },
        { translateY: bob.value * (1 - near) - flight.value * 34 },
        { rotate: `${-near * 8 - flight.value * 16}deg` },
        { scale: 1 + near * 0.2 },
      ],
    }
  })
  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - live.value }))
  const labelStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, max * 0.6], [1, 0], Extrapolation.CLAMP) }))

  return (
    // The bird sits outside the clipped track so it can fly up past its edge.
    <View>
      <Animated.View
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
        style={[styles.track, { backgroundColor: tokens.accent }]}
      >
        <Animated.View pointerEvents="none" style={[styles.trail, { backgroundColor: tokens.onAccent }, trailStyle]} />
        {/* Hidden from screen readers: the track above already carries the label. */}
        <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.labelWrap, labelStyle]}>
          {/* A soft bright band sweeps across the label, left to right, pointing the way. */}
          <ShimmerText text={label} on={!disabled} loop style={[styles.label, { color: tokens.onAccent }]} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View hitSlop={12} style={[styles.knob, { backgroundColor: tokens.onAccent }, knobStyle]}>
            <KnobIcon size={18} weight="bold" color={tokens.accent} />
          </Animated.View>
        </GestureDetector>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.bird, birdStyle]}>
        <Svg width={BIRD} height={BIRD} viewBox="80 75 330 330">
          <Path d={BIRD_PATH} fill={tokens.onAccent} fillRule="evenodd" />
        </Svg>
      </Animated.View>
      {/* The disabled look, at rest. Hidden from screen readers: the track above already says it's disabled. */}
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.track, styles.dim, { backgroundColor: tokens.inputBg }, dimStyle]}
      >
        <View style={styles.labelWrap}>
          <Text numberOfLines={1} style={[styles.label, { color: tokens.text3 }]}>{label}</Text>
        </View>
        <View style={[styles.knob, { backgroundColor: tokens.card }]}>
          <KnobIcon size={18} weight="bold" color={tokens.text3} />
        </View>
        <View style={styles.bird}>
          <Svg width={BIRD} height={BIRD} viewBox="80 75 330 330">
            <Path d={BIRD_PATH} fill={tokens.text3} fillRule="evenodd" />
          </Svg>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: HEIGHT / 2, justifyContent: 'center', overflow: 'hidden' },
  trail: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: HEIGHT / 2, opacity: 0.18 },
  labelWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: KNOB + PAD * 2 },
  dim: { position: 'absolute', left: 0, right: 0, top: 0 },
  label: { fontFamily: fontFamily.bodyBold, fontSize: 15 },
  bird: { position: 'absolute', right: PAD + (KNOB - BIRD) / 2, top: (HEIGHT - BIRD) / 2 },
  knob: { position: 'absolute', left: PAD, width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
})
