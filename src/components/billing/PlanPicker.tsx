import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Bell, Camera, ChatCircle, Check, CheckCircle, Sparkle, SquaresFour, type PhosphorIcon } from '@/src/components/shared/icons'
import { PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases'
import { Button, usePressSpring } from '@/src/components/ui/Button'
import { Icon } from '@/src/components/shared/Icon'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { REMINDER_DAYS, formatDate, yearlySavingsPercent } from '@/src/lib/billingStatus'

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
  'As many categories and expenses as you like',
  'Snap a bill instead of typing it in',
  'Ask Aviary where your money went',
  'Monthly Wrapped and spending insights',
  'Track bills, subscriptions and investments',
  'Widgets on your home screen, plus the web app',
  'No ads. Ever.',
]

/** "8 November": the timeline's step labels, where the year is obvious. */
function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}

/** Direction B: what a subscription keeps switched on, one card each. */
const FEATURES: { icon: PhosphorIcon; title: string; blurb: string; tint: 'accent' | 'violet' | 'mint' | 'blue' }[] = [
  { icon: Camera, title: 'Snap a bill', blurb: 'Split a receipt without typing it in.', tint: 'accent' },
  { icon: ChatCircle, title: 'Ask Aviary', blurb: '"Where did my money go?" Answered.', tint: 'violet' },
  { icon: Sparkle, title: 'Monthly Wrapped', blurb: 'Your month as a story, not a spreadsheet.', tint: 'mint' },
  { icon: SquaresFour, title: 'Widgets + web', blurb: 'Home screen on Android, full app on the web.', tint: 'blue' },
]

/**
 * The paywall: one plan, billed monthly or yearly, under one of two headers.
 * `timeline` (still on the trial) walks through what happens and when;
 * `benefits` (access ended) shows what a plan keeps switched on.
 *
 * Prices are always the store's own strings, already localized. They're never
 * formatted here, because Play decides the price in the buyer's currency.
 * Until `canBuy`, the plans are information only: Play charges the moment a
 * subscription starts, so there's no button, just when buying opens.
 * `pinned` fills the screen with the CTA held at the bottom (the paywall
 * modal); otherwise it's a card that sits in a scrolling page.
 */
