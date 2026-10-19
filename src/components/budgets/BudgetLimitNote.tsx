import { Text, View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/** "5 of 5 budgets", and where to ask for more: an admin raises one person's limit. */
export function BudgetLimitNote({ count, limit, onContact }: { count: number; limit: number; onContact?: () => void }) {
  const { tokens } = useTheme()
  const router = useRouter()
  return (
    <View testID="budget-limit-note" style={[styles.box, { backgroundColor: tokens.pillBg }]}>
      <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{`${Math.min(count, limit)} of ${limit} budgets`}</Text>
      <Text style={[styles.body, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
        {'Need more? '}
        <Text
          accessibilityRole="link"
          onPress={() => {
            onContact?.()
            router.push('/account/feedback')
          }}
          style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }}
        >
          Contact us
        </Text>
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, padding: 14, gap: 4 },
  title: { fontSize: 14 },
  body: { fontSize: 13, lineHeight: 18 },
})
