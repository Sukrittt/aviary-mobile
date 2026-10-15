import { useCurrency } from '@/src/context/CurrencyContext'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { WrappedData, WrappedJudgement, WrappedPersona } from '@/src/api/wrapped'
import { fontFamily } from '@/src/theme/fonts'
import { splitEmoji } from '@/src/lib/emoji'
import { monthAbbrev, monthLabel } from '@/src/lib/envelope'
import { Fire, FireSimple, Lightning, Scales, Target, Wind, type PhosphorIcon } from '@/src/components/shared/icons'
import { WrappedCard, WrappedBigNumber, WrappedCaption, WrappedGlow, WFade, WRise, WPop } from './WrappedCard'

// The deck's fixed slides: cover, total and persona. The stories between them are
// picked per month by the server and drawn in StoryCards.tsx.

interface CardProps {
  data: WrappedData
  color: string
  onColor: string
}

export function CoverCard({
  data,
  color,
  onColor,
  onStart,
  onStartMuted,
}: CardProps & { onStart: () => void; onStartMuted: () => void }) {
  const rangeLabel = monthLabel(data.month).toUpperCase()

  return (
    <WrappedCard
      color={color}
      onColor={onColor}
      style={styles.coverCard}
      interactive
      blobs={[
        { size: 300, top: -90, right: -80, color: 'rgba(255, 150, 120, 0.4)', motion: 'drift', durationMs: 11000 },
        { size: 220, bottom: 60, left: -70, color: 'rgba(110, 50, 190, 0.35)', motion: 'drift2', durationMs: 14000 },
      ]}
    >
      <WFade>
        <Text style={[styles.eyebrowInline, { color: onColor, fontFamily: fontFamily.bodyBold }]}>{rangeLabel}</Text>
      </WFade>
      <WRise delay={50}>
        <Text style={[styles.coverTitle, { color: onColor, fontFamily: fontFamily.displayBold }]}>Expense{'\n'}Wrapped</Text>
      </WRise>
      <WRise delay={180}>
        <WrappedCaption
          value={`${data.totalTransactions} transactions. Zero secrets. Let's talk about your month.`}
          onColor={onColor}
        />
      </WRise>
      <WRise delay={300} style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Pressable onPress={onStart} style={[styles.coverButton, { backgroundColor: onColor }]}>
          <Text style={[styles.coverButtonText, { color, fontFamily: fontFamily.displaySemiBold }]}>Play with sound ♫</Text>
        </Pressable>
        <Pressable onPress={onStartMuted} style={[styles.coverButtonGhost, { borderColor: `${onColor}66` }]}>
          <Text style={[styles.coverButtonGhostText, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]}>Silent</Text>
        </Pressable>
      </WRise>
      <WFade delay={420}>
        <Text style={[styles.coverHint, { color: onColor, fontFamily: fontFamily.bodyMedium }]}>
          Tap right to skip ahead · tap the middle to pause
        </Text>
      </WFade>
    </WrappedCard>
  )
}

export function TotalSpentCard({ data, color, onColor }: CardProps) {
  const { formatCurrency } = useCurrency()

  const [y, m] = data.month.split('-').map(Number)
  const perDay = Math.round(data.totalSpent / new Date(y, m, 0).getDate())
  const prev = data.previous
  const change = prev && prev.totalSpent > 0 ? Math.round((Math.abs(data.totalSpent - prev.totalSpent) / prev.totalSpent) * 100) : 0
  return (
    <WrappedCard
      color={color}
      onColor={onColor}
      eyebrow="The grand total"
      style={styles.centered}
      blobs={[{ size: 420, top: -140, left: -100, color: `${onColor}1f`, motion: 'drift2', durationMs: 12000 }]}
    >
      <WPop delay={100}>
        <WrappedBigNumber value={formatCurrency(data.totalSpent)} onColor={onColor} />
      </WPop>
      <WRise delay={280}>
        <WrappedCaption value={`That's about ${formatCurrency(perDay)} a day across ${monthLabel(data.month).split(' ')[0]}.`} onColor={onColor} />
      </WRise>
      <WRise delay={400} style={styles.pillRow}>
        <View style={[styles.pill, { backgroundColor: `${onColor}22`, borderColor: `${onColor}44` }]}>
          <Text style={[styles.pillText, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]}>{data.totalTransactions} transactions</Text>
        </View>
        {prev && change > 0 && (
          <View style={[styles.pill, { backgroundColor: `${onColor}22`, borderColor: `${onColor}44` }]}>
            <Text style={[styles.pillText, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]}>
              {change}% {data.totalSpent < prev.totalSpent ? 'less' : 'more'} than {monthAbbrev(prev.month)}
            </Text>
          </View>
        )}
      </WRise>
    </WrappedCard>
  )
}

