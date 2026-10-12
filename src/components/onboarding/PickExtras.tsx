import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Brain, Gift, LineChart, Receipt, ScanLine, TrendingUp, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Toggle } from '@/src/components/ui/Toggle'
import { Alert } from '@/src/components/ui/AlertHost'
import { useUser, useUpdateUser } from '@/src/hooks/useUser'
import { HIDEABLE_FEATURES, OPT_IN_FEATURES, hiddenFeatures, type HideableFeature } from '@/src/lib/features'
import { track } from '@/src/lib/analytics'

/** One line each for OPT_IN_FEATURES, in the order they're offered. */
export const EXTRAS: { key: HideableFeature; icon: LucideIcon; pitch: string }[] = [
  { key: 'askAviary', icon: Brain, pitch: 'Ask anything about your spending, in plain words' },
  { key: 'billScan', icon: ScanLine, pitch: "Snap a receipt and it's logged for you" },
  { key: 'wrapped', icon: Gift, pitch: 'A monthly story of your spending, with music' },
  { key: 'insights', icon: LineChart, pitch: 'Trends, a daily heatmap and where it all went' },
  { key: 'subscriptions', icon: Receipt, pitch: 'Every renewal in one place, with a heads-up first' },
  { key: 'investments', icon: TrendingUp, pitch: 'Your portfolio total at a glance' },
]

const labelOf = (key: HideableFeature) => HIDEABLE_FEATURES.find((f) => f.key === key)?.label ?? key

/**
 * Setup's last screen: every extra a new account starts without, each one
 * line, so nobody has to stumble on them later. The budget is already saved,
 * so leaving here keeps the defaults.
 */
export function PickExtras({ onDone }: { onDone: () => void }) {
  const { tokens } = useTheme()
  const user = useUser().data
  const updateUser = useUpdateUser()
  // Always starts with nothing picked: this screen is the opt-in, whatever the account's default.
  const [on, setOn] = useState<Set<HideableFeature>>(() => new Set())

  const flip = (key: HideableFeature, value: boolean) => {
    setOn((prev) => {
      const next = new Set(prev)
      if (value) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const finish = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    // Saved even when nothing's picked, so the choice sticks whatever the account's age.
    const coreHidden = hiddenFeatures(user).filter((k) => !OPT_IN_FEATURES.includes(k))
    track('onboarding_extras_chosen', { extras: [...on].join(','), count: on.size })
    updateUser.mutate(
      { hiddenFeatures: [...coreHidden, ...OPT_IN_FEATURES.filter((k) => !on.has(k))] },
      { onError: () => Alert.alert("Couldn't save your extras", 'Turn them on anytime from You, then Features.') },
    )
    onDone()
  }

  return (
    <View style={{ flex: 1 }}>
      <Animated.Text entering={FadeIn.duration(350)} style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
        Want any extras?
      </Animated.Text>
      <Animated.Text entering={FadeIn.delay(80).duration(350)} style={[styles.blurb, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
        Your budget works without them. Switch on what sounds useful. You can change this anytime in Features.
      </Animated.Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
        {EXTRAS.map(({ key, icon: ExtraIcon, pitch }) => {
          return (
            <View key={key} style={[styles.row, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              <View style={[styles.icon, { backgroundColor: tokens.accentSoft }]}>
                <ExtraIcon size={16} color={tokens.accentInk} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{labelOf(key)}</Text>
                <Text style={[styles.pitch, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{pitch}</Text>
              </View>
              <Toggle accessibilityLabel={`Turn on ${labelOf(key)}`} value={on.has(key)} onValueChange={(v) => flip(key, v)} />
            </View>
          )
        })}
      </ScrollView>

      <Pressable accessibilityRole="button" onPress={finish} style={[styles.cta, { backgroundColor: tokens.accent }]}>
        <Text style={[styles.ctaText, { color: tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>
          {on.size ? 'Start budgeting' : 'Skip for now'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '600', lineHeight: 37, letterSpacing: -0.3 },
  blurb: { fontSize: 15, lineHeight: 23, marginTop: 7, maxWidth: 320 },
  list: { gap: 8, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14 },
  pitch: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  cta: { marginTop: 16, minHeight: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 15 },
})
