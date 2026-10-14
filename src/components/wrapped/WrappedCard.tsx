import { useEffect } from 'react'
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { fontFamily } from '@/src/theme/fonts'

const RISE_EASE = Easing.bezier(0.16, 1, 0.3, 1)

export interface BlobSpec {
  size: number
  top?: number
  left?: number
  right?: number
  bottom?: number
  color: string
  borderRadius?: number
  motion: 'drift' | 'drift2' | 'spin'
  durationMs?: number
  /** 'ring' draws a hollow outline (matches prototype's border-only blobs) instead of a filled circle. */
  variant?: 'fill' | 'ring'
  ringWidth?: number
}

/** One floating decorative circle/blob — mirrors the HTML prototype's wDrift/wDrift2/wSpin keyframes. */
function Blob({ spec }: { spec: BlobSpec }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: spec.durationMs ?? 12000, easing: Easing.linear }),
      -1,
      false,
    )
  }, [progress, spec.durationMs])

  const style = useAnimatedStyle(() => {
    if (spec.motion === 'spin') {
      return { transform: [{ rotate: `${progress.value * 360}deg` }] }
    }
    const swing = spec.motion === 'drift' ? { x: 26, y: -34, scale: 1.14 } : { x: -30, y: 26, scale: 0.88 }
    const t = Math.sin(progress.value * Math.PI)
    return {
      transform: [
        { translateX: swing.x * t },
        { translateY: swing.y * t },
        { scale: 1 + (swing.scale - 1) * t },
      ],
    }
  })

  const isRing = spec.variant === 'ring'

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        style,
        {
          width: spec.size,
          height: spec.size,
          borderRadius: spec.borderRadius ?? spec.size / 2,
          top: spec.top,
          left: spec.left,
          right: spec.right,
          bottom: spec.bottom,
        },
        isRing
          ? { borderWidth: spec.ringWidth ?? 22, borderColor: spec.color, backgroundColor: 'transparent' }
          : { backgroundColor: spec.color },
      ]}
    />
  )
}

/** Full-bleed story-card shell: accent background (solid or gradient), floating blobs, big number, supporting copy. */
export function WrappedCard({
  color,
  onColor,
  gradientColors,
  blobs,
  eyebrow,
  children,
  style,
  interactive = false,
}: {
  color: string
  onColor: string
  gradientColors?: [string, string, string]
  blobs?: BlobSpec[]
  eyebrow?: string
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Set true only when `children` contains real Pressables (e.g. CoverCard's start
   * buttons) — otherwise the card is pointerEvents="none" so taps fall through to the
   * WrappedScreen tap-navigation zones rendered underneath it. */
  interactive?: boolean
}) {
  return (
    <View style={[styles.card, { backgroundColor: color }, style]} pointerEvents={interactive ? 'box-none' : 'none'}>
      {gradientColors && (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {blobs?.map((b, i) => <Blob key={i} spec={b} />)}
      <View style={styles.body}>
        {eyebrow && (
          <WFade>
            <Text style={[styles.eyebrowText, { color: onColor, fontFamily: fontFamily.bodyBold }]}>{eyebrow}</Text>
          </WFade>
        )}
        {children}
      </View>
    </View>
  )
}

/** Centered radial-glow pulse, used behind the Archetype card's emoji (mirrors prototype's wShine keyframe). */
export function WrappedGlow({ color, size = 340 }: { color: string; size?: number }) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [p])
  const style = useAnimatedStyle(() => ({ opacity: 0.25 + p.value * 0.45 }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        style,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    />
  )
}

interface AnimProps {
  delay?: number
  duration?: number
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}

/** opacity 0→1 — the small-caps kicker primitive. */
export function WFade({ delay = 0, duration = 500, style, children }: AnimProps) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.ease) }))
  }, [p, delay, duration])
  const aStyle = useAnimatedStyle(() => ({ opacity: p.value }))
  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>
}

/** translateY(26px)→0 + fade — body copy, cards, buttons, list rows. */
export function WRise({ delay = 0, duration = 600, style, children }: AnimProps) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: RISE_EASE }))
  }, [p, delay, duration])
  const aStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 26 }],
  }))
  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>
}

/** scale(.72)→1 + fade — the hero number/word only, one per slide. */
export function WPop({ delay = 0, duration = 550, style, children }: AnimProps) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: RISE_EASE }))
  }, [p, delay, duration])
  const aStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.72 + p.value * 0.28 }],
  }))
  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>
}

/** scaleX(0)→1 from the left edge — bar/progress fills. Never animate width; transforms don't jank. */
export function WGrowX({ delay = 0, duration = 800, style, children }: AnimProps) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: RISE_EASE }))
  }, [p, delay, duration])
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }))
  return <Animated.View style={[style, { transformOrigin: 'left' }, aStyle]}>{children}</Animated.View>
}

/** Small vertical bob loop — the 🔥 emoji, the highlighted weekday bar. */
export function WNudge({ durationMs = 2600, amplitude = 7, style, children }: { durationMs?: number; amplitude?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: durationMs / 2, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [p, durationMs])
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -p.value * amplitude }] }))
  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>
}

export function WrappedBigNumber({ value, onColor }: { value: string; onColor: string }) {
  return (
    <Text style={[styles.bigNumber, { color: onColor, fontFamily: fontFamily.displayBold }]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  )
}

export function WrappedCaption({ value, onColor }: { value: string; onColor: string }) {
  return (
    <Text style={[styles.caption, { color: onColor, fontFamily: fontFamily.bodyBold }]}>{value}</Text>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 28,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  blob: { position: 'absolute' },
  glow: { position: 'absolute', alignSelf: 'center', top: '18%' },
  eyebrowText: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    opacity: 0.85,
  },
  body: {
    gap: 14,
  },
  // No explicit lineHeight: adjustsFontSizeToFit shrinks the text to the line box on
  // Android, so a tight one would cap how big the number can ever render.
  bigNumber: {
    fontSize: 72,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.5,
    paddingBottom: 6,
    includeFontPadding: false,
  },
  caption: {
    fontSize: 17,
    lineHeight: 24,
    opacity: 0.92,
  },
})
