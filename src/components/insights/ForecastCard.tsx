import { Text, View, StyleSheet } from 'react-native'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useForecast } from '@/src/hooks/useForecast'
import { nextMonthLine } from '@/src/lib/forecastCopy'
import { splitEmoji } from '@/src/lib/emoji'
import { formatDateShort } from '@/src/lib/format'
import { Card } from '@/src/components/ui/Card'
import { EmptyState } from '@/src/components/shared/EmptyState'
import type { ForecastEnvelope } from '@/src/api/forecast'

function rowMeta(e: ForecastEnvelope, money: (n: number) => string): string {
  if (e.overspent) return 'Already over'
  if (e.runsOutOn) return `Runs out around ${formatDateShort(e.runsOutOn)}`
  if (e.scheduled > 0) return `${money(e.scheduled)} in bills still to come`
  if (e.usualDaily > 0) return `Usually ${money(e.usualDaily)} a day`
  return 'Nothing expected'
}

/** Run-outs first by date, then the tightest envelopes. */
const byUrgency = (a: ForecastEnvelope, b: ForecastEnvelope) =>
  (a.runsOutOn ?? '9999').localeCompare(b.runsOutOn ?? '9999') || a.projected - b.projected

/** Insights' forecast: each envelope's month-end amount, then next month's spoken-for line. Twin of Web's ForecastCard. */
export function ForecastCard() {
  const { formatCurrency } = useCurrency()
  const { hideAmounts } = usePrivacy()
  const { tokens, space, type } = useTheme()
  const { data } = useForecast()
  if (!data) return null
  // Estimates, so whole rupees: paisa would read as false precision.
  const money = (n: number) => formatCurrency(Math.round(n), hideAmounts)
  const next = nextMonthLine(data.nextMonth, money)
  const rows = data.envelopes.filter((e) => e.available !== 0 || e.projected !== 0).sort(byUrgency)
  const body = { fontFamily: fontFamily.bodyMedium, fontSize: type.body, color: tokens.text }
  const meta = { fontFamily: fontFamily.bodySemiBold, fontSize: 12, color: tokens.text3 }

  return (
    <Card elevated={false} style={{ backgroundColor: tokens.card }}>
      <View style={styles.head}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>Month-end forecast</Text>
          {data.basis && (
            <Text style={[meta, { marginTop: 2 }]}>
              {data.basis === 'history' ? 'From your usual spending' : 'From your spending this month'}
            </Text>
          )}
        </View>
        {data.totalLeft !== null && <Text style={[body, { fontFamily: fontFamily.displaySemiBold }]}>{money(data.totalLeft)}</Text>}
      </View>

      {!data.basis ? (
        <EmptyState
          compact
          title="Your forecast's warming up"
          description="It shows up after a week of spending. Keep logging and it'll be here."
        />
      ) : (
        <View style={{ marginTop: space.sm }}>
          {rows.map((e, i) => (
            <View
              key={e.category}
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={body} numberOfLines={1}>{splitEmoji(e.category).text}</Text>
                <Text style={meta} numberOfLines={1}>{rowMeta(e, money)}</Text>
              </View>
              <Text style={[body, { fontVariant: ['tabular-nums'] }]}>{money(e.projected)}</Text>
            </View>
          ))}
        </View>
      )}

      {next && (
        <View style={[styles.next, { borderTopColor: tokens.border }]}>
          <Text style={body}>{next.title}</Text>
          {next.detail && <Text style={meta}>{next.detail}</Text>}
        </View>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  next: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
})
