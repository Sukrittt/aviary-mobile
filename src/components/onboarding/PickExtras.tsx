import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Brain, Check, Gift, ChartLine, Receipt, Scan, TrendUp, type PhosphorIcon } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Alert } from '@/src/components/ui/AlertHost'
import { useUser, useUpdateUser } from '@/src/hooks/useUser'
import { HIDEABLE_FEATURES, OPT_IN_FEATURES, hiddenFeatures, type HideableFeature } from '@/src/lib/features'
import { track } from '@/src/lib/analytics'

/** One line each for OPT_IN_FEATURES, in the order they're offered. */
export const EXTRAS: { key: HideableFeature; icon: PhosphorIcon; pitch: string }[] = [
  { key: 'askAviary', icon: Brain, pitch: 'Ask anything about your spending, in plain words' },
  { key: 'billScan', icon: Scan, pitch: "Snap a receipt and it's logged for you" },
  { key: 'wrapped', icon: Gift, pitch: 'A monthly story of your spending, with music' },
  { key: 'insights', icon: ChartLine, pitch: 'Trends, a daily heatmap and where it all went' },
  { key: 'subscriptions', icon: Receipt, pitch: 'Every renewal in one place, with a heads-up first' },
  { key: 'investments', icon: TrendUp, pitch: 'Your portfolio total at a glance' },
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

  const [saving, setSaving] = useState(false)

  // Waits for the save before leaving: setup unmounts on onDone, which would drop a failure silently.
  const finish = async () => {
    if (saving) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    setSaving(true)
    // Saved even when nothing's picked, so the choice sticks whatever the account's age.
    const coreHidden = hiddenFeatures(user).filter((k) => !OPT_IN_FEATURES.includes(k))
    track('onboarding_extras_chosen', { extras: [...on].join(','), count: on.size })
    try {
      await updateUser.mutateAsync({ hiddenFeatures: [...coreHidden, ...OPT_IN_FEATURES.filter((k) => !on.has(k))] })
    } catch {
      Alert.alert("Couldn't save your extras", 'Turn them on anytime from You, then Features.')
    }
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
        {EXTRAS.map(({ key, icon: ExtraIcon, pitch }) => (
            <ExtraRow
              key={key}
              icon={ExtraIcon}
              label={labelOf(key)}
              pitch={pitch}
              on={on.has(key)}
              onToggle={() => flip(key, !on.has(key))}
            />
        ))}
      </ScrollView>

      <Pressable accessibilityRole="button" onPress={finish} disabled={saving} style={[styles.cta, { backgroundColor: tokens.accent, opacity: saving ? 0.6 : 1 }]}>
        <Text style={[styles.ctaText, { color: tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>
          {saving ? 'Saving…' : on.size ? 'Start budgeting' : 'Skip for now'}
        </Text>
      </Pressable>
    </View>
  )
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * One extra, tappable anywhere. Same check and motion as setup's group and
 * category rows (PickRow.tsx): a quick timed check and a small press-in bounce.
 */
function ExtraRow({ icon: ExtraIcon, label, pitch, on, onToggle }: { icon: PhosphorIcon; label: string; pitch: string; on: boolean; onToggle: () => void }) {
  const { tokens, motion } = useTheme()
  const reduceMotion = useReducedMotion()
  const mounted = useRef(false)
  const rowScale = useSharedValue(1)
  const checkScale = useSharedValue(1)
  const checkProgress = useSharedValue(on ? 1 : 0)
  const tapSpring = { duration: motion.fast, dampingRatio: 1 } as const

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    checkProgress.value = withTiming(on ? 1 : 0, { duration: motion.fast, easing: Easing.bezier(0.23, 1, 0.32, 1) })
  }, [checkProgress, motion.fast, on])

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ scale: reduceMotion ? 1 : rowScale.value }] }))
  const checkBoxStyle = useAnimatedStyle(() => ({ transform: [{ scale: reduceMotion ? 1 : checkScale.value }] }))
  const checkIconStyle = useAnimatedStyle(() => ({
    opacity: checkProgress.value,
    transform: [{ scaleX: reduceMotion ? 1 : checkProgress.value }],
  }))

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityLabel={`Turn on ${label}`}
      accessibilityState={{ checked: on }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        onToggle()
      }}
      onPressIn={() => {
        if (reduceMotion) return
        rowScale.value = withSpring(0.985, tapSpring)
        checkScale.value = withSpring(0.9, tapSpring)
      }}
      onPressOut={() => {
        rowScale.value = reduceMotion ? 1 : withSpring(1, tapSpring)
        checkScale.value = reduceMotion ? 1 : withSpring(1, tapSpring)
      }}
      style={[styles.row, { backgroundColor: on ? tokens.card : 'transparent', borderColor: on ? tokens.accent : tokens.border }, rowStyle]}
    >
      <View style={[styles.icon, { backgroundColor: tokens.accentSoft }]}>
        <ExtraIcon size={16} color={tokens.accentInk} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{label}</Text>
        <Text style={[styles.pitch, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{pitch}</Text>
      </View>
      <Animated.View
        style={[styles.check, { borderColor: on ? tokens.accent : tokens.borderStrong, backgroundColor: on ? tokens.accent : 'transparent' }, checkBoxStyle]}
      >
        <Animated.View style={[styles.checkIcon, checkIconStyle]}>
          <Check size={16} color={tokens.onAccent} weight="bold" />
        </Animated.View>
      </Animated.View>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '600', lineHeight: 37, letterSpacing: -0.3 },
  blurb: { fontSize: 15, lineHeight: 23, marginTop: 7, maxWidth: 320 },
  list: { gap: 8, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkIcon: { width: 16, height: 16, transformOrigin: 'left' },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14 },
  pitch: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  cta: { marginTop: 16, minHeight: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 15 },
})
