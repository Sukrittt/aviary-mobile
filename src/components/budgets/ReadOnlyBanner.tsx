import { Text, View, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Lock } from '@/src/components/shared/icons'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { readOnlyCopy } from '@/src/lib/budgetMembership'

/** The open budget is shared and its owner's plan lapsed: look, don't touch. */
export function ReadOnlyBanner() {
  const { tokens } = useTheme()
  const { active } = useBudgetSpaces()
  if (!active?.readOnly) return null
  return (
    <View testID="read-only-banner" accessibilityRole="alert" style={[styles.box, { backgroundColor: tokens.pillBg }]}>
      <Lock size={18} color={tokens.text2} weight="bold" />
      <Text style={[styles.text, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{readOnlyCopy(active)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
})
