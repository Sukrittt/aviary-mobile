import { Pressable, StyleSheet } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'

const TRACK_W = 46
const TRACK_H = 28
const THUMB = 22
const TRAVEL = TRACK_W - THUMB - (TRACK_H - THUMB)

/** On/off pill in the app's own look, used instead of the platform Switch. */
export function Toggle({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean
  onValueChange: (next: boolean) => void
  disabled?: boolean
  accessibilityLabel?: string
}) {
  const { tokens } = useTheme()
  const progress = useDerivedValue(() => withSpring(value ? 1 : 0, { damping: 18, stiffness: 260 }))

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [tokens.borderStrong, tokens.accent]),
  }))
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }, { scale: 0.92 + progress.value * 0.08 }],
  }))

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        onValueChange(!value)
      }}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, { backgroundColor: tokens.onAccent }, thumbStyle]} />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  track: { width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, padding: (TRACK_H - THUMB) / 2 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
})
