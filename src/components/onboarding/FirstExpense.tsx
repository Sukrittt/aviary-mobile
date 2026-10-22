import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Numpad } from '@/src/components/ui/Numpad'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/shared/CategoryIcon'
import { availablePill } from '@/src/components/envelope/EnvelopeRow'
import { fillColor } from '@/src/components/envelope/ProgressBar'
import { categoryTint } from '@/src/lib/emoji'
import type { CategoryIconKey } from '@/src/lib/categoryIcons'
import { tap } from '@/src/lib/haptics'
import { AmountTicker } from './AmountTicker'

export interface StarterEnvelope {
  key: string
  name: string
  icon: CategoryIconKey
  assigned: number
}

/** How long the saved check holds before the step moves on, same as every other success CTA. */
const SAVED_HOLD_MS = 1100

/**
 * Setup's last step: one real expense against the budget just made, so the
 * envelope visibly moves before Home ever opens. The bar is Home's envelope
 * bar (spent over assigned, same colours), redrawn on every key press.
 */
export function FirstExpense({
  envelopes,
  initialKey,
  onLog,
  onSkip,
  onDone,
}: {
  envelopes: StarterEnvelope[]
  initialKey?: string
  /** Saves it. Throws to keep the user here with an error. */
  onLog: (envelope: StarterEnvelope, amount: number) => Promise<void>
  onSkip: () => void
  /** After the saved check has played. */
  onDone: () => void
}) {
  const { tokens } = useTheme()
  const { formatMoney } = useCurrency()
  const [key, setKey] = useState(initialKey ?? envelopes[0]?.key)
  const [amount, setAmount] = useState('')
  const [tick, setTick] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  // The picked envelope can start off the right edge; bring it into view once.
  const chipStrip = useRef<ScrollView>(null)
  const scrolledTo = useRef(false)

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(onDone, SAVED_HOLD_MS)
    return () => clearTimeout(t)
  }, [saved, onDone])

  const env = envelopes.find((e) => e.key === key) ?? envelopes[0]
  const spent = Number(amount) || 0
  const assigned = env?.assigned ?? 0
  const left = assigned - spent
  // Home's envelope maths for one row with nothing spent yet (computeEnvelopeState).
  const spentPct = assigned > 0 ? Math.min(100, (spent / assigned) * 100) : spent > 0 ? 100 : 0
  const pill = availablePill({ isOverspent: left < 0, spentPct }, tokens)

  const fill = useSharedValue(0)
  useEffect(() => {
    fill.value = withTiming(spentPct, { duration: 260, easing: Easing.out(Easing.cubic) })
  }, [fill, spentPct])
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }))

  const press = (next: string, d: 1 | -1) => {
    setAmount(next)
    setTick((t) => t + 1)
    setDir(d)
    setError('')
  }

  const log = async () => {
    if (!env || !spent || saving || saved) return
    tap()
    setSaving(true)
    try {
      await onLog(env, spent)
      setSaved(true)
    } catch {
      setError('Couldn’t save that. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!env) return null
  const Icon = CATEGORY_ICON_COMPONENTS[env.icon]
  const tint = categoryTint(env.name, tokens)
  const shown = formatMoney(spent)

  return (
    <View style={styles.body}>
      <ScrollView ref={chipStrip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipStrip}>
        {envelopes.map((e) => {
          const on = e.key === env.key
          const ChipIcon = CATEGORY_ICON_COMPONENTS[e.icon]
          return (
            <Pressable
              key={e.key}
              onLayout={(ev) => {
                if (!on || scrolledTo.current) return
                scrolledTo.current = true
                chipStrip.current?.scrollTo({ x: Math.max(0, ev.nativeEvent.layout.x - 20), animated: false })
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              disabled={saving || saved}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                setKey(e.key)
              }}
              style={[styles.chip, { borderColor: on ? tokens.accent : tokens.borderStrong, backgroundColor: on ? tokens.accentSoft : tokens.inputBg }]}
            >
              <ChipIcon size={14} color={on ? tokens.accent : tokens.text2} />
              <Text style={[styles.chipLabel, { color: on ? tokens.accent : tokens.text2 }]}>{e.name}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={styles.amountWrap}>
        <AmountTicker text={shown} tick={tick} dir={dir} delta={0} dimmed={!amount} fontSize={shown.length > 10 ? 40 : 52} />
      </View>

      <View testID="first-expense-envelope" style={[styles.envelope, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
        <View style={styles.envTop}>
          <View style={[styles.envIcon, { backgroundColor: tint.bg }]}>
            <Icon size={14} color={tint.ink} />
          </View>
          <Text numberOfLines={1} style={[styles.envName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{env.name}</Text>
          <View style={[styles.pill, { backgroundColor: pill.bg }]}>
            <Text style={[styles.pillText, { color: pill.color, fontFamily: fontFamily.bodySemiBold }]}>{formatMoney(left)} left</Text>
          </View>
        </View>
        <View style={[styles.track, { backgroundColor: tokens.borderStrong }]}>
          <Animated.View style={[styles.fill, { backgroundColor: left < 0 ? tokens.coral : fillColor(spentPct, tokens) }, fillStyle]} />
        </View>
        <Text style={[styles.envMeta, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
          {assigned > 0 ? `${formatMoney(spent)} of ${formatMoney(assigned)} spent` : 'Nothing budgeted here yet'}
        </Text>
      </View>

      <View style={{ flex: 1, minHeight: 8 }} />
      <Numpad
        extraKey="00"
        disabled={saving || saved}
        onDigit={(d) => press((amount + d).replace(/^0+/, '').slice(0, 8), 1)}
        onBackspace={() => press(amount.slice(0, -1), -1)}
        onClear={() => press('', -1)}
      />

      {error !== '' && <Text style={[styles.error, { color: tokens.coral }]}>{error}</Text>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !spent || saving, busy: saving }}
        disabled={!spent || saving || saved}
        onPress={log}
        style={[styles.cta, { backgroundColor: saved ? tokens.successBg : spent ? tokens.accent : tokens.inputBg }]}
      >
        {saved ? (
          <CheckIcon color={tokens.onSuccess} />
        ) : (
          <Text style={[styles.ctaText, { color: spent ? tokens.onAccent : tokens.text3, fontFamily: fontFamily.displaySemiBold }]}>
            {saving ? 'Logging it…' : 'Log it'}
          </Text>
        )}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={saving || saved} onPress={onSkip} hitSlop={8} style={styles.skip}>
        <Text style={[styles.skipText, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>Skip for now</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  body: { flex: 1, marginTop: 14 },
  chipStrip: { flexGrow: 0, marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1 },
  chipLabel: { fontSize: 13, fontFamily: fontFamily.bodyBold },
  amountWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 18, minHeight: 64 },
  envelope: { marginTop: 14, padding: 14, borderRadius: 18, borderWidth: 1, gap: 9 },
  envTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  envIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  envName: { flex: 1, fontSize: 15 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 100 },
  pillText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  track: { height: 5, borderRadius: 100, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 100 },
  envMeta: { fontSize: 12 },
  error: { fontSize: 13, textAlign: 'center', marginTop: 10, fontFamily: fontFamily.bodySemiBold },
  cta: { marginTop: 14, minHeight: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 15 },
  skip: { alignSelf: 'center', marginTop: 10, paddingVertical: 4 },
  skipText: { fontSize: 13 },
})
