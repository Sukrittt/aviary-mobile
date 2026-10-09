import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Check, FolderOpen, Sparkles, Tags, WalletCards, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import type { ThemeTokens } from '@/src/theme/tokens'
import { fontFamily } from '@/src/theme/fonts'


// SetupWizard.dc.html:44,53-93,537-542 — the "your budget is ready" celebration
// screen. Each piece follows confettiFall: fade in by 12%, fall 320px while
// drifting dx and rotating 180+i*37deg, fading out.
const CONFETTI_COLORS = ['accent', 'mint', 'coral', 'violet', 'blue'] as const

export function ConfettiPiece({ index, tokens }: { index: number; tokens: ThemeTokens }) {
  const left = 6 + ((index * 5.3) % 88)
  const dx = (index % 2 ? 1 : -1) * (14 + ((index * 7) % 46))
  const rot = 180 + index * 37
  const delay = index * 55
  const duration = 1700 + (index % 5) * 280
  const width = 6 + (index % 4)
  const height = 9 + (index % 6)
  const color = tokens[CONFETTI_COLORS[index % 5]]

  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: Easing.bezier(0.3, 0.1, 0.6, 1) }))
  }, [progress, delay, duration])

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 1], [0, 1, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [-10, 320]) },
      { translateX: interpolate(progress.value, [0, 1], [0, dx]) },
      { rotate: `${interpolate(progress.value, [0, 1], [0, rot])}deg` },
    ],
  }))

  return (
    <Animated.View
      style={[
        { position: 'absolute', top: -8, left: `${left}%`, width, height, borderRadius: 2, backgroundColor: color },
        style,
      ]}
    />
  )
}

export function SetupDone({
  income,
  groupCount,
  categoryCount,
  onFinish,
}: {
  income: number
  groupCount: number
  categoryCount: number
  onFinish: () => void
}) {
  const { formatMoney } = useCurrency()

  const { tokens } = useTheme()
  const confetti = useMemo(() => Array.from({ length: 18 }, (_, i) => i), [])

  const summary: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: WalletCards, label: 'Monthly income', value: income > 0 ? formatMoney(income) : 'Not set yet' },
    { icon: FolderOpen, label: 'Groups', value: String(groupCount) },
    { icon: Tags, label: 'Categories', value: String(categoryCount) },
  ]

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.confettiField} pointerEvents="none">
        {confetti.map((i) => (
          <ConfettiPiece key={i} index={i} tokens={tokens} />
        ))}
      </View>

      <Animated.View entering={FadeIn.duration(350)} style={[styles.badge, { backgroundColor: tokens.mintSoft }]}>
        <Check size={30} color={tokens.mint} strokeWidth={2.4} />
      </Animated.View>
      <Animated.Text
        entering={FadeIn.delay(80).duration(350)}
        style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}
      >
        Your budget is{'\n'}ready to go.
      </Animated.Text>
      <Animated.Text
        entering={FadeIn.delay(140).duration(350)}
        style={[styles.blurb, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}
      >
        Everything below can be changed later from Envelopes.
      </Animated.Text>
      {/* Sets up the first-week recap from day 0. */}
      <Animated.View entering={FadeIn.delay(170).duration(350)} style={[styles.promise, { backgroundColor: tokens.accentSoft }]}>
        <Sparkles size={13} color={tokens.accentInk} strokeWidth={2.4} />
        <Text
          numberOfLines={1}
          style={[styles.promiseText, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}
        >
          Your first-week recap lands in 7 days
        </Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(200).duration(350)} style={styles.summaryList}>
        {summary.map((s) => {
          const SummaryIcon = s.icon
          return (
            <View key={s.label} style={[styles.summaryRow, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              <View style={[styles.summaryIcon, { backgroundColor: tokens.accentSoft }]}>
                <SummaryIcon size={16} color={tokens.accentInk} strokeWidth={2.2} />
              </View>
              <Text style={[styles.summaryLabel, { color: tokens.text2 }, { fontFamily: fontFamily.bodyMedium }]}>{s.label}</Text>
              <Text style={[styles.summaryValue, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{s.value}</Text>
            </View>
          )
        })}
      </Animated.View>

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
          onFinish()
        }}
        style={[styles.cta, { backgroundColor: tokens.accent }]}
      >
        <Text style={[styles.ctaText, { color: tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>Continue</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  promise: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
  promiseText: { flexShrink: 1, fontSize: 12.5, lineHeight: 17 },
  confettiField: { position: 'absolute', top: 0, left: 0, right: 0, height: 340, overflow: 'hidden' },
  badge: { width: 60, height: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '600', lineHeight: 37, marginTop: 12, letterSpacing: -0.3 },
  blurb: { fontSize: 15, lineHeight: 23, marginTop: 7, maxWidth: 300 },
  summaryList: { marginTop: 22, gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1 },
  summaryIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { flex: 1, fontSize: 13 },
  summaryValue: { fontSize: 15 },
  cta: { marginTop: 16, minHeight: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 15 },
})
