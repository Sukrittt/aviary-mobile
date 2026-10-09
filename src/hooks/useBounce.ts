import { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'

/**
 * A squish on press and a springy kick on tap, for small playful tappables.
 * `kickBy` is how far it travels before bouncing back: down for an example
 * dropping into the composer, up for send, 0 for just the squish.
 */
export function useBounce(kickBy: number) {
  const reduceMotion = useReducedMotion()
  const kick = useSharedValue(0)
  const squish = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: kick.value }, { scale: squish.value }] }))
  return {
    style,
    onPressIn: () => {
      if (!reduceMotion) squish.value = withTiming(0.92, { duration: 90 })
    },
    onPressOut: () => {
      squish.value = withSpring(1, { mass: 0.6, damping: 9, stiffness: 260 })
    },
    kick: () => {
      if (!reduceMotion) kick.value = withSequence(withTiming(kickBy, { duration: 90 }), withSpring(0, { mass: 0.6, damping: 7, stiffness: 240 }))
    },
  }
}
