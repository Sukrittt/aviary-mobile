import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

// The nav's add-success burst (AddCircleAnim's AddCircleDone), scaled down to
// the folded budget chip and drawn in the chip's accent instead of on an
// orange disc: a halo ring swells out while dots and dashes fly off and fade.
const BOX = 72
const EASING = Easing.bezier(0.2, 0.7, 0.3, 1)
const PARTICLES = [
  { angle: 0, delay: 40, duration: 620, dash: false },
  { angle: 45, delay: 110, duration: 660, dash: true },
  { angle: 90, delay: 60, duration: 600, dash: false },
  { angle: 135, delay: 150, duration: 640, dash: true },
  { angle: 180, delay: 80, duration: 630, dash: false },
  { angle: 225, delay: 130, duration: 670, dash: true },
  { angle: 270, delay: 50, duration: 610, dash: false },
  { angle: 315, delay: 120, duration: 650, dash: true },
] as const

/** A one-off splash centred on `center` (px, in the parent's box). Calls `onDone` once it's played. */
export function ChipSplash({ center, color, softColor, onDone }: { center: { x: number; y: number }; color: string; softColor: string; onDone: () => void }) {
  const halo = useRef(new Animated.Value(0)).current
  const particles = useRef(PARTICLES.map(() => new Animated.Value(0))).current
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const splash = Animated.parallel([
      Animated.timing(halo, { toValue: 1, duration: 560, easing: EASING, useNativeDriver: true }),
      ...particles.map((p, i) => Animated.timing(p, { toValue: 1, delay: PARTICLES[i].delay, duration: PARTICLES[i].duration, easing: EASING, useNativeDriver: true })),
    ])
    splash.start(({ finished }) => finished && done.current())
    return () => splash.stop()
  }, [halo, particles])

  return (
    <View testID="budget-chip-splash" pointerEvents="none" style={[styles.box, { left: center.x - BOX / 2, top: center.y - BOX / 2 }]}>
      <Animated.View
        style={[
          styles.halo,
          { borderColor: color, opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.7] }) }] },
        ]}
      />
      {PARTICLES.map((p, i) => (
        <View key={p.angle} style={[styles.axis, { transform: [{ rotate: `${p.angle}deg` }] }]}>
          <Animated.View
            style={[
              styles.particle,
              p.dash ? styles.dash : styles.dot,
              { backgroundColor: p.dash ? softColor : color },
              {
                opacity: particles[i].interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: particles[i].interpolate({ inputRange: [0, 0.6, 1], outputRange: [-14, -28, -34] }) }],
              },
            ]}
          />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { position: 'absolute', width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  axis: { position: 'absolute', left: '50%', top: '50%' },
  particle: { position: 'absolute', borderRadius: 100 },
  dot: { width: 5, height: 5, marginLeft: -2.5 },
  dash: { width: 3, height: 8, marginLeft: -1.5 },
})
