import { Pressable, Text, View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useForecast } from '@/src/hooks/useForecast'
import { runOutWarning } from '@/src/lib/forecastCopy'
import { useDismissedRolloverBanner } from '@/src/hooks/useDismissedRolloverBanner'
import { tap } from '@/src/lib/haptics'
import { Card } from '@/src/components/ui/Card'
import { AnimatedPressable, usePressSpring } from '@/src/components/ui/Button'
import { Icon } from '@/src/components/shared/Icon'
import { ChartLine } from '@/src/components/shared/icons'

/**
 * Home's heads-up: "Fun runs out around 24 Oct". Only shows when an envelope
 * runs dry before month end, and stays gone once dismissed until the forecast
 * names a different envelope or date. The full forecast lives on Insights.
 */
export function ForecastLine() {
  const { tokens, type } = useTheme()
  const router = useRouter()
  const press = usePressSpring()
  const { data } = useForecast()
  const warning = data ? runOutWarning(data) : null
  const [dismissed, setDismissed] = useDismissedRolloverBanner(warning?.key ?? 'forecast-none')
  // null while the stored answer loads, so a dismissed warning never flashes.
  if (!warning || dismissed !== false) return null

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
          <Text style={{ flexShrink: 1, color: tokens.text, fontSize: type.body, fontFamily: fontFamily.bodySemiBold }}>{warning.text}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setDismissed(true)} hitSlop={12}>
          <Text style={{ color: tokens.accentInk, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>Okay</Text>
        </Pressable>
      </Card>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, gap: 8 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
})
