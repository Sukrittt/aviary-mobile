import type { ReactNode } from 'react'
import { View, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'

/**
 * The app's surface. Solid rather than translucent so it reads as a distinct
 * plane on the light ground, the way the reference screens do.
 */
export function Card({
  children,
  onPress,
  padded = true,
  elevated = true,
  style,
}: {
  children: ReactNode
  onPress?: () => void
  padded?: boolean
  elevated?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { tokens, radius, space, elevation } = useTheme()

  const boxStyle = [
    styles.card,
    {
      backgroundColor: tokens.cardSolid,
      borderRadius: radius.lg,
      padding: padded ? space.lg : 0,
    },
    { borderWidth: 1, borderColor: tokens.border },
    elevated && elevation.card,
    style,
  ]

  if (!onPress) return <View style={boxStyle}>{children}</View>

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [boxStyle, pressed && styles.pressed]}>
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  pressed: { opacity: 0.7 },
})
