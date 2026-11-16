import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import * as Haptics from 'expo-haptics'

const AnimatedPath = Animated.createAnimatedComponent(Path)
// Length of the "M5 13l4 4L19 7" checkmark path: sqrt(32) + sqrt(200) ≈ 19.8
const CHECK_PATH_LENGTH = 19.8

// Renders inline in place of a button's label (the button keeps its own
// background/shape — this is just the icon, not a pill that swaps the whole
// button out). Fades in while the checkmark draws itself via strokeDashoffset.
export function CheckIcon({ color, size = 20, haptic = true }: { color: string; size?: number; haptic?: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current
  const checkDashoffset = useRef(new Animated.Value(CHECK_PATH_LENGTH)).current
  // Decided on mount: the check draws once, so it buzzes at most once.
  const buzz = useRef(haptic).current

  useEffect(() => {
    if (buzz) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    opacity.setValue(0)
    checkDashoffset.setValue(CHECK_PATH_LENGTH)
    Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.ease, useNativeDriver: true }).start()
    Animated.timing(checkDashoffset, {
      toValue: 0,
      duration: 350,
      delay: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start()
  }, [opacity, checkDashoffset, buzz])

  return (
    <Animated.View style={{ width: size, height: size, opacity }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <AnimatedPath
          d="M5 13l4 4L19 7"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[CHECK_PATH_LENGTH, CHECK_PATH_LENGTH]}
          strokeDashoffset={checkDashoffset}
        />
      </Svg>
    </Animated.View>
  )
}
