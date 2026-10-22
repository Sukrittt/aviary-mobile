import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Brain, Check, Gift, ChartLine, Receipt, Scan, TrendUp, type PhosphorIcon } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Alert } from '@/src/components/ui/AlertHost'
import { useUser, useUpdateUser } from '@/src/hooks/useUser'
import { HIDEABLE_FEATURES, OPT_IN_FEATURES, extrasUnchosen, hiddenFeatures, type HideableFeature } from '@/src/lib/features'
import { Card } from '@/src/components/ui/Card'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { SlideStrip } from '@/src/components/shared/SlideStrip'
import { track } from '@/src/lib/analytics'
import { tap } from '@/src/lib/haptics'

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

/** How long the saved check holds before the card slides away. */
const SAVED_HOLD_MS = 1100

/**
 * Home's card for every extra a new account starts without, each one line, so
 * nobody has to stumble on them later. It used to be a setup screen; now it
 * waits on Home until the account makes a choice here or in Features, on any
 * device, so a choice anywhere retires it.
 */
export function PickExtras() {
  const { tokens, space, type } = useTheme()
  const user = useUser().data
  const updateUser = useUpdateUser()
  // Always starts with nothing picked: this card is the opt-in, whatever the account's default.
  const [on, setOn] = useState<Set<HideableFeature>>(() => new Set())
  // Saving writes the choice to the cached profile straight away, which would
  // drop the card mid-check. The phase keeps it up until it has slid off.
  const [phase, setPhase] = useState<'open' | 'saving' | 'saved' | 'leaving' | 'gone'>('open')

  useEffect(() => {
    if (phase !== 'saved') return
    const t = setTimeout(() => setPhase('leaving'), SAVED_HOLD_MS)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'gone' || (phase === 'open' && !extrasUnchosen(user))) return null

  const flip = (key: HideableFeature) => {
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Saved even when nothing's picked, so the choice sticks and the card stays gone.
  const save = async (chosen: Set<HideableFeature>) => {
    if (phase !== 'open') return
    tap()
    const picked = chosen.size > 0
    setPhase(picked ? 'saving' : 'leaving')
    const coreHidden = hiddenFeatures(user).filter((k) => !OPT_IN_FEATURES.includes(k))
    track('onboarding_extras_chosen', { extras: [...chosen].join(','), count: chosen.size })
    try {
      await updateUser.mutateAsync({ hiddenFeatures: [...coreHidden, ...OPT_IN_FEATURES.filter((k) => !chosen.has(k))] })
      if (picked) setPhase('saved')
    } catch {
      Alert.alert("Couldn't save your extras", 'Turn them on anytime from You, then Features.')
      if (picked) setPhase('open')
    }
  }

  const label = { fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }

  return (
    <SlideStrip leaving={phase === 'leaving'} gap={space.lg} onGone={() => setPhase('gone')}>
      <Card elevated={false} style={styles.card}>
        <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Want any extras?</Text>
        <Text style={[styles.blurb, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          Your budget works without them. Switch on what sounds useful.
        </Text>
        <View style={styles.list}>
          {EXTRAS.map(({ key, icon: ExtraIcon, pitch }) => (
            <ExtraRow key={key} icon={ExtraIcon} label={labelOf(key)} pitch={pitch} on={on.has(key)} onToggle={() => flip(key)} />
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => save(on)}
            disabled={phase !== 'open' || on.size === 0}
            style={[styles.cta, { backgroundColor: phase === 'saved' ? tokens.successBg : on.size ? tokens.accent : tokens.inputBg }]}
          >
            {phase === 'saved' ? (
              <CheckIcon color={tokens.onSuccess} size={18} />
            ) : (
              <Text style={[label, { color: on.size ? tokens.onAccent : tokens.text3 }]}>
                {phase === 'saving' ? 'Saving…' : on.size ? `Turn on ${on.size}` : 'Turn on'}
              </Text>
            )}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={phase !== 'open'} hitSlop={8} onPress={() => save(new Set())}>
            <Text style={[label, { color: tokens.text2 }]}>Not now</Text>
          </Pressable>
        </View>
      </Card>
    </SlideStrip>
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
  card: { gap: 0 },
  title: { fontSize: 18, lineHeight: 23 },
  blurb: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  list: { gap: 8, paddingTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkIcon: { width: 16, height: 16, transformOrigin: 'left' },
  icon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14 },
  pitch: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 14 },
  cta: { minHeight: 40, minWidth: 110, paddingHorizontal: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
})
