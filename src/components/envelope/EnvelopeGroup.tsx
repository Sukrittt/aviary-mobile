import { useCurrency } from '@/src/context/CurrencyContext'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { CaretRight } from '@/src/components/shared/icons'
import Reanimated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { splitEmoji } from '@/src/lib/emoji'
import { categoryIconKey } from '@/src/lib/categoryIcons'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { Icon } from '@/src/components/shared/Icon'
import { EnvelopeRow } from './EnvelopeRow'
import { useCategories } from '@/src/hooks/useCategories'
import type { Envelope } from '@/src/lib/envelope'
import type { WeekPace } from '@/src/lib/weekly'

const SPRING = { damping: 90, stiffness: 900 }
const TRANSITION = LinearTransition.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)

interface Props {
  group: string
  /** The group's picked icon, from useGroupIcons(). */
  groupIcon?: string
  /** Picked category icons by name, from useCategoryIcons(). */
  categoryIcons?: Map<string, string>
  envelopes: Envelope[]
  hideAmounts: boolean
  onMoveMoney: (category: string, amount?: number) => void
  onEditAmount: (category: string) => void
  onViewTransactions: (category: string) => void
  onEditGoal?: (category: string) => void
  expanded: boolean
  onToggle: (group: string) => void
  onSheetOpenChange?: (open: boolean) => void
  /** Bump to roll last month's carry into each Left pill. 0 shows them settled. */
  rollPlay?: number
  /** Each carrying row's place in Home's top-to-bottom roll. */
  rollOrder?: Map<string, number>
  /** This week's pace for each weekly-tracked category. */
  paces?: Map<string, WeekPace>
  /** False while a screen covers Home, so a Left pill's rise waits to roll where it's seen. */
  active?: boolean
  onToast?: (message: string) => void
}

/** Expandable group header + its category rows, matching the dc.html "Envelopes" panel. */
export function EnvelopeGroup({
  group,
  groupIcon,
  categoryIcons,
  envelopes,
  hideAmounts,
  onMoveMoney,
  onEditAmount,
  onViewTransactions,
  onEditGoal,
  expanded,
  onToggle,
  onSheetOpenChange,
  rollPlay = 0,
  rollOrder,
  paces,
  active = true,
  onToast,
}: Props) {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const totalAvailable = envelopes.reduce((s, e) => s + e.available, 0)
  // A group of nothing but goals is about filling up, so its total says how full.
  const categories = useCategories().data
  const goals = envelopes.map((e) => categories?.find((c) => c.name === e.category)?.goal)
  const goalTarget = goals.every(Boolean) ? goals.reduce((s, goal) => s + (goal?.amount ?? 0), 0) : 0
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withSpring(expanded ? '90deg' : '0deg', SPRING) }],
  }))

  return (
    <Reanimated.View layout={TRANSITION} style={[styles.wrap, { borderTopColor: tokens.border }]}>
      <Pressable style={styles.header} onPress={() => onToggle(group)}>
        <View style={styles.headerLeft}>
          <Reanimated.View style={chevronStyle}>
            <Icon icon={CaretRight} size={16} color={tokens.text2} />
          </Reanimated.View>
          <CategoryIcon kind="group" name={group} icon={groupIcon} size={14} color={tokens.text2} />
          <Text style={[styles.name, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>
            {splitEmoji(group).text}
          </Text>
        </View>
        {/* A summary, so neutral: color is the rows' pills' job. Red only when
            the group as a whole is over. */}
        <Text style={[styles.available, { color: totalAvailable < 0 ? tokens.pillOver : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
          {goalTarget > 0
            ? `${formatCurrency(totalAvailable, hideAmounts)} of ${formatCurrency(goalTarget, hideAmounts)} saved`
            : totalAvailable < 0
            ? `${formatCurrency(-totalAvailable, hideAmounts)} over`
            : `${formatCurrency(totalAvailable, hideAmounts)} left`}
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
                icon={categoryIconKey(e.category, categoryIcons?.get(e.category), group)}
                hideAmounts={hideAmounts}
                onMoveMoney={onMoveMoney}
                onEditAmount={onEditAmount}
                onViewTransactions={onViewTransactions}
                onEditGoal={onEditGoal}
                onSheetOpenChange={onSheetOpenChange}
                rollPlay={rollPlay}
                rollDelayMs={Math.min(rollOrder?.get(e.category) ?? 0, 5) * 150}
                pace={paces?.get(e.category)}
                active={active}
                onToast={onToast}
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
