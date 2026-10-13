import { useCurrency } from '@/src/context/CurrencyContext'
import { View, Text } from 'react-native'
import { Play } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import type { MonthComparison } from '@/src/lib/monthly'

interface Props {
  comparison: MonthComparison
  hideAmounts?: boolean
}

/** The screen's headline: the largest amount on the screen, with the one
 *  sentence that answers "is this normal" underneath it. Every other card on
 *  Insights is a different rendering of the same total; this is the only
 *  place that says whether it's a good number. */
export function ComparisonLine({ comparison, hideAmounts = false }: Props) {
  const { formatCurrency } = useCurrency()

  const { tokens, type } = useTheme()
  const { spent, baseline, deltaPct, inProgress, projected, driver, days } = comparison
  const spentText = formatCurrency(spent, hideAmounts)
  const amountStyle = { fontSize: type.heading, fontFamily: fontFamily.displayBold, color: tokens.text }
  const lineStyle = { fontSize: type.body, fontFamily: fontFamily.bodyMedium, color: tokens.text2 }
  const strong = { fontFamily: fontFamily.bodySemiBold }

  let line2: React.ReactNode

  if (baseline == null || deltaPct == null) {
    const perDay = days > 0 ? spent / days : 0
    line2 = (
      <Text style={lineStyle}>
        {formatCurrency(perDay, hideAmounts)}/day across {days} {days === 1 ? 'day' : 'days'}
      </Text>
    )
  } else {
    const over = deltaPct > 0
    const deltaColor = over ? tokens.coral : tokens.mint
    const deltaLabel = `${Math.abs(deltaPct).toFixed(0)}%`
    const deltaIcon = (
      <View style={{ transform: [{ rotate: over ? '-90deg' : '90deg' }] }}>
        <Play size={12} color={deltaColor} weight="fill" />
      </View>
    )

    if (inProgress) {
      line2 = (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          {deltaIcon}
          <Text style={lineStyle}>
            <Text style={[strong, { color: deltaColor }]}>{deltaLabel}</Text> {over ? 'above' : 'under'} your usual pace
            {projected != null ? ` · on track for about ${formatCurrency(projected, hideAmounts)}` : ''}
          </Text>
        </View>
      )
    } else {
      const driverText = driver ? ` · ${driver.emoji ? `${driver.emoji} ` : ''}${driver.category} drove it` : ''
      line2 = (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          {deltaIcon}
          <Text style={lineStyle}>
            <Text style={[strong, { color: deltaColor }]}>{deltaLabel}</Text> {over ? 'above' : 'under'} your usual 3 months
            {driverText}
          </Text>
        </View>
      )
    }
  }

  return (
    <View style={{ gap: 2 }}>
      <Text style={amountStyle}>{spentText}</Text>
      {line2}
    </View>
  )
}
