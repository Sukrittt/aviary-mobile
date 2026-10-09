import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { ProgressBar } from '@/src/components/envelope/ProgressBar'
import { SectionLabel, ResultCard } from '@/src/components/tour/parts'
import { LOG_CHIPS, SPEND_ROWS } from '@/src/components/tour/content'

interface Logged {
  id: string
  category: string
  amount: number
  method: string
  what: string
  emoji: string
}

/** Chapter 2: log a quick expense and watch exactly one bar move. */
export function LogDemo({ onComplete }: { onComplete: () => void }) {
  const { formatCurrency } = useCurrency()

  const { tokens, radius, space, type } = useTheme()
  const [logged, setLogged] = useState<Logged[]>([])

  const extra: Record<string, number> = {}
  for (const entry of logged) extra[entry.category] = (extra[entry.category] ?? 0) + entry.amount
  const cardTotal = logged.filter((l) => l.method === 'Card').reduce((sum, l) => sum + l.amount, 0)
  const lastCategory = logged.length ? logged[logged.length - 1].category : null

  return (
    <View style={{ gap: space.md }}>
      {SPEND_ROWS.map((row) => {
        const spent = row.spent + (extra[row.id] ?? 0)
        const pct = Math.min(100, Math.round((spent / row.plan) * 100))
        const basePct = Math.min(100, Math.round((row.spent / row.plan) * 100))
        const hot = row.id === lastCategory
        return (
          <View
            key={row.id}
            style={[
              styles.card,
              {
                backgroundColor: hot ? tokens.accentSoft : tokens.cardSolid,
                borderColor: hot ? tokens.accent : tokens.border,
                borderRadius: radius.md,
                padding: space.md,
                gap: space.sm,
              },
            ]}
          >
            <View style={[styles.head, { gap: space.md }]}>
              <View style={[styles.tile, { backgroundColor: tokens.inputBg, borderRadius: radius.sm }]}>
                <Text style={{ fontSize: 16 }}>{row.emoji}</Text>
              </View>
              <View style={styles.body}>
                <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{row.name}</Text>
                <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
                  {formatCurrency(spent)} spent of {formatCurrency(row.plan)}
                </Text>
              </View>
              <Text
                style={{
                  color: hot ? tokens.accentInk : tokens.text2,
                  fontFamily: fontFamily.bodySemiBold,
                  fontSize: type.caption,
                }}
              >
                {formatCurrency(Math.max(0, row.plan - spent))} left
              </Text>
            </View>
            <ProgressBar pct={pct} from={hot ? basePct : undefined} />
          </View>
        )
      })}

      {cardTotal > 0 && (
        <ResultCard tone="mint">
          <View style={[styles.head, { gap: space.md }]}>
            <Text style={{ fontSize: 16 }}>💳</Text>
            <View style={styles.body}>
              <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>
                Credit Card Payment
              </Text>
              <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
                auto filled by card spends
              </Text>
            </View>
            <Text style={{ color: tokens.mint, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>
              {formatCurrency(cardTotal)} set aside
            </Text>
          </View>
        </ResultCard>
      )}

      <SectionLabel>QUICK LOG ONE · WATCH ONE BAR MOVE</SectionLabel>
      <View style={[styles.chips, { gap: space.sm }]}>
        {LOG_CHIPS.map((chip) => {
          const used = logged.some((l) => l.id === chip.id)
          return (
            <Pressable
              key={chip.id}
              accessibilityRole="button"
              disabled={used}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                setLogged((prev) => prev.concat([{ ...chip }]))
                onComplete()
              }}
              style={[
                styles.chip,
                {
                  borderRadius: radius.full,
                  paddingHorizontal: space.md,
                  backgroundColor: used ? tokens.inputBg : tokens.pillBg,
                  borderColor: used ? tokens.border : tokens.borderStrong,
                },
              ]}
            >
              <Text
                style={{
                  color: used ? tokens.text3 : tokens.text,
                  fontFamily: fontFamily.bodyBold,
                  fontSize: type.micro,
                }}
              >
                {chip.emoji} <Text style={styles.amount}>{formatCurrency(chip.amount)}</Text> · {chip.what}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {logged.length > 0 && (
        <ResultCard tone="accent">
          <Text style={[styles.kicker, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold, fontSize: type.micro }]}>
            JUST LOGGED
          </Text>
          {logged.map((entry) => (
            <View key={entry.id} style={[styles.head, { gap: space.sm }]}>
              <Text style={{ fontSize: 14 }}>{entry.emoji}</Text>
              <Text style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.caption }}>
                {formatCurrency(entry.amount)} · {entry.what}
              </Text>
              <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
                {entry.method}
              </Text>
            </View>
          ))}
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 18 }}>
            {cardTotal > 0
              ? 'Paid by card? The same amount lands in Credit Card Payment automatically, so the money to clear the bill is already set aside, not spent twice.'
              : 'Only that one envelope moved. Every other bar is exactly where you left it.'}
          </Text>
        </ResultCard>
      )}

      <View
        style={[
          styles.tip,
          { borderColor: tokens.border, borderRadius: radius.md, padding: space.md, gap: space.sm },
        ]}
      >
        <Text style={{ fontSize: 17 }}>🧾</Text>
        <Text style={{ flex: 1, color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 18 }}>
          Long receipt? Scan a bill reads it into line items you can edit, split by however many people ate, and file into
          envelopes before logging. There is a widget on your home screen too, with the same chips.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center' },
  tile: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  amount: { fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  kicker: { letterSpacing: 1 },
  tip: { flexDirection: 'row', borderWidth: 1, borderStyle: 'dashed' },
})
