import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/** The small caption at the top of an action sheet, naming what its options act on. */
export function SheetTitle({ children }: { children: ReactNode }) {
  const { tokens } = useTheme()
  return (
    <Text style={[styles.title, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>
      {children}
    </Text>
  )
}

/**
 * One row of an action sheet (inside a BottomSheet). Rows stack with a hairline
 * above each. `destructive` is the coral delete, `cancel` the quiet way out.
 */
export function SheetOption({
  label,
  tone = 'default',
  onPress,
  disabled,
}: {
  label: string
  tone?: 'default' | 'destructive' | 'cancel'
  onPress: () => void
  disabled?: boolean
}) {
  const { tokens } = useTheme()
  const color = tone === 'destructive' ? tokens.coral : tone === 'cancel' ? tokens.text2 : tokens.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.option, { borderTopColor: tokens.border }, disabled && styles.disabled]}
    >
      <Text style={[styles.label, { color, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
  option: { paddingVertical: 14, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 16 },
  disabled: { opacity: 0.5 },
})
