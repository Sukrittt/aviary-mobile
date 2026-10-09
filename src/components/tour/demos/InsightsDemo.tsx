import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { SectionLabel, ResultCard } from '@/src/components/tour/parts'
import { useTourContent } from '@/src/components/tour/useTourContent'
import { NORMAL_BARS, NORMAL_BAR_MAX } from '@/src/components/tour/content'

const TYPE_INTERVAL_MS = 16
const CHARS_PER_TICK = 2

/** Chapter 5: the normal-month comparison, plus an Ask Aviary answer that types itself out. */
export function InsightsDemo({ onComplete }: { onComplete: () => void }) {
  const { BRAIN_ASKS } = useTourContent()

  const { formatCurrency } = useCurrency()

  const { tokens, radius, space, type } = useTheme()
  const [asked, setAsked] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
  }, [])

  function ask(question: string) {
    if (timer.current) clearInterval(timer.current)
    const full = BRAIN_ASKS.find((b) => b.q === question)?.a ?? ''
    setAsked(question)
    setTyped('')
    let i = 0
    timer.current = setInterval(() => {
      i += CHARS_PER_TICK
      if (i >= full.length) {
        if (timer.current) clearInterval(timer.current)
        timer.current = null
        setTyped(full)
        onComplete()
      } else {
        setTyped(full.slice(0, i))
      }
    }, TYPE_INTERVAL_MS)
  }

  return (
    <View style={{ gap: space.md }}>
      <View
        style={[
          styles.card,
          { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.lg, padding: space.lg, gap: space.md },
        ]}
      >
        <SectionLabel>IS THIS A NORMAL MONTH?</SectionLabel>
        {NORMAL_BARS.map((bar) => (
          <View key={bar.label} style={{ gap: space.xs }}>
            <View style={styles.barHead}>
              <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyBold, fontSize: type.caption }}>{bar.label}</Text>
              <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>
                {formatCurrency(bar.value)}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: tokens.inputBg, borderRadius: radius.full }]}>
              <View
                style={{
                  height: '100%',
                  width: `${Math.round((bar.value / NORMAL_BAR_MAX) * 100)}%`,
                  borderRadius: radius.full,
                  backgroundColor: bar.accent ? tokens.accent : tokens.text3,
                }}
              />
            </View>
          </View>
        ))}
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 19 }}>
          Compared day for day, so a half finished month is never judged against a full one. You can also hide the rent
          shaped categories that never move.
        </Text>
      </View>

      <SectionLabel>ASK AVIARY</SectionLabel>
      <View style={[styles.chips, { gap: space.sm }]}>
        {BRAIN_ASKS.map((item) => {
          const active = asked === item.q
          return (
            <Pressable
              key={item.q}
              accessibilityRole="button"
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                ask(item.q)
              }}
              style={[
                styles.chip,
                {
                  borderRadius: radius.full,
                  paddingHorizontal: space.md,
                  backgroundColor: active ? tokens.accentSoft : tokens.pillBg,
                  borderColor: active ? tokens.accent : tokens.borderStrong,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? tokens.accentInk : tokens.text,
                  fontFamily: fontFamily.bodyBold,
                  fontSize: type.micro,
                }}
              >
                {item.q}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {asked && (
        <ResultCard tone="accent">
          <View style={[styles.answer, { gap: space.sm }]}>
            <Text style={{ fontSize: 15 }}>🧠</Text>
            <Text style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption, lineHeight: 20 }}>
              {typed}
            </Text>
          </View>
        </ResultCard>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 9, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  answer: { flexDirection: 'row', alignItems: 'flex-start' },
})
