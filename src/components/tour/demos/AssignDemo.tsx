import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Reanimated from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Check } from 'lucide-react-native'
import { Icon } from '@/src/components/shared/Icon'
import { usePressSpring } from '@/src/components/ui/Button'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { AmountText } from '@/src/components/ui/AmountText'
import { TourRow } from '@/src/components/tour/parts'
import { ASSIGN_ROWS, TOUR_INCOME } from '@/src/components/tour/content'

/** Chapter 1: hand out the income until Ready to Assign hits zero. */
export function AssignDemo({ onComplete }: { onComplete: () => void }) {
  const { formatCurrency } = useCurrency()

  const { tokens, radius, space, type } = useTheme()
  const [funded, setFunded] = useState<Record<string, boolean>>({})

  const assigned = ASSIGN_ROWS.reduce((sum, row) => sum + (funded[row.id] ? row.plan : 0), 0)
  const readyToAssign = TOUR_INCOME - assigned

  function toggle(id: string) {
    const next = { ...funded }
    if (next[id]) delete next[id]
    else next[id] = true
    setFunded(next)
    const left = TOUR_INCOME - ASSIGN_ROWS.reduce((sum, row) => sum + (next[row.id] ? row.plan : 0), 0)
    if (left === 0) onComplete()
  }

  const heroColor = readyToAssign === 0 ? tokens.mint : readyToAssign < 0 ? tokens.coral : tokens.text
  const note =
    readyToAssign === 0
      ? 'All your money has a job'
      : readyToAssign < 0
        ? "You've assigned more than you earn"
        : `${formatCurrency(readyToAssign)} of your ${formatCurrency(TOUR_INCOME)} income has no job yet`

  return (
    <View style={{ gap: space.md }}>
      <View
        style={[
          styles.hero,
          { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.lg, padding: space.lg },
        ]}
      >
        <Text style={[styles.heroLabel, { color: tokens.text2, fontFamily: fontFamily.bodyBold, fontSize: type.micro }]}>
          READY TO ASSIGN
        </Text>
        <AmountText value={readyToAssign} size={type.display} color={heroColor} weight="displayBold" animate ignoreHide id="tour-rta" />
        <View style={styles.heroNoteRow}>
        <Text
          style={[
            styles.heroNote,
            {
              color: readyToAssign === 0 ? tokens.mint : readyToAssign < 0 ? tokens.coral : tokens.text2,
              fontFamily: fontFamily.bodySemiBold,
              fontSize: type.caption,
            },
          ]}
        >
          {note}
        </Text>
        {readyToAssign === 0 && <Icon icon={Check} size={16} color={tokens.mint} strokeWidth={3} />}
        </View>
      </View>

      {ASSIGN_ROWS.map((row) => {
        const on = !!funded[row.id]
        return (
          <TourRow
            key={row.id}
            emoji={row.emoji}
            name={row.name}
            note={on ? `${formatCurrency(row.plan)} funded` : `needs ${formatCurrency(row.plan)}`}
            noteColor={on ? tokens.mint : undefined}
            right={
              <FundPill on={on} label={`Assign ${formatCurrency(row.plan)}`} onPress={() => toggle(row.id)} />
            }
          />
        )
      })}

      <Pressable accessibilityRole="button" onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
          setFunded({})
        }}
        style={styles.reset} hitSlop={8}>
        <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyBold, fontSize: type.caption }}>Start over</Text>
      </Pressable>
    </View>
  )
}

function FundPill({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const { tokens, radius, space, type } = useTheme()
  const press = usePressSpring(0.94)
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        onPress()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.pill,
        {
          borderRadius: radius.full,
          paddingHorizontal: space.md,
          backgroundColor: on ? tokens.mintSoft : tokens.pillBg,
          borderColor: on ? tokens.mint : tokens.border,
        },
        press.style,
      ]}
    >
      {on && <Icon icon={Check} size={14} color={tokens.mint} strokeWidth={3} />}
      <Text style={{ color: on ? tokens.mint : tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.micro }}>{on ? 'Funded' : label}</Text>
    </AnimatedPressable>
  )
}

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable)

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 4, borderWidth: 1 },
  heroLabel: { letterSpacing: 1 },
  heroNote: { textAlign: 'center' },
  pill: { height: 32, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  heroNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reset: { alignSelf: 'center', padding: 4 },
})
