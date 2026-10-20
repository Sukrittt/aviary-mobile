import { Text, View, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Lock } from '@/src/components/shared/icons'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { readOnlyCopy } from '@/src/lib/budgetMembership'

/** The open budget is shared and its owner's plan lapsed: a calm, standing note on what that means. */
export function ReadOnlyBanner() {
  const { tokens } = useTheme()
  const { active } = useBudgetSpaces()
  if (!active?.readOnly) return null
  return (
    <View testID="read-only-banner" accessibilityRole="summary" style={[styles.box, { backgroundColor: tokens.warnSoft }]}>
      <Lock size={16} color={tokens.warnInk} weight="fill" style={styles.icon} />
      <Text style={[styles.text, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>
        <Text style={{ color: tokens.warnInk, fontFamily: fontFamily.bodySemiBold }}>{'Read-only · '}</Text>
        {readOnlyCopy(active)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  icon: { marginTop: 1 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
})
