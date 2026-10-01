import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { BIRD_PATH } from '@/src/components/splash/BirdLandingMark'

// Pivot at the bird's feet so the peck tips the head down toward the beak side.
const FEET_ORIGIN: [string, string, number] = ['49%', `${(386 / 512) * 100}%`, 0]
const PECK = { duration: 170, easing: Easing.out(Easing.quad) }
const LIFT = { duration: 230, easing: Easing.inOut(Easing.quad) }

/** Ask Aviary's "thinking" mark: the perched bird pecks twice, rests, repeats. */
export function BrainThinking({ size = 30, color }: { size?: number; color: string }) {
  const reduceMotion = useReducedMotion()
  const peck = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      peck.value = withRepeat(withSequence(withTiming(0.5, { duration: 700 }), withTiming(0, { duration: 700 })), -1)
    } else {
      peck.value = withRepeat(
        withSequence(
          withTiming(1, PECK),
          withTiming(0, LIFT),
          withTiming(1, PECK),
          withTiming(0, LIFT),
          withDelay(600, withTiming(0, { duration: 0 })),
        ),
        -1,
      )
    }
    return () => cancelAnimation(peck)
  }, [peck, reduceMotion])

  const birdStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: 1 - peck.value * 0.6 }
      : { transform: [{ rotate: `${peck.value * 16}deg` }, { translateY: peck.value * size * 0.02 }] },
  )

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Thinking"
    >
      <Svg width={size} height={size} viewBox="0 0 512 512" style={StyleSheet.absoluteFill}>
        <Rect x={128} y={379} width={256} height={26} rx={13} fill={color} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: FEET_ORIGIN }, birdStyle]}>
        <Svg width={size} height={size} viewBox="0 0 512 512">
          <Rect x={224} y={340} width={17} height={46} rx={8.5} fill={color} />
          <Rect x={259} y={340} width={17} height={46} rx={8.5} fill={color} />
          <Path d={BIRD_PATH} fillRule="evenodd" fill={color} />
        </Svg>
      </Animated.View>
    </View>
  )
}
