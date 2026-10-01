import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Check } from 'lucide-react-native'
import { PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases'
import { Button, usePressSpring } from '@/src/components/ui/Button'
import { Icon } from '@/src/components/shared/Icon'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { yearlySavingsPercent } from '@/src/lib/billingStatus'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
// Same spring as AutoCategoryPill's landing pop.
const POP_SPRING = { mass: 0.7, damping: 12, stiffness: 160 }

/** A subtle overshoot-and-settle whenever `key` changes to a value where `when` holds (not on mount). */
function usePop(key: unknown, peak: number, when = true) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (reduceMotion || !when) return
    scale.value = withSequence(withTiming(peak, { duration: 120 }), withSpring(1, POP_SPRING))
  }, [key, peak, when, reduceMotion, scale])
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
}

/**
 * What a subscription gets you. There's no free tier to compare against, so
 * this is the whole app, listed plainly. Nothing here promises unlimited AI
 * (pricing.md): allowances are still to be set.
 */
export const BENEFITS = [
  'As many envelopes and expenses as you like',
  'Snap a bill instead of typing it in',
  'Ask Aviary where your money went',
  'Monthly Wrapped and spending insights',
  'Track bills, subscriptions and investments',
  'Widgets on your home screen, plus the web app',
  'No ads. Ever.',
]

/**
 * The paywall: one plan, billed monthly or yearly.
 *
 * Prices are always the store's own strings, already localized. They're never
 * formatted here, because Play decides the price in the buyer's currency.
 * `unlockDate` set means the trial is still running: the plans are shown so
 * the price is never a surprise, but checkout stays closed until it ends.
 */
export function PlanPicker({
  packages,
  unlockDate,
  busy,
  onBuy,
}: {
  packages: PurchasesPackage[]
  unlockDate: string | null
  busy: boolean
  onBuy: (pkg: PurchasesPackage) => void
}) {
  const { tokens } = useTheme()
  const monthly = packages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY)
  const yearly = packages.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL)
  const [selectedId, setSelectedId] = useState<string | undefined>((yearly ?? monthly)?.identifier)
  const selected = packages.find((p) => p.identifier === selectedId) ?? yearly ?? monthly
  const subscribePop = usePop(selectedId, 1.04)
  const choose = (id: string) => {
    if (id === selectedId) return
    Haptics.selectionAsync().catch(() => {})
    setSelectedId(id)
  }
  const savings = monthly && yearly ? yearlySavingsPercent(monthly.product.price, yearly.product.price) : null

  if (!selected) return null
  const isYearly = selected.packageType === PACKAGE_TYPE.ANNUAL

  return (
    <View style={[styles.card, { backgroundColor: tokens.cardSolid, borderColor: tokens.accentSoft }]}>
      <View style={{ gap: 4 }}>
        <Text style={[styles.eyebrow, { color: tokens.accentInk, fontFamily: fontFamily.bodyExtraBold }]}>AVIARY PRO</Text>
        <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Keep your budget going</Text>
        <Text style={[styles.sub, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>One plan. Everything&apos;s included.</Text>
      </View>

      <View style={{ gap: 8 }}>
        {yearly ? (
          <Option
            label="Yearly"
            detail={yearly.product.pricePerMonthString ? `${yearly.product.pricePerMonthString}/month, billed yearly` : 'Billed yearly'}
            price={`${yearly.product.priceString}/year`}
            badge={savings ? `Save ${savings}%` : undefined}
            selected={selected === yearly}
            onPress={() => choose(yearly.identifier)}
          />
        ) : null}
        {monthly ? (
          <Option
            label="Monthly"
            detail="Billed monthly"
            price={`${monthly.product.priceString}/month`}
            selected={selected === monthly}
            onPress={() => choose(monthly.identifier)}
          />
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.benefit}>
            <View style={[styles.tick, { backgroundColor: tokens.mintSoft }]}>
              <Icon icon={Check} size={12} color={tokens.mint} strokeWidth={3} />
            </View>
            <Text style={[styles.benefitText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <Animated.View style={subscribePop}>
        <Button
          label={
            unlockDate
              ? `Available from ${unlockDate}`
              : busy
                ? 'Opening Google Play…'
                : `Subscribe ${isYearly ? 'yearly' : 'monthly'} · ${selected.product.priceString}`
          }
          disabled={!!unlockDate || busy}
          onPress={() => onBuy(selected)}
        />
        </Animated.View>
        <Text style={[styles.fine, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
          {unlockDate
            ? "Your free trial runs until then. You won't be charged unless you subscribe."
            : `Renews every ${isYearly ? 'year' : 'month'} through Google Play. Cancel anytime from the Play Store.`}
        </Text>
      </View>
    </View>
  )
}

function Option({
  label,
  detail,
  price,
  badge,
  selected,
  onPress,
}: {
  label: string
  detail: string
  price: string
  badge?: string
  selected: boolean
  onPress: () => void
}) {
  const { tokens } = useTheme()
  const press = usePressSpring(0.97)
  const selectPop = usePop(selected, 1.03, selected)
  return (
    <Animated.View style={selectPop}>
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.option,
        { borderColor: selected ? tokens.accent : tokens.border, backgroundColor: selected ? tokens.accentSoft : tokens.inputBg },
        press.style,
      ]}
    >
      <View style={[styles.radio, { borderColor: selected ? tokens.accent : tokens.borderStrong }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: tokens.accent }]} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.optionHead}>
          <Text style={[styles.optionLabel, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{label}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: tokens.mintSoft }]}>
              <Text style={[styles.badgeText, { color: tokens.mint, fontFamily: fontFamily.bodyExtraBold }]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.optionDetail, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{detail}</Text>
      </View>
      <Text style={[styles.optionPrice, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{price}</Text>
    </AnimatedPressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 18 },
  eyebrow: { fontSize: 11, letterSpacing: 1.2 },
  title: { fontSize: 22 },
  sub: { fontSize: 13 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionLabel: { fontSize: 15 },
  optionDetail: { fontSize: 12 },
  optionPrice: { fontSize: 15 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, letterSpacing: 0.3 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tick: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  benefitText: { flex: 1, fontSize: 13, lineHeight: 19 },
  fine: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
})
