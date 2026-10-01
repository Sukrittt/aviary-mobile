import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { BIRD_EYE, BIRD_PATH } from './birdPath'

const BIRD_ORIGIN: [string, string, number] = ['50%', `${(386 / 512) * 100}%`, 0]
const BAR_ORIGIN: [string, string, number] = ['50%', `${(392 / 512) * 100}%`, 0]
// Tops of the legs: the nod pivots here so the body stays attached to the feet.
const NECK_ORIGIN: [string, string, number] = [`${(250 / 512) * 100}%`, `${(340 / 512) * 100}%`, 0]
// The lid closes from the top of the eye down.
const LID_ORIGIN: [string, string, number] = [`${(BIRD_EYE.cx / 512) * 100}%`, `${((BIRD_EYE.cy - BIRD_EYE.r) / 512) * 100}%`, 0]
export { BIRD_PATH }
const MOTES = [
  { cx: 238, cy: 374, r: 9, duration: 620, delay: 980, dx: -58, dy: -46, peak: 0.95 },
  { cx: 276, cy: 374, r: 7, duration: 660, delay: 1000, dx: 52, dy: -58, peak: 0.95 },
  { cx: 256, cy: 372, r: 5.5, duration: 700, delay: 1040, dx: 14, dy: -72, peak: 0.9 },
] as const

export interface BirdLandingMarkHandle {
  replay: () => void
}

interface BirdLandingMarkProps {
  size: number
  color: string
  autoplay?: boolean
  idle?: boolean
  /** Once settled, the bird idly nods and blinks every few seconds. */
  perched?: boolean
  style?: StyleProp<ViewStyle>
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduced(enabled)
    })
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return reduced
}