const TOP_CATEGORY_QUIPS: Record<string, string> = {
  bills: "Nobody's ever posted a story about paying bills. You could be the first.",
  rent: 'The one non-negotiable of every single month.',
  food: 'No regrets, mostly.',
  'food order': 'No regrets, mostly.',
  groceries: 'Stocked and ready, always.',
  shopping: 'One more thing never hurt anyone. Probably.',
  investments: 'Future you says thanks.',
  travel: 'Home is wherever the itinerary says next.',
  entertainment: 'Main character energy.',
  outings: 'Main character energy.',
  transport: 'Always somewhere to be.',
}
const DEFAULT_CATEGORY_QUIP = "That's commitment."

/** A one-liner for a top category. Shared with the first-week recap. */
export function categoryQuip(category: string): string {
  return TOP_CATEGORY_QUIPS[splitEmoji(category).text.trim().toLowerCase()] ?? DEFAULT_CATEGORY_QUIP
}

const ARCHETYPES: Record<string, { emoji: string; title: string; blurb: string; closer: string }> = {
  bills: { emoji: '🧾', title: 'The Bill Whisperer', blurb: 'You pay everything before it’s due', closer: 'Responsible to a fault' },
  rent: { emoji: '🏠', title: 'The Homebody', blurb: 'Rent first, everything else negotiable', closer: 'A steady hand' },
  food: { emoji: '🍜', title: 'The Flavor Chaser', blurb: 'Every meal is a small event', closer: 'No regrets, mostly' },
  groceries: { emoji: '🛒', title: 'The Provisioner', blurb: 'Always stocked, always planning three meals ahead', closer: 'Never caught out' },
  shopping: { emoji: '🛍️', title: 'The Collector', blurb: 'One more thing never hurt anyone', closer: 'Probably' },
  investments: { emoji: '📈', title: 'The Quiet Investor', blurb: 'Moves money into the future like it’s nothing', closer: 'Future you says thanks' },
  travel: { emoji: '✈️', title: 'The Wanderer', blurb: 'Home is wherever the itinerary says next', closer: 'Always somewhere new' },
  entertainment: { emoji: '🎬', title: 'The Main Character', blurb: 'Every week deserves a little spectacle', closer: 'No notes' },
  transport: { emoji: '🚕', title: 'The Commuter', blurb: 'Always in motion, always somewhere to be', closer: 'Never idle' },
}

const DEFAULT_ARCHETYPE = { emoji: '💳', title: 'The Steady Spender', blurb: 'Consistent, deliberate, and hard to predict', closer: 'Steady as ever' }

type Persona = { title: string; blurb: string; icon?: PhosphorIcon; emoji?: string }

/** Jev's read of how the month went, written to match the web app's persona cards. */
const JEV_PERSONAS: Record<WrappedPersona, (data: WrappedData) => Persona> = {
  daily_tracker: () => ({ icon: Fire, title: 'The Daily Tracker', blurb: 'You kept the habit alive, one honest entry at a time.' }),
  loyalist: (data) => ({
    icon: Target,
    title: 'The Loyalist',
    blurb: `You knew what mattered. ${data.topCategories[0] ? splitEmoji(data.topCategories[0].category).text.trim() : 'One category'} led the way.`,
  }),
  steady_hand: () => ({ icon: Scales, title: 'The Steady Hand', blurb: 'Your spending kept a calm, remarkably even rhythm.' }),
  free_spirit: () => ({ icon: Wind, title: 'The Free Spirit', blurb: 'No two weeks looked the same, and your story stayed interesting.' }),
  big_swing: (data) => ({
    icon: Lightning,
    title: 'The Big Swing',
    blurb: data.biggestPurchase ? `One call shaped the whole month: ${data.biggestPurchase.item}.` : 'One big call shaped the whole month.',
  }),
  slow_burn: (data) => ({ icon: FireSimple, title: 'The Slow Burn', blurb: `${data.totalTransactions} small decisions, adding up quietly.` }),
}

