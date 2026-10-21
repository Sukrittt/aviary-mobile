import { useState } from 'react'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useForecast } from '@/src/hooks/useForecast'
import { nextMonthLine } from '@/src/lib/forecastCopy'
import { splitEmoji } from '@/src/lib/emoji'
import { formatDateShort } from '@/src/lib/format'
import { Card } from '@/src/components/ui/Card'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { useCategoryIcons, useCategoryTint } from '@/src/hooks/useCategories'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { PopIn } from '@/src/components/shared/PopIn'
import { useReveal } from '@/src/components/charts/useReveal'
import type { ForecastEnvelope } from '@/src/api/forecast'

function rowMeta(e: ForecastEnvelope, money: (n: number) => string): string {
  // Framed as what's still fine, with the fix one tap away on the right.
  if (e.overspent) return 'Spent past the plan'
  if (e.runsOutOn) return `Covered till ${formatDateShort(e.runsOutOn)}`
  if (e.scheduled > 0) return `${money(e.scheduled)} in bills still to come`
  if (e.usualDaily > 0) return `Usually ${money(e.usualDaily)} a day`
  return 'Nothing expected'
}

/** Run-outs first by date, then the tightest envelopes. */
const byUrgency = (a: ForecastEnvelope, b: ForecastEnvelope) =>
  (a.runsOutOn ?? '9999').localeCompare(b.runsOutOn ?? '9999') || a.projected - b.projected

/** Rows shown before "Show all": run-outs sort first, so these are the ones to act on. */
const PREVIEW_ROWS = 4
// CategoryBreakdown's row stagger, so the two lists enter alike.
const ROW_START_DELAY = 200
const ROW_STAGGER_MS = 40
const ROW_STAGGER_CAP = 6

/** Insights' forecast: each envelope's month-end amount, then next month's spoken-for line. Twin of Web's ForecastCard. */
export function ForecastCard() {
  const { formatCurrency } = useCurrency()
  const { hideAmounts } = usePrivacy()
  const { tokens, space, type } = useTheme()
  const { data } = useForecast()
  const iconOf = useCategoryIcons()
  const tintOf = useCategoryTint()
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const { revealKey, revealReady } = useReveal('forecast', !!data?.envelopes.length)
  if (!data) return null
  // Estimates, so whole rupees: paisa would read as false precision.
  const money = (n: number) => formatCurrency(Math.round(n), hideAmounts)
  const next = nextMonthLine(data.nextMonth, money)
  const rows = data.envelopes.filter((e) => e.available !== 0 || e.projected !== 0).sort(byUrgency)
  const shortCount = rows.filter((e) => e.projected < 0).length
  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS)
  const body = { fontFamily: fontFamily.bodyMedium, fontSize: type.body, color: tokens.text }
  const meta = { fontFamily: fontFamily.bodySemiBold, fontSize: 12, color: tokens.text3 }

  return (
    <Card elevated={false} style={{ backgroundColor: tokens.card }}>
      <View style={styles.head}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>Month-end forecast</Text>
          {data.basis && (
            <Text style={[meta, { marginTop: 2 }]}>
              {data.basis === 'history' ? 'From your usual spending' : 'From your spending this month'}
            </Text>
          )}
          {/* totalLeft nets the shortfalls against everything else, so non-negative means the gaps are coverable. */}
          {shortCount > 0 && data.totalLeft !== null && data.totalLeft >= 0 && (
            <Text style={[meta, { marginTop: 6, color: tokens.text2 }]}>
              {`There's enough elsewhere to cover ${shortCount === 1 ? 'the gap' : `all ${shortCount} gaps`}.`}
            </Text>
          )}
        </View>
        {data.totalLeft !== null && <Text style={[body, { fontFamily: fontFamily.displaySemiBold }]}>{money(data.totalLeft)}</Text>}
      </View>

      {!data.basis ? (
        <EmptyState
          compact
          title="Your forecast's warming up"
          description="It shows up after a week of spending. Keep logging and it'll be here."
        />
      ) : (
        <View style={{ marginTop: space.sm, opacity: revealReady ? 1 : 0 }}>
          {shown.map((e, i) => {
            const tint = tintOf(e.category)
            const short = e.overspent || !!e.runsOutOn
            // Rows that "Show all" adds stagger from their own start, not after the first four.
            const nth = i < PREVIEW_ROWS ? i : i - PREVIEW_ROWS
            return (
              <PopIn
                key={`${revealKey}:${e.category}`}
                play={revealReady}
                delay={(i < PREVIEW_ROWS ? ROW_START_DELAY : 0) + Math.min(nth, ROW_STAGGER_CAP) * ROW_STAGGER_MS}
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }]}
              >
                <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
                  <CategoryIcon name={e.category} icon={iconOf.get(e.category)} size={16} color={tint.ink} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={body} numberOfLines={1}>{splitEmoji(e.category).text}</Text>
                  <Text style={[meta, short && { color: tokens.pillLow }]} numberOfLines={1}>{rowMeta(e, money)}</Text>
                </View>
                {e.projected < 0 ? (
                  <Pressable
                    onPress={() => router.push({ pathname: '/modals/move-money', params: { fromCategory: e.category, amount: String(Math.round(-e.projected)) } })}
                    accessibilityRole="button"
                    accessibilityLabel={`Top up ${splitEmoji(e.category).text}`}
                    hitSlop={6}
                    style={[styles.topUp, { backgroundColor: tokens.accentSoft }]}
                  >
                    <Text style={[meta, { color: tokens.accent, fontVariant: ['tabular-nums'] }]}>
                      Top up {money(-e.projected)}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={[body, { fontVariant: ['tabular-nums'] }]}>{money(e.projected)}</Text>
                )}
              </PopIn>
            )
          })}
          {rows.length > PREVIEW_ROWS && (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              hitSlop={8}
              style={[styles.more, { borderTopColor: tokens.border }]}
            >
              <Text style={[meta, { color: tokens.accent }]}>
                {expanded ? 'Show fewer' : `Show all ${rows.length}`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {next && (
        <View style={[styles.next, { borderTopColor: tokens.border }]}>
          <Text style={body}>{next.title}</Text>
          {next.detail && <Text style={meta}>{next.detail}</Text>}
        </View>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  topUp: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  more: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  next: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
})
