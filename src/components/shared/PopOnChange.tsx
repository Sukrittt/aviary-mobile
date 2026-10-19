import { useEffect, useRef, type ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Reanimated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'

const POP_SPRING = { mass: 0.7, damping: 9, stiffness: 260 }

/**
 * A view that squashes and springs back whenever `value` changes after
 * mount: a picked colour landing on its tile, or a saved one landing back on
 * the list. Reanimated skips it under the system's reduce-motion setting.
 */
export function PopOnChange({ value, style, children }: {
  value: unknown
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}) {
  const scale = useSharedValue(1)
  const prev = useRef(value)
  useEffect(() => {
    if (Object.is(prev.current, value)) return
    prev.current = value
    scale.value = withSequence(withTiming(0.86, { duration: 90 }), withSpring(1, POP_SPRING))
  }, [value, scale])
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return <Reanimated.View style={[style, pop]}>{children}</Reanimated.View>
}
