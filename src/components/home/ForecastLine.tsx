import { Text, View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useForecast } from '@/src/hooks/useForecast'
import { forecastHeadline } from '@/src/lib/forecastCopy'
import { tap } from '@/src/lib/haptics'
import { Card } from '@/src/components/ui/Card'
import { AnimatedPressable, usePressSpring } from '@/src/components/ui/Button'
import { Icon } from '@/src/components/shared/Icon'
import { CaretRight, ChartLine } from '@/src/components/shared/icons'

/** Home's one line: "About ₹2,400 left at month end". Opens the forecast on Insights. */
export function ForecastLine() {
  const { formatCurrency } = useCurrency()
  const { hideAmounts } = usePrivacy()
  const { tokens, type } = useTheme()
  const router = useRouter()
  const press = usePressSpring()
  const { data } = useForecast()
  const line = data && forecastHeadline(data, (n) => formatCurrency(n, hideAmounts))
  if (!line) return null

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityHint="Opens your month-end forecast"
      onPress={() => {
        tap()
        router.push('/insights')
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.style}
    >
      <Card elevated={false} style={styles.row}>
        <View style={styles.label}>
          <View style={[styles.icon, { backgroundColor: tokens.accentSoft }]}>
            <Icon icon={ChartLine} size={18} color={tokens.accentInk} />
          </View>
          <Text style={{ flexShrink: 1, color: tokens.text, fontSize: type.body, fontFamily: fontFamily.bodySemiBold }}>{line}</Text>
        </View>
        <Icon icon={CaretRight} size={16} color={tokens.text2} />
      </Card>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, gap: 8 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
})
