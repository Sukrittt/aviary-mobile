import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useCurrency } from '@/src/context/CurrencyContext'
import { currencyUnit } from '@/src/lib/currencies'
import { Icon } from '@/src/components/shared/Icon'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { MoneyWavy } from '@/src/components/shared/icons'

/**
 * Setup's plan remainder, always on. Settled it's Home's slim Ready to Assign
 * row ("All planned"), after a mint "every rupee has a job" beat that plays
 * on open (the suggestion plans everything) and each time the plan lands back
 * on zero. With money left or over it fades to accent or coral. Twin of Web's
 * PlanStrip in app/onboarding/page.tsx.
 */
export function PlanStrip({ rem }: { rem: number }) {
  const { tokens, type } = useTheme()
  const { formatMoney, currencyCode } = useCurrency()
  const settled = rem === 0
  const [celebrating, setCelebrating] = useState(settled)
  const [wasSettled, setWasSettled] = useState(settled)
  if (settled !== wasSettled) {
    setWasSettled(settled)
    setCelebrating(settled)
  }
  useEffect(() => {
    if (!celebrating) return
    const t = setTimeout(() => setCelebrating(false), 2500)
    return () => clearTimeout(t)
  }, [celebrating])

  const state = celebrating ? 'celebrate' : settled ? 'settled' : rem < 0 ? 'over' : 'under'
  const look = {
    celebrate: { bg: tokens.pillGoodBg, border: tokens.pillGoodBg, ink: tokens.mint },
    settled: { bg: tokens.card, border: tokens.border, ink: tokens.text },
    under: { bg: tokens.accentSoft, border: tokens.accentInk, ink: tokens.accentInk },
    over: { bg: tokens.coralSoft, border: tokens.coral, ink: tokens.coral },
  }[state]
  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(look.bg, { duration: 400 }),
    borderColor: withTiming(look.border, { duration: 400 }),
  }))

  return (
    <Reanimated.View style={[styles.strip, boxStyle]}>
      <Reanimated.View key={state} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={styles.label}>
        {celebrating ? (
          <CheckIcon color={tokens.mint} size={16} />
        ) : settled ? (
          <View style={[styles.icon, { backgroundColor: tokens.pillGoodBg }]}>
            <Icon icon={MoneyWavy} size={16} color={tokens.pillGood} />
          </View>
        ) : null}
        <Text
          accessibilityRole={celebrating ? 'alert' : undefined}
          style={{
            color: look.ink,
            fontSize: settled ? type.body : 12,
            fontFamily: settled ? fontFamily.bodySemiBold : fontFamily.bodyExtraBold,
          }}
        >
          {celebrating ? `Every ${currencyUnit(currencyCode)} has a job.` : settled ? 'All planned' : rem < 0 ? 'Over by' : 'Left to plan'}
        </Text>
      </Reanimated.View>
      <Text style={{ color: settled ? tokens.mint : look.ink, fontSize: 17, fontFamily: fontFamily.displayBold, fontVariant: ['tabular-nums'] }}>
        {formatMoney(Math.abs(rem))}
      </Text>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
})
