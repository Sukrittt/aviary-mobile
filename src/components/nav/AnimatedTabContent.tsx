import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import { useIsFocused } from 'expo-router'

/**
 * Wraps a tab screen's scrollable body (not its fixed header) so it scales in
 * on focus. The fade itself is the navigator's (`animation: 'fade'` in
 * app/(tabs)/_layout.tsx); this used to fade too, and the two stacked made
 * every switch read slower than either alone.
 */
export function AnimatedTabContent({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused()
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Reset on blur, not on focus: a reset in the focus effect lands after the
    // first frame is drawn, so the body would show at full size for a frame and then jump.
    if (!isFocused) {
      progress.setValue(0)
      return
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start()
  }, [isFocused, progress])

  return (
    <Animated.View
      style={{
        flex: 1,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  )
}
