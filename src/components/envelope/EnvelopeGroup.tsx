import { useCurrency } from '@/src/context/CurrencyContext'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import Reanimated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { groupEmoji, categoryEmoji, splitEmoji } from '@/src/lib/emoji'
import { Icon } from '@/src/components/shared/Icon'
import { EnvelopeRow } from './EnvelopeRow'
import type { Envelope } from '@/src/lib/envelope'

const SPRING = { damping: 90, stiffness: 900 }
const TRANSITION = LinearTransition.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)

interface Props {
  group: string
  envelopes: Envelope[]
  hideAmounts: boolean
  onMoveMoney: (category: string) => void
  onEditAmount: (category: string) => void
  onViewTransactions: (category: string) => void
  expanded: boolean
  onToggle: (group: string) => void
  onSheetOpenChange?: (open: boolean) => void
}

/** Expandable group header + its category rows, matching the dc.html "Envelopes" panel. */
export function EnvelopeGroup({
  group,
  envelopes,
  hideAmounts,
  onMoveMoney,
  onEditAmount,
  onViewTransactions,
  expanded,
  onToggle,
  onSheetOpenChange,
}: Props) {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const totalAvailable = envelopes.reduce((s, e) => s + e.available, 0)
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withSpring(expanded ? '90deg' : '0deg', SPRING) }],
  }))

  return (
    <Reanimated.View layout={TRANSITION} style={[styles.wrap, { borderTopColor: tokens.border }]}>
      <Pressable style={styles.header} onPress={() => onToggle(group)}>
        <View style={styles.headerLeft}>
          <Reanimated.View style={chevronStyle}>
            <Icon icon={ChevronRight} size={16} color={tokens.text2} />
          </Reanimated.View>
          <Text style={{ fontSize: 14 }}>{groupEmoji(group)}</Text>
          <Text style={[styles.name, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>
            {splitEmoji(group).text}
          </Text>
        </View>
        <Text style={[styles.available, { color: tokens.mint, fontFamily: fontFamily.bodySemiBold }]}>
          {formatCurrency(totalAvailable, hideAmounts)} left
        </Text>
      </Pressable>
      {expanded && (
        <Reanimated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(120)}
          style={[styles.rows, { borderLeftColor: tokens.border }]}
        >
          {envelopes.map((e, i) => (
            <View key={e.category} style={i > 0 && [styles.rowDivider, { borderTopColor: tokens.border }]}>
              <EnvelopeRow
                envelope={e}
                emoji={categoryEmoji(e.category, group)}
                hideAmounts={hideAmounts}
                onMoveMoney={onMoveMoney}
                onEditAmount={onEditAmount}
                onViewTransactions={onViewTransactions}
                onSheetOpenChange={onSheetOpenChange}
              />
            </View>
          ))}
        </Reanimated.View>
      )}
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1, paddingTop: 8, paddingBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 13 },
  available: { fontSize: 12 },
  rows: { paddingLeft: 12, marginLeft: 6, borderLeftWidth: StyleSheet.hairlineWidth },
  // Pulled back to x=0 (rows' own left border) then repadded, so the horizontal
  // line meets the vertical group line instead of starting after paddingLeft.
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2, marginLeft: -12, paddingLeft: 12 },
})