/** Jev's persona when it had a confident read, otherwise one picked from the top category. */
export function getArchetype(data: WrappedData, judgement?: WrappedJudgement | null): Persona {
  if (judgement?.persona && JEV_PERSONAS[judgement.persona]) return JEV_PERSONAS[judgement.persona](data)
  const top = data.topCategories[0]
  const key = top ? splitEmoji(top.category).text.trim().toLowerCase() : ''
  const a = ARCHETYPES[key] ?? DEFAULT_ARCHETYPE
  return { emoji: a.emoji, title: a.title, blurb: `${a.blurb}. ${a.closer}.` }
}

export function ArchetypeCard({ data, color, onColor, judgement }: CardProps & { judgement?: WrappedJudgement | null }) {
  const top = data.topCategories[0]
  const streak = data.longestStreak
  const persona = getArchetype(data, judgement)
  const Icon = persona.icon

  return (
    <WrappedCard color={color} onColor={onColor} eyebrow="Your spending personality" style={styles.centered}>
      <WrappedGlow color={`${onColor}26`} />
      <WPop delay={80}>{Icon ? <Icon size={48} color={onColor} weight="fill" /> : <Text style={styles.archetypeEmoji}>{persona.emoji}</Text>}</WPop>
      <WPop delay={160}>
        <Text style={[styles.coverTitle, { color: onColor, fontFamily: fontFamily.displayBold, fontSize: 40, lineHeight: 44 }]}>
          {persona.title}
        </Text>
      </WPop>
      <WRise delay={320}>
        <WrappedCaption value={persona.blurb} onColor={onColor} />
      </WRise>
      <WRise delay={440} style={styles.chipRow}>
        {top && (
          <View style={[styles.chip, { backgroundColor: `${onColor}22`, borderColor: `${onColor}44` }]}>
            <Text style={[styles.chipText, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]}>
              {top.category} · {top.pct.toFixed(0)}%
            </Text>
          </View>
        )}
        {streak && streak.days > 1 && (
          <View style={[styles.chip, { backgroundColor: `${onColor}22`, borderColor: `${onColor}44` }]}>
            <Text style={[styles.chipText, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]}>{streak.days}-day streak</Text>
          </View>
        )}
      </WRise>
    </WrappedCard>
  )
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  coverCard: { justifyContent: 'center' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill: { borderRadius: 100, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14 },
  pillText: { fontSize: 13 },
  eyebrowInline: { fontSize: 12, letterSpacing: 2, opacity: 0.8 },
  // Tight lineHeight makes Android lay the text box out shorter than the glyphs actually
  // draw, so the last line's descender (the p in "Wrapped") needs paddingBottom to survive.
  coverTitle: {
    fontSize: 72,
    lineHeight: 70,
    marginTop: 6,
    paddingBottom: 16,
    letterSpacing: -2,
    includeFontPadding: false,
  },
  coverButton: { paddingVertical: 15, paddingHorizontal: 22, borderRadius: 100 },
  coverButtonText: { fontSize: 15 },
  coverButtonGhost: { paddingVertical: 15, paddingHorizontal: 18, borderRadius: 100, borderWidth: 1 },
  coverButtonGhostText: { fontSize: 13 },
  coverHint: { fontSize: 12, letterSpacing: 0.2, opacity: 0.65, marginTop: 16 },
  archetypeEmoji: { fontSize: 44 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { alignSelf: 'flex-start', borderRadius: 100, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14, marginTop: 4 },
  chipText: { fontSize: 12 },
})