/** Shared bird/perch landing artwork used by both the launch splash and Home. */
export const BirdLandingMark = forwardRef<BirdLandingMarkHandle, BirdLandingMarkProps>(function BirdLandingMark(
  { size, color, autoplay = true, idle = false, perched = false, style },
  ref,
) {
  const scale = size / 512
  const reducedMotion = useReducedMotion()
  const initialProgress = autoplay ? 0 : 1
  const barIn = useRef(new Animated.Value(initialProgress)).current
  const barDip = useRef(new Animated.Value(initialProgress)).current
  const swoop = useRef(new Animated.Value(initialProgress)).current
  const squash = useRef(new Animated.Value(initialProgress)).current
  const breathe = useRef(new Animated.Value(0)).current
  const ring = useRef(new Animated.Value(initialProgress)).current
  const motes = useRef(MOTES.map(() => new Animated.Value(initialProgress))).current
  const nod = useRef(new Animated.Value(0)).current
  const blink = useRef(new Animated.Value(0)).current
  const markOpacity = useRef(new Animated.Value(1)).current
  const landingRef = useRef<Animated.CompositeAnimation | null>(null)
  const breatheLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const breatheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const perchLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const perchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startPerch = useCallback(() => {
    if (!perched || reducedMotion) return
    perchLoopRef.current = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(nod, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(nod, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay(1400),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.delay(3200),
          Animated.timing(blink, { toValue: 1, duration: 70, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(blink, { toValue: 0, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    ])
    perchLoopRef.current.start()
  }, [blink, nod, perched, reducedMotion])

  const stop = useCallback(() => {
    landingRef.current?.stop()
    breatheLoopRef.current?.stop()
    perchLoopRef.current?.stop()
    if (perchTimerRef.current) clearTimeout(perchTimerRef.current)
    perchTimerRef.current = null
    if (breatheTimerRef.current) clearTimeout(breatheTimerRef.current)
    breatheTimerRef.current = null
  }, [])

  const resetLanding = useCallback(() => {
    barIn.setValue(0)
    barDip.setValue(0)
    swoop.setValue(0)
    squash.setValue(0)
    breathe.setValue(0)
    ring.setValue(0)
    nod.setValue(0)
    blink.setValue(0)
    motes.forEach((mote) => mote.setValue(0))
  }, [barDip, barIn, blink, breathe, motes, nod, ring, squash, swoop])

  const startLanding = useCallback(() => {
    resetLanding()
    markOpacity.setValue(1)
    landingRef.current = Animated.parallel([
      Animated.timing(barIn, {
        toValue: 1,
        duration: 600,
        delay: 100,
        easing: Easing.bezier(0.2, 0.9, 0.25, 1.2),
        useNativeDriver: true,
      }),
      Animated.timing(barDip, {
        toValue: 1,
        duration: 950,
        delay: 350,
        easing: Easing.bezier(0.22, 0.7, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.timing(swoop, {
        toValue: 1,
        duration: 950,
        delay: 350,
        easing: Easing.bezier(0.22, 0.7, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.timing(squash, {
        toValue: 1,
        duration: 950,
        delay: 350,
        easing: Easing.bezier(0.22, 0.7, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.timing(ring, {
        toValue: 1,
        duration: 1100,
        delay: 980,
        easing: Easing.bezier(0.2, 0.7, 0.25, 1),
        useNativeDriver: true,
      }),
      ...motes.map((mote, i) =>
        Animated.timing(mote, {
          toValue: 1,
          duration: MOTES[i].duration,
          delay: MOTES[i].delay,
          easing: Easing.bezier(0.2, 0.7, 0.3, 1),
          useNativeDriver: true,
        }),
      ),
    ])
    landingRef.current.start()

    if (idle) {
      breatheLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      )
      breatheTimerRef.current = setTimeout(() => breatheLoopRef.current?.start(), 1500)
    }
    perchTimerRef.current = setTimeout(startPerch, 1500)
  }, [barDip, barIn, breathe, idle, markOpacity, motes, resetLanding, ring, squash, startPerch, swoop])

  const replay = useCallback(() => {
    stop()

    if (reducedMotion) {
      landingRef.current = Animated.sequence([
        Animated.timing(markOpacity, {
          toValue: 0.55,
          duration: 100,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
        Animated.timing(markOpacity, {
          toValue: 1,
          duration: 120,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
      ])
      landingRef.current.start()
      return
    }

    const fadeOut = Animated.timing(markOpacity, {
      toValue: 0,
      duration: 180,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: true,
    })
    landingRef.current = fadeOut
    fadeOut.start(({ finished }) => {
      if (!finished) return

      // Move back to the top-right keyframe only while fully transparent.
      resetLanding()
      // Native-driven animations do not reliably synchronize their final
      // value back to JS before a chained animation is created. Pinning this
      // explicitly prevents the 0 -> 1 reveal from being optimized into an
      // instant 1 -> 1 transition.
      markOpacity.setValue(0)
      const fadeIn = Animated.timing(markOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        useNativeDriver: true,
      })
      landingRef.current = fadeIn
      fadeIn.start(({ finished: revealed }) => {
        if (revealed) startLanding()
      })
    })
  }, [markOpacity, reducedMotion, resetLanding, startLanding, stop])

  useImperativeHandle(ref, () => ({ replay }), [replay])
  useEffect(() => {
    if (autoplay) {
      if (reducedMotion) replay()
      else startLanding()
    } else {
      startPerch()
    }
    return stop
  }, [autoplay, reducedMotion, replay, startLanding, startPerch, stop])

  const ringStyle = {
    opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.25, 2.7] }) }],
  }
  const barDipStyle = {
    transform: [
      {
        translateY: barDip.interpolate({ inputRange: [0, 0.62, 0.72, 0.82, 1], outputRange: [0, 0, 7 * scale, -2 * scale, 0] }),
      },
      { scaleY: barDip.interpolate({ inputRange: [0, 0.62, 0.72, 0.82, 1], outputRange: [1, 1, 0.8, 1.06, 1] }) },
    ],
  }
  const barInStyle = {
    opacity: barIn.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
    transform: [{ scaleX: barIn.interpolate({ inputRange: [0, 0.64, 1], outputRange: [0.14, 1.06, 1] }) }],
  }
  const swoopStyle = {
    transform: [
      {
        translateX: swoop.interpolate({
          inputRange: [0, 0.4, 0.62, 0.74, 0.86, 1],
          outputRange: [200 * scale, 42 * scale, 0, 0, 0, 0],
        }),
      },
      {
        translateY: swoop.interpolate({
          inputRange: [0, 0.4, 0.62, 0.74, 0.86, 1],
          outputRange: [-340 * scale, -92 * scale, -14 * scale, 6 * scale, -7 * scale, 0],
        }),
      },
      {
        rotate: swoop.interpolate({
          inputRange: [0, 0.4, 0.62, 0.74, 0.86, 1],
          outputRange: ['-18deg', '-6deg', '5deg', '-2deg', '2deg', '0deg'],
        }),
      },
    ],
  }
  const squashStyle = {
    transformOrigin: BIRD_ORIGIN,
    transform: [
      { scaleX: squash.interpolate({ inputRange: [0, 0.58, 0.68, 0.78, 0.9, 1], outputRange: [1, 1, 1.09, 0.96, 1.02, 1] }) },
      { scaleY: squash.interpolate({ inputRange: [0, 0.58, 0.68, 0.78, 0.9, 1], outputRange: [1, 1, 0.9, 1.05, 0.99, 1] }) },
    ],
  }
  const breatheStyle = {
    transformOrigin: BIRD_ORIGIN,
    transform: [
      { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -6 * scale] }) },
      { rotate: breathe.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-1.2deg'] }) },
    ],
  }
  const nodStyle = {
    transformOrigin: NECK_ORIGIN,
    transform: [{ rotate: nod.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '6deg'] }) }],
  }
  const lidStyle = {
    transformOrigin: LID_ORIGIN,
    transform: [{ scaleY: blink.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) }],
  }

  return (
    <Animated.View style={[{ width: size, height: size, opacity: markOpacity }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: BAR_ORIGIN }, ringStyle]}>
        <Svg width={size} height={size} viewBox="0 0 512 512">
          <Circle cx={256} cy={392} r={58} fill="none" stroke={color} strokeWidth={7} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: BAR_ORIGIN }, barDipStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: BAR_ORIGIN }, barInStyle]}>
          <Svg width={size} height={size} viewBox="0 0 512 512">
            <Rect x={128} y={379} width={256} height={26} rx={13} fill={color} />
          </Svg>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, swoopStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, squashStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, breatheStyle]}>
            <Svg width={size} height={size} viewBox="0 0 512 512" style={StyleSheet.absoluteFill}>
              <Rect x={224} y={340} width={17} height={46} rx={8.5} fill={color} />
              <Rect x={259} y={340} width={17} height={46} rx={8.5} fill={color} />
            </Svg>
            <Animated.View style={[StyleSheet.absoluteFill, nodStyle]}>
              <Svg width={size} height={size} viewBox="0 0 512 512" style={StyleSheet.absoluteFill}>
                <Path d={BIRD_PATH} fillRule="evenodd" fill={color} />
              </Svg>
              {perched && (
                <Animated.View style={[StyleSheet.absoluteFill, lidStyle]}>
                  <Svg width={size} height={size} viewBox="0 0 512 512">
                    <Circle cx={BIRD_EYE.cx} cy={BIRD_EYE.cy} r={BIRD_EYE.r + 1} fill={color} />
                  </Svg>
                </Animated.View>
              )}
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      {MOTES.map((mote, i) => {
        const progress = motes[i]
        const moteStyle = {
          opacity: progress.interpolate({ inputRange: [0, 0.16, 1], outputRange: [0, mote.peak, 0] }),
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, mote.dx * scale] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, mote.dy * scale] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, i === 2 ? 0.85 : 1] }) },
          ],
        }
        return (
          <Animated.View key={mote.cx + mote.cy} style={[StyleSheet.absoluteFill, moteStyle]}>
            <Svg width={size} height={size} viewBox="0 0 512 512">
              <Circle cx={mote.cx} cy={mote.cy} r={mote.r} fill={color} />
            </Svg>
          </Animated.View>
        )
      })}
    </Animated.View>
  )
})
