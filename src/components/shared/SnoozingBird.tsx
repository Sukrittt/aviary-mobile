import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { BIRD_BODY_PATH } from '@/src/components/splash/birdPath'

// The 512-unit bird artboard, cropped so the z's have room above the beak.
const VIEW_BOX = '40 40 460 460'
// Pivot at the tops of the legs so the nod dips the beak while the feet stay put.
const NECK_ORIGIN: [string, string, number] = [`${((250 - 40) / 460) * 100}%`, `${((340 - 40) / 460) * 100}%`, 0]
const NOD = { duration: 1600, easing: Easing.inOut(Easing.ease) }
const Z_DRIFT = { duration: 2400, easing: Easing.out(Easing.quad) }

function useZStyle(progress: SharedValue<number>, size: number) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2, 0.7, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: progress.value * size * 0.04 },
      { translateY: -progress.value * size * 0.12 },
      { scale: interpolate(progress.value, [0, 1], [0.6, 1.1]) },
    ],
  }))
}

/** Empty-state mascot for "nothing yet": the perched bird dozing, head nodding, z's drifting up.
 *  See docs/empty-states.md for the rest of the mascot family. */
export function SnoozingBird({
  size = 96,
  color,
  accent,
  eyeColor,
}: {
  size?: number
  color: string
  accent: string
  /** The surface the bird sits on, so the shut eye reads as a cut-out like the open one. */
  eyeColor: string
}) {
  const reduceMotion = useReducedMotion()
  const nod = useSharedValue(0)
  // Reduced motion parks both z's mid-drift: visible, still.
  const zBig = useSharedValue(reduceMotion ? 0.4 : 0)
  const zSmall = useSharedValue(reduceMotion ? 0.6 : 0)

  useEffect(() => {
    if (reduceMotion) {
      nod.value = 0
      zBig.value = 0.4
      zSmall.value = 0.6
      return
    }
    nod.value = withRepeat(withTiming(1, NOD), -1, true)
    zBig.value = withRepeat(withTiming(1, Z_DRIFT), -1)
    zSmall.value = withDelay(Z_DRIFT.duration / 2, withRepeat(withTiming(1, Z_DRIFT), -1))
    return () => {
      cancelAnimation(nod)
      cancelAnimation(zBig)
      cancelAnimation(zSmall)
    }
  }, [nod, zBig, zSmall, reduceMotion])

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${nod.value * 7}deg` }, { translateY: nod.value * size * 0.012 }],
  }))
  const zBigStyle = useZStyle(zBig, size)
  const zSmallStyle = useZStyle(zSmall, size)

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox={VIEW_BOX} style={StyleSheet.absoluteFill}>
        <Rect x={224} y={340} width={17} height={46} rx={8.5} fill={color} />
        <Rect x={259} y={340} width={17} height={46} rx={8.5} fill={color} />
        <Rect x={128} y={379} width={256} height={26} rx={13} fill={color} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: NECK_ORIGIN }, bodyStyle]}>
        <Svg width={size} height={size} viewBox={VIEW_BOX}>
          <Path d={BIRD_BODY_PATH} fill={color} />
          <Path d="M 288 216 Q 306 234 324 216" fill="none" stroke={eyeColor} strokeWidth={10} strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, zBigStyle]}>
        <Svg width={size} height={size} viewBox={VIEW_BOX}>
          <Path d="M 380 140 H 420 L 380 180 H 420" fill="none" stroke={accent} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, zSmallStyle]}>
        <Svg width={size} height={size} viewBox={VIEW_BOX}>
          <Path d="M 416 120 H 442 L 416 146 H 442" fill="none" stroke={accent} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  )
}
