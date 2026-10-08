import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import Reanimated, { Easing, FadeIn, FadeInUp, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { SectionLabel, ResultCard } from '@/src/components/tour/parts'
import { useTourContent } from '@/src/components/tour/useTourContent'
import { NOTIFY_ENVELOPE, NOTIFY_PCTS, type NotifyCadence } from '@/src/components/tour/content'

const CADENCES: { value: NotifyCadence; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
]
const MAX_BANNERS = 3
const KINDS_TO_COMPLETE = 3
const OVER = 101

interface Banner {
  id: number
  emoji: string
  title: string
  body: string
}

/** Highest alert line crossed, or OVER once spending passes the plan. Same rule the server uses. */
function levelFor(spent: number) {
  if (spent > NOTIFY_ENVELOPE.plan) return OVER
  const pct = (spent / NOTIFY_ENVELOPE.plan) * 100
  return Math.max(0, ...NOTIFY_PCTS.filter((p) => pct >= p))
}

/** Chapter 6: a pretend lock screen that fills up as you poke at each kind of notification. */
export function NotifyDemo({ onComplete }: { onComplete: () => void }) {
  const { NOTIFY_KINDS } = useTourContent()
  const { formatCurrency } = useCurrency()
  const { tokens, radius, space, type } = useTheme()

  const [spent, setSpent] = useState<number>(NOTIFY_ENVELOPE.spent)
  const [cadence, setCadence] = useState<NotifyCadence>('daily')
  const [picked, setPicked] = useState<string | null>(null)
  const [banners, setBanners] = useState<Banner[]>([])
  const seen = useRef(new Set<string>())
  const nextId = useRef(0)

  const { name, emoji, plan, step } = NOTIFY_ENVELOPE
  const pct = Math.round((spent / plan) * 100)
  const over = spent > plan
  const pickedKind = NOTIFY_KINDS.find((k) => k.id === picked)
  const pickedSilenced = !!pickedKind?.digestGated && cadence === 'off'

  const fill = useSharedValue(Math.min(100, pct))
  useEffect(() => {
    fill.value = withTiming(Math.min(100, pct), { duration: 420, easing: Easing.out(Easing.cubic) })
  }, [fill, pct])
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }))

  function ping(kind: string, banner: Omit<Banner, 'id'>) {
    setBanners((prev) => [{ ...banner, id: nextId.current++ }, ...prev].slice(0, MAX_BANNERS))
    seen.current.add(kind)
    if (seen.current.size >= KINDS_TO_COMPLETE) onComplete()
  }

  function spend() {
    if (over) {
      setSpent(NOTIFY_ENVELOPE.spent)
      return
    }
    const next = spent + step
    const level = levelFor(next)
    setSpent(next)
    if (level <= levelFor(spent)) return
    if (level === OVER) {
      ping('overspent', {
        emoji: '🚨',
        title: `${name} is over budget`,
        body: `You've overspent ${formatCurrency(next - plan)} in ${name} this month.`,
      })
    } else {
      ping('threshold', {
        emoji: '🚦',
        title: `${name} is at ${Math.round((next / plan) * 100)}%`,
        body: `${formatCurrency(next)} of ${formatCurrency(plan)} spent in ${name}.`,
      })
    }
  }

  function pick(id: string) {
    const kind = NOTIFY_KINDS.find((k) => k.id === id)!
    setPicked(id)
    if (kind.digestGated && cadence === 'off') return
    ping(id, kind)
  }

  return (
    <View style={{ gap: space.md }}>
      <View style={[styles.card, { backgroundColor: tokens.inputBg, borderColor: tokens.border, borderRadius: radius.lg, padding: space.md, gap: space.sm }]}>
        <Text style={[styles.clock, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>9:41</Text>
        {banners.length === 0 ? (
          <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, textAlign: 'center', paddingTop: space.xs }}>
            Quiet phone. Nothing has crossed a line yet.
          </Text>
        ) : (
          banners.map((b) => (
            <Reanimated.View
              key={b.id}
              entering={FadeInUp.springify().damping(18)}
              layout={LinearTransition.springify().damping(64).stiffness(700)}
              style={[styles.banner, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.md, padding: space.sm, gap: space.sm }]}
            >
              <View style={[styles.tile, { backgroundColor: tokens.accentSoft, borderRadius: radius.sm }]}>
                <Text style={{ fontSize: 15 }}>{b.emoji}</Text>
              </View>
              <View style={styles.body}>
                <Text numberOfLines={1} style={{ color: tokens.text, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption }}>
                  {b.title}
                </Text>
                <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 17 }}>{b.body}</Text>
              </View>
              <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyBold, fontSize: type.micro - 1 }}>now</Text>
            </Reanimated.View>
          ))
        )}
      </View>

      <SectionLabel>CATEGORY ALERTS</SectionLabel>
      <View style={[styles.card, { backgroundColor: tokens.cardSolid, borderColor: over ? tokens.coral : tokens.border, borderRadius: radius.md, padding: space.md, gap: space.sm }]}>
        <View style={[styles.row, { gap: space.md }]}>
          <View style={[styles.tile, { backgroundColor: tokens.inputBg, borderRadius: radius.sm }]}>
            <Text style={{ fontSize: 16 }}>{emoji}</Text>
          </View>
          <View style={styles.body}>
            <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{name}</Text>
            <Text style={{ color: over ? tokens.coral : tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
              {formatCurrency(spent)} of {formatCurrency(plan)} · {pct}%
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
              spend()
            }}
            style={[styles.pill, { backgroundColor: over ? tokens.pillBg : tokens.accent, borderRadius: radius.full, paddingHorizontal: space.md }]}
          >
            <Text style={{ color: over ? tokens.text : tokens.onAccent, fontFamily: fontFamily.bodyExtraBold, fontSize: type.micro }}>
              {over ? 'Start over' : `Spend ${formatCurrency(step)}`}
            </Text>
          </Pressable>
        </View>
        <View style={styles.trackWrap}>
          <View style={[styles.track, { backgroundColor: tokens.inputBg, borderRadius: radius.full }]}>
            <Reanimated.View style={[{ height: '100%', borderRadius: radius.full, backgroundColor: over ? tokens.coral : tokens.accent }, fillStyle]} />
          </View>
          {NOTIFY_PCTS.map((p) => (
            <View key={p} style={[styles.tick, { left: `${p}%`, backgroundColor: pct >= p ? tokens.accentInk : tokens.borderStrong }]} />
          ))}
        </View>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 19 }}>
          Pings the moment you log past 50%, 90% or 100%, and again if you go over. Pick your own lines per envelope, up to five.
          Only the highest line crossed pings, so one big spend never sends three.
        </Text>
      </View>

      <SectionLabel>DIGEST</SectionLabel>
      <View style={[styles.segmented, { backgroundColor: tokens.inputBg, borderRadius: radius.full }]}>
        {CADENCES.map((c) => {
          const active = cadence === c.value
          return (
            <Pressable
              key={c.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                setCadence(c.value)
              }}
              style={[styles.segment, { backgroundColor: active ? tokens.accent : 'transparent', borderRadius: radius.full }]}
            >
              <Text style={{ color: active ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodyBold, fontSize: type.micro }}>{c.label}</Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 18, paddingHorizontal: 4 }}>
        {cadence === 'off'
          ? 'Off also quiets bill reminders and the AI coach. Category alerts, Wrapped and auto-added pings keep working.'
          : cadence === 'weekly'
            ? 'One spending update a week, plus bill reminders and the AI coach.'
            : 'A one-line spending update every day, plus bill reminders and the AI coach.'}
      </Text>

      <SectionLabel>EVERYTHING ELSE THAT PINGS</SectionLabel>
      <View style={[styles.chips, { gap: space.sm }]}>
        {NOTIFY_KINDS.map((k) => {
          const active = picked === k.id
          const silenced = k.digestGated && cadence === 'off'
          return (
            <Pressable
              key={k.id}
              accessibilityRole="button"
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                pick(k.id)
              }}
              style={[
                styles.pill,
                styles.chip,
                {
                  opacity: silenced ? 0.5 : 1,
                  borderRadius: radius.full,
                  paddingHorizontal: space.md,
                  backgroundColor: active ? tokens.accentSoft : tokens.pillBg,
                  borderColor: active ? tokens.accent : tokens.borderStrong,
                },
              ]}
            >
              <Text style={{ color: active ? tokens.accentInk : tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.micro }}>
                {k.emoji}  {k.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {pickedKind && (
        <Reanimated.View key={`${pickedKind.id}:${pickedSilenced}`} entering={FadeIn.duration(160)}>
          <ResultCard tone={pickedSilenced ? 'accent' : 'mint'}>
            {pickedSilenced && (
              <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption }}>
                Silenced · your digest is Off
              </Text>
            )}
            <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption, lineHeight: 20 }}>
              <Text style={{ fontFamily: fontFamily.bodyExtraBold }}>When · </Text>
              {pickedKind.when}
            </Text>
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 19 }}>
              <Text style={{ fontFamily: fontFamily.bodyExtraBold }}>Your call · </Text>
              {pickedKind.control}
            </Text>
          </ResultCard>
        </Reanimated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  clock: { fontSize: 22, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  tile: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  pill: { height: 34, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  trackWrap: { height: 15, justifyContent: 'center' },
  track: { height: 9, overflow: 'hidden' },
  tick: { position: 'absolute', width: 2, height: 15, marginLeft: -1, borderRadius: 1 },
  segmented: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center' },
})