export function PlanPicker({
  packages,
  variant,
  trialEndsAt,
  trialDaysRemaining,
  canBuy,
  busy,
  onBuy,
  pinned = false,
}: {
  packages: PurchasesPackage[]
  variant: 'timeline' | 'benefits'
  trialEndsAt: string | null
  trialDaysRemaining: number
  canBuy: boolean
  busy: boolean
  onBuy: (pkg: PurchasesPackage) => void
  pinned?: boolean
}) {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
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
  const endMs = trialEndsAt ? Date.parse(trialEndsAt) : NaN
  const fromPrice = yearly?.product.pricePerMonthString
    ? `${yearly.product.pricePerMonthString} a month`
    : monthly
      ? `${monthly.product.priceString} a month`
      : `${selected.product.priceString} a year`
  // Reminders the server still has to send, as dates.
  const reminders = Number.isNaN(endMs) ? [] : REMINDER_DAYS.filter((d) => trialDaysRemaining > d).map((d) => shortDate(endMs - d * 86_400_000))

  const header =
    variant === 'timeline' ? (
      <>
        <View style={{ gap: 6 }}>
          <Text style={[styles.eyebrow, { color: tokens.accentInk, fontFamily: fontFamily.bodyExtraBold }]}>AVIARY PRO</Text>
          <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Try everything. Pay only if it sticks.</Text>
          <Text style={[styles.sub, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            {`Your trial ends on ${formatDate(trialEndsAt)}. Here's exactly what happens.`}
          </Text>
        </View>
        <View>
          <Step icon={Sparkle} label="Today" body="Everything's still unlocked. Log, scan, ask, Wrapped. The lot." />
          {reminders.length ? <Step icon={Bell} label={reminders.join(' · ')} body="We'll nudge you again before anything changes." /> : null}
          {Number.isNaN(endMs) ? null : (
            <Step icon={CheckCircle} label={shortDate(endMs)} body={`Trial ends. Keep going from ${fromPrice}, or export your data free and leave. No hard feelings.`} last />
          )}
        </View>
      </>
    ) : (
      <>
        <View style={{ gap: 6 }}>
          <Text style={[styles.eyebrow, { color: tokens.accentInk, fontFamily: fontFamily.bodyExtraBold }]}>AVIARY PRO</Text>
          <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Keep your budget going</Text>
          <Text style={[styles.sub, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>One plan. No ads, ever. Here&apos;s what it keeps switched on.</Text>
        </View>
        <View style={styles.grid}>
          {FEATURES.map((f) => (
            <View key={f.title} style={[styles.feature, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
              <View style={[styles.featureIcon, { backgroundColor: tokens[`${f.tint}Soft`] }]}>
                <Icon icon={f.icon} size={18} color={f.tint === 'accent' ? tokens.accentInk : tokens[f.tint]} weight="bold" />
              </View>
              <Text style={[styles.featureTitle, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{f.title}</Text>
              <Text style={[styles.featureBlurb, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{f.blurb}</Text>
            </View>
          ))}
        </View>
      </>
    )

  const options = (
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
  )

  const footer = canBuy ? (
    <View style={{ gap: 10 }}>
      <Animated.View style={subscribePop}>
        <Button
          label={busy ? 'Opening Google Play…' : `Keep Aviary · ${selected.product.priceString}/${isYearly ? 'year' : 'month'}`}
          disabled={busy}
          onPress={() => onBuy(selected)}
        />
      </Animated.View>
      <View style={styles.trust}>
        {['Cancel anytime', 'Export free, always'].map((t) => (
          <View key={t} style={styles.trustItem}>
            <Icon icon={Check} size={12} color={tokens.mint} weight="bold" />
            <Text style={[styles.fine, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{t}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.fine, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>Renews through Google Play until you cancel.</Text>
    </View>
  ) : (
    <Text style={[styles.quiet, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
      {`You can subscribe from ${formatDate(trialEndsAt)}. We'll remind you.`}
    </Text>
  )

  if (pinned) {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.pinnedBody}>
          {header}
          {options}
        </ScrollView>
        <View style={[styles.pinnedFooter, { borderTopColor: tokens.border, backgroundColor: tokens.bg, paddingBottom: insets.bottom + 12 }]}>{footer}</View>
      </View>
    )
  }
  return (
    <View style={[styles.card, { backgroundColor: tokens.cardSolid, borderColor: tokens.accentSoft }]}>
      {header}
      {options}
      {footer}
    </View>
  )
}

/** One dated step on the timeline, joined to the next by a rail. */
function Step({ icon, label, body, last }: { icon: PhosphorIcon; label: string; body: string; last?: boolean }) {
  const { tokens } = useTheme()
  return (
    <View style={styles.step}>
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.stepDot, { backgroundColor: tokens.accentSoft }]}>
          <Icon icon={icon} size={16} color={tokens.accentInk} weight="bold" />
        </View>
        {last ? null : <View style={[styles.rail, { backgroundColor: tokens.accentSoft }]} />}
      </View>
      <View style={{ flex: 1, gap: 2, paddingBottom: last ? 0 : 18 }}>
        <Text style={[styles.stepLabel, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{label}</Text>
        <Text style={[styles.stepBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{body}</Text>
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
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 20 },
  pinnedBody: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 24 },
  pinnedFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  eyebrow: { fontSize: 12, letterSpacing: 1.2 },
  title: { fontSize: 28, lineHeight: 34 },
  sub: { fontSize: 14, lineHeight: 20 },
  step: { flexDirection: 'row', gap: 14 },
  stepDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rail: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1 },
  stepLabel: { fontSize: 15, marginTop: 6 },
  stepBody: { fontSize: 13, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  feature: { flexBasis: '45%', flexGrow: 1, borderWidth: 1, borderRadius: 18, padding: 14, gap: 6 },
  featureIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  featureTitle: { fontSize: 14 },
  featureBlurb: { fontSize: 12, lineHeight: 17 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionLabel: { fontSize: 15 },
  optionDetail: { fontSize: 12 },
  optionPrice: { fontSize: 15 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, letterSpacing: 0.3 },
  trust: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fine: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  quiet: { fontSize: 13, lineHeight: 19, textAlign: 'center', paddingVertical: 6 },
})
