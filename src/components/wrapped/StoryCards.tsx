import { View, Text, StyleSheet } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { useCurrency } from '@/src/context/CurrencyContext'
import type { StoryType, WrappedData, WrappedStory } from '@/src/api/wrapped'
import { formatDateShort } from '@/src/lib/format'
import { fontFamily } from '@/src/theme/fonts'
import { splitEmoji } from '@/src/lib/emoji'
import { monthLabel } from '@/src/lib/envelope'
import { Fire } from '@/src/components/shared/icons'
import { WrappedCard, WrappedBigNumber, WrappedCaption, WFade, WRise, WPop, WGrowX, WNudge, type BlobSpec } from './WrappedCard'
import { categoryQuip } from './WrappedCards'

// One card per story type the server can pick (aviary's src/services/wrappedStories.ts).
// The server decides which stories run; these decide how each one reads. `variant`
// picks the copy line, so the same story reads differently from one month to the next.

type StoryOf<T extends StoryType> = Extract<WrappedStory, { type: T }>
type Props<T extends StoryType> = { story: StoryOf<T>; data: WrappedData; color: string; onColor: string }

/** The line for this month. Copy lists are short, so `variant` (a large hash) just wraps. */
function pick<T>(variant: number, options: T[]): T {
  return options[variant % options.length]
}

const pct = (x: number) => Math.round(x * 100)
const times = (x: number) => `${Math.round(x * 10) / 10}×`
const monthName = (month: string) => monthLabel(month).split(' ')[0]
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// Background shapes rotate with the month too, tinted from the text color so they sit on any slide color.
const BLOB_LAYOUTS: Omit<BlobSpec, 'color'>[][] = [
  [{ size: 330, top: 120, left: -120, variant: 'ring', ringWidth: 26, motion: 'drift', durationMs: 13000 }],
  [{ size: 420, top: -140, left: -100, motion: 'drift2', durationMs: 12000 }],
  [{ size: 300, bottom: -80, right: -90, variant: 'ring', ringWidth: 22, motion: 'drift2', durationMs: 13000 }],
  [{ size: 340, top: -100, left: -110, motion: 'spin', durationMs: 50000, borderRadius: 80 }],
  [{ size: 280, bottom: -90, left: -90, motion: 'drift', durationMs: 14000 }],
  [{ size: 240, top: -60, right: -70, variant: 'ring', ringWidth: 20, motion: 'spin', durationMs: 45000 }],
]

function blobsFor(variant: number, onColor: string): BlobSpec[] {
  // Shifted so the shape and the copy line don't always change together.
  return BLOB_LAYOUTS[Math.floor(variant / 7) % BLOB_LAYOUTS.length].map((b) => ({ ...b, color: `${onColor}1f` }))
}

/** Eyebrow, one big value, a caption, and optionally a visual underneath. Most stories are this. */
function StatStory({
  story,
  color,
  onColor,
  eyebrow,
  big,
  caption,
  children,
}: {
  story: WrappedStory
  color: string
  onColor: string
  eyebrow: string
  big: React.ReactNode
  caption: string
  children?: React.ReactNode
}) {
  return (
    <WrappedCard color={color} onColor={onColor} eyebrow={eyebrow} style={styles.centered} blobs={blobsFor(story.variant, onColor)}>
      <WPop delay={80}>{typeof big === 'string' ? <WrappedBigNumber value={big} onColor={onColor} /> : big}</WPop>
      <WRise delay={260}>
        <WrappedCaption value={caption} onColor={onColor} />
      </WRise>
      {children}
    </WrappedCard>
  )
}

function ShowedUp({ story, color, onColor }: Props<'showed_up'>) {
  const { currencyCode } = useCurrency()
  const { days, daysInMonth } = story.facts
  const share = days / daysInMonth
  const examples = currencyCode === 'INR' ? 'every chai, every EMI' : 'every coffee, every bill'
  const tail =
    share >= 0.8 ? 'Basically every day.' : share >= 0.6 ? "That's most of the month." : share >= 0.3 ? 'A solid chunk of the month.' : 'Every one of them counts.'
  const caption = pick(story.variant, [
    `${days} of ${daysInMonth} days had something logged. ${tail}`,
    `You logged ${examples} on ${days} of ${daysInMonth} days. ${tail}`,
  ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="You showed up" big={`${days} days`} caption={caption} />
}

function Streak({ story, color, onColor }: Props<'streak'>) {
  const { days, startDate, endDate } = story.facts
  const start = formatDateShort(startDate)
  const end = formatDateShort(endDate)
  const caption = pick(story.variant, [
    `${start} to ${end}, not one day missed.`,
    `${days} days in a row, ${start} to ${end}. The habit's real.`,
    `From ${start} to ${end}, you didn't skip a single day.`,
  ])
  const big = (
    <View style={styles.streakRow}>
      <WrappedBigNumber value={`${days}`} onColor={onColor} />
      <Text style={[styles.streakDays, { color: onColor, fontFamily: fontFamily.displaySemiBold }]}>days</Text>
      <WNudge durationMs={1800} amplitude={6}>
        <Fire size={30} color={onColor} weight="fill" />
      </WNudge>
    </View>
  )
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="Longest logging streak" big={big} caption={caption} />
}

function Comeback({ story, color, onColor }: Props<'comeback'>) {
  const { quietDays, startDate, endDate } = story.facts
  const start = formatDateShort(startDate)
  const end = formatDateShort(endDate)
  const caption = pick(story.variant, [
    `That's how long things went quiet after ${start}. On ${end}, you were back.`,
    `Nothing logged for ${quietDays} days after ${start}. Then ${end} came and you picked it right back up.`,
  ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="The comeback" big={`${quietDays} days`} caption={caption} />
}

function NightLogger({ story, color, onColor }: Props<'night_logger'>) {
  const share = pct(story.facts.lateCount / story.facts.count)
  // Says "logged", not "spent": the timestamp is when the entry went in.
  const caption = pick(story.variant, [
    'of what you logged, you logged between 10pm and 2am. The books get done once the house goes quiet.',
    'of your logs landed after 10pm. Night shift accountant.',
  ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="After hours" big={`${share}%`} caption={caption} />
}

function HowYouLog({ story, color, onColor }: Props<'how_you_log'>) {
  const { scans, count } = story.facts
  const caption = pick(story.variant, [
    `${scans} of your ${count} logs started as a photo of the bill. Typing's for other people.`,
    `You pointed the camera at ${scans} bills. That's ${pct(scans / count)}% of everything you logged.`,
  ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="How you log" big={`${scans} scans`} caption={caption} />
}

function BiggestHit({ story, color, onColor }: Props<'biggest_hit'>) {
  const { formatCurrency } = useCurrency()
  const { item, amount, category, date, timesMedian } = story.facts
  const x = Math.round(timesMedian)
  const sameName = item.trim().toLowerCase() === splitEmoji(category).text.trim().toLowerCase()
  const detail = [sameName ? category : `${item} · ${category}`, formatDateShort(date)].join(' · ')
  const caption = pick(story.variant, [
    `That's ${x}× what you usually spend in one go. Future you is either thrilled or filing a complaint.`,
    `About ${x} of your usual purchases, in a single tap.`,
  ])
  const big = (
    <View style={[styles.panel, { backgroundColor: `${onColor}22`, borderColor: `${onColor}44` }]}>
      <Text style={[styles.panelBig, { color: onColor, fontFamily: fontFamily.displayBold }]}>{formatCurrency(amount)}</Text>
      <Text style={[styles.panelSub, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]} numberOfLines={2}>
        {detail}
      </Text>
    </View>
  )
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="Biggest single hit" big={big} caption={caption} />
}

function SmallStuff({ story, color, onColor }: Props<'small_stuff'>) {
  const { formatCurrency } = useCurrency()
  const { count, total, of } = story.facts
  const caption = pick(story.variant, [
    `That's what ${count} small purchases added up to. None of them felt like much at the time.`,
    `${count} of your ${of} purchases were small ones. Together, they made this.`,
  ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="The small stuff" big={formatCurrency(total)} caption={caption} />
}

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function SpendiestWeekday({ story, color, onColor }: Props<'spendiest_weekday'>) {
  const { formatCurrency } = useCurrency()
  const { day, total, count, totals } = story.facts
  const max = Math.max(...totals, 1)
  const mean = totals.reduce((s, t) => s + t, 0) / 7
  const caption = pick(story.variant, [
    `${formatCurrency(total)} across ${count} purchases. ${day} has a hold on you.`,
    `${day}s cost you ${formatCurrency(total)}, about ${times(total / mean)} an average day of the week.`,
  ])
  return (
    <StatStory story={story} color={color} onColor={onColor} eyebrow="Your spendiest day" big={day} caption={caption}>
      <WFade delay={350}>
        <View style={styles.weekdayRow}>
          {totals.map((t, i) => {
            const active = WEEKDAYS[i] === day
            const bar = <View style={[styles.weekdayBar, { backgroundColor: active ? onColor : `${onColor}44`, height: Math.max(6, (t / max) * 56) }]} />
            return active ? (
              <WNudge key={i} durationMs={2600} amplitude={5} style={styles.flex}>
                {bar}
              </WNudge>
            ) : (
              <View key={i} style={styles.flex}>
                {bar}
              </View>
            )
          })}
        </View>
        <View style={styles.weekdayLabels}>
          {WEEKDAY_INITIALS.map((d, i) => (
            <Text key={i} style={[styles.weekdayLabel, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]}>
              {d}
            </Text>
          ))}
        </View>
      </WFade>
    </StatStory>
  )
}

/** "1-7" stays, "22-end" becomes "22–30": the old labels wrapped mid-word in a narrow column. */
function weekLabel(label: string, month: string): string {
  const [from, to] = label.split('-')
  return `${from}–${to === 'end' ? daysIn(month) : to}`
}

function HeavyWeek({ story, data, color, onColor }: Props<'heavy_week'>) {
  const { formatCurrency } = useCurrency()
  const { startDate, endDate, total, share } = story.facts
  const range = `${Number(startDate.slice(8))}–${Number(endDate.slice(8))} ${monthName(data.month).slice(0, 3)}`
  const [title, closer] = pick(story.variant, [
    [`${range} carried the month.`, `${formatCurrency(total)} in those days alone. That's ${pct(share)}% of everything.`],
    [`${pct(share)}% of the month happened ${range}.`, 'The other weeks were comparatively quiet.'],
  ])
  const weeks = data.weeklyTotals
  const max = Math.max(...weeks.map((w) => w.total), 1)
  const top = weeks.reduce((best, w) => (w.total > best.total ? w : best), weeks[0])
  return (
    <WrappedCard color={color} onColor={onColor} eyebrow="Week by week" style={styles.centered} blobs={blobsFor(story.variant, onColor)}>
      <WRise delay={60}>
        <Text style={[styles.title, { color: onColor, fontFamily: fontFamily.displayBold }]}>{title}</Text>
      </WRise>
      <View style={styles.raceList}>
        {weeks.map((w, i) => (
          <WFade key={w.label} delay={200 + i * 120} style={styles.raceRow}>
            <Text style={[styles.raceLabel, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]} numberOfLines={1}>
              {weekLabel(w.label, data.month)}
            </Text>
            <View style={[styles.raceTrack, { backgroundColor: `${onColor}22` }]}>
              <WGrowX
                delay={250 + i * 130}
                duration={850}
                style={[styles.raceFill, { width: `${(w.total / max) * 100}%`, backgroundColor: w === top ? onColor : `${onColor}66` }]}
              />
            </View>
            <Text style={[styles.raceValue, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]} numberOfLines={1}>
              {formatCurrency(w.total)}
            </Text>
          </WFade>
        ))}
      </View>
      <WRise delay={750}>
        <Text style={[styles.closer, { color: onColor, fontFamily: fontFamily.bodySemiBold }]}>{closer}</Text>
      </WRise>
    </WrappedCard>
  )
}

function WeekendSplit({ story, color, onColor }: Props<'weekend_split'>) {
  const { heavier, ratio } = story.facts
  const r = times(ratio)
  const caption =
    heavier === 'weekend'
      ? pick(story.variant, [
          `A weekend day cost you ${r} a weekday. Saturday you is having a great time.`,
          `Per day, weekends ran ${r} the price of weekdays. Fun has a budget line.`,
        ])
      : pick(story.variant, [
          `A weekday cost you ${r} a weekend day. Work days are expensive days.`,
          `Weekdays ran ${r} a weekend day. Your weekends are suspiciously calm.`,
        ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="Weekends vs weekdays" big={r} caption={caption} />
}

function YourUsual({ story, color, onColor }: Props<'your_usual'>) {
  const { formatCurrency } = useCurrency()
  const { item, count, total } = story.facts
  const caption = pick(story.variant, [
    `${count} times this month, ${formatCurrency(total)} in all. At this point it's a subscription.`,
    `You logged it ${count} times. ${formatCurrency(total)}, well spent. Probably.`,
  ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="Your usual" big={item} caption={caption} />
}

const BAR_OPACITY = [1, 0.5, 0.32]

function TopCategory({ story, color, onColor }: Props<'top_category'>) {
  const { formatCurrency } = useCurrency()
  const { category, total, pct: share, runnersUp } = story.facts
  const quip = categoryQuip(category)
  const caption = pick(story.variant, [
    `${formatCurrency(total)}, a full ${Math.round(share)}% of everything. ${quip}`,
    `${Math.round(share)}% of your month went here. ${quip}`,
  ])
  const bars = [{ category, total }, ...runnersUp]
  return (
    <StatStory story={story} color={color} onColor={onColor} eyebrow="Your #1 category" big={category} caption={caption}>
      {bars.length > 1 && (
        <View style={styles.topCatList}>
          {bars.map((c, i) => (
            <View key={c.category} style={styles.topCatRow}>
              <WGrowX
                delay={450 + i * 100}
                duration={800}
                style={[styles.topCatFill, { width: `${(c.total / total) * 68}%`, backgroundColor: onColor, opacity: BAR_OPACITY[i] }]}
              />
              <Text style={[styles.topCatLabel, { color: onColor, fontFamily: fontFamily.bodyExtraBold, opacity: BAR_OPACITY[i] }]} numberOfLines={1}>
                {c.category}
              </Text>
            </View>
          ))}
        </View>
      )}
    </StatStory>
  )
}

// Shades of the text color, so segments never clash with whichever slide color this lands on.
const SEGMENT_OPACITY = [1, 0.72, 0.5, 0.34, 0.22]
const COUNT_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five']

function fractionPhrase(share: number): string {
  if (share >= 90) return 'basically all of it'
  if (share >= 72) return 'three-quarters of it'
  if (share >= 60) return 'two-thirds of it'
  if (share >= 45) return 'half of it'
  if (share >= 30) return 'a third of it'
  return 'a good chunk of it'
}

function WhereItWent({ story, color, onColor }: Props<'where_it_went'>) {
  const cats = story.facts.categories
  const shown = cats.reduce((s, c) => s + c.pct, 0)
  const rest = Math.max(0, Math.round(100 - shown))
  let cursor = 0
  const segments = cats.map((c, i) => {
    const seg = { key: c.category, x: cursor, width: (c.pct / shown) * 100, opacity: SEGMENT_OPACITY[i] }
    cursor += seg.width
    return seg
  })
  const closer = pick(story.variant, [`The other ${rest}% was spread across everything else.`, `Everything else shared the last ${rest}%.`])
  return (
    <WrappedCard color={color} onColor={onColor} eyebrow="Where it all went" style={styles.centered} blobs={blobsFor(story.variant, onColor)}>
      <WRise delay={60}>
        <Text style={[styles.title, { color: onColor, fontFamily: fontFamily.displayBold }]}>
          {COUNT_WORDS[cats.length] ?? cats.length} categories ate {fractionPhrase(shown)}.
        </Text>
      </WRise>
      <View style={styles.breakdown}>
        <WGrowX delay={200} duration={900} style={styles.barClip}>
          <Svg width="100%" height={12} viewBox="0 0 100 12" preserveAspectRatio="none">
            {segments.map((s) => (
              <Rect key={s.key} x={s.x} y={0} width={s.width} height={12} fill={onColor} fillOpacity={s.opacity} />
            ))}
          </Svg>
        </WGrowX>
        <View style={styles.legend}>
          {cats.map((c, i) => (
            <WRise key={c.category} delay={300 + i * 60} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: onColor, opacity: SEGMENT_OPACITY[i] }]} />
              <Text style={[styles.legendLabel, { color: onColor, fontFamily: fontFamily.bodyBold }]} numberOfLines={1}>
                {c.category}
              </Text>
              <Text style={[styles.legendPct, { color: onColor, fontFamily: fontFamily.bodyExtraBold }]}>{Math.round(c.pct)}%</Text>
            </WRise>
          ))}
        </View>
      </View>
      {rest > 0 && (
        <WRise delay={620}>
          <Text style={[styles.closer, { color: onColor, fontFamily: fontFamily.bodyBold }]}>{closer}</Text>
        </WRise>
      )}
    </WrappedCard>
  )
}

function StayedPut({ story, color, onColor }: Props<'stayed_put'>) {
  const { formatCurrency } = useCurrency()
  const { left, assigned } = story.facts
  const caption = pick(story.variant, [
    `never left its envelope. That's ${pct(left / assigned)}% of what you set aside.`,
    'still sitting in your envelopes, unspent. That\'s a flex.',
  ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="Money that stayed put" big={formatCurrency(left)} caption={caption} />
}

function BurstEnvelope({ story, color, onColor }: Props<'burst_envelope'>) {
  const { formatCurrency } = useCurrency()
  const { category, spent, budget } = story.facts
  const caption = pick(story.variant, [
    `${formatCurrency(spent)} against a ${formatCurrency(budget)} budget. That's ${pct(spent / budget)}% of it. It happens.`,
    `You budgeted ${formatCurrency(budget)} and spent ${formatCurrency(spent)}. The envelope tried its best.`,
  ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="The envelope that burst" big={category} caption={caption} />
}

function UpOrDown({ story, color, onColor }: Props<'up_or_down'>) {
  const { formatCurrency } = useCurrency()
  const { previousMonth, previousTotal, total } = story.facts
  const prev = monthName(previousMonth)
  const less = total < previousTotal
  const change = pct(Math.abs(total - previousTotal) / previousTotal)
  const caption = less
    ? pick(story.variant, [
        `than ${prev}. ${formatCurrency(total)} this month, down from ${formatCurrency(previousTotal)}.`,
        `than ${prev}, a ${change}% drop. Whatever you did, do it again.`,
      ])
    : pick(story.variant, [
        `than ${prev}. ${formatCurrency(total)} this month, up from ${formatCurrency(previousTotal)}.`,
        `than ${prev}, up ${change}%. It was that kind of month.`,
      ])
  const big = `${formatCurrency(Math.abs(total - previousTotal))} ${less ? 'less' : 'more'}`
  return <StatStory story={story} color={color} onColor={onColor} eyebrow={`Vs ${prev}`} big={big} caption={caption} />
}

function CategoryMover({ story, color, onColor }: Props<'category_mover'>) {
  const { formatCurrency } = useCurrency()
  const { category, previous, current } = story.facts
  const up = current > previous
  const change = pct(Math.abs(current - previous) / previous)
  const both = `${formatCurrency(previous)} last month, ${formatCurrency(current)} this month.`
  const caption = up
    ? pick(story.variant, [`${both} ${current >= 2 * previous ? `That's ${times(current / previous)} as much.` : `Up ${change}%.`}`, `Up ${change}% on last month. Something changed.`])
    : pick(story.variant, [`${both} Down ${change}%. Nicely done.`, `Down ${change}% on last month. Quietly impressive.`])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="The mover" big={category} caption={caption} />
}

function NewCategory({ story, color, onColor }: Props<'new_category'>) {
  const { formatCurrency } = useCurrency()
  const { category, total } = story.facts
  const caption = pick(story.variant, [
    `${formatCurrency(total)} somewhere you'd never spent before. Welcome to the rotation.`,
    `It wasn't on last month's list at all. This month, ${formatCurrency(total)}.`,
  ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="New this month" big={category} caption={caption} />
}

function HabitChange({ story, color, onColor }: Props<'habit_change'>) {
  const { metric, from, to } = story.facts
  const caption =
    metric === 'streak'
      ? pick(story.variant, [
          from > 0 ? `Your longest streak went from ${from} days to ${to}. That's growth.` : `No streak last month. This month, ${to} days in a row.`,
          `Last month's best run was ${from} ${from === 1 ? 'day' : 'days'}. This month, ${to}.`,
        ])
      : pick(story.variant, [
          `You logged on ${to} days, up from ${from} last month.`,
          `${to - from} more logging days than last month. The habit's sticking.`,
        ])
  return <StatStory story={story} color={color} onColor={onColor} eyebrow="Better than last month" big={`${to} days`} caption={caption} />
}

const STORY_CARDS: { [T in StoryType]: (props: Props<T>) => React.ReactElement } = {
  showed_up: ShowedUp,
  streak: Streak,
  comeback: Comeback,
  night_logger: NightLogger,
  how_you_log: HowYouLog,
  biggest_hit: BiggestHit,
  small_stuff: SmallStuff,
  spendiest_weekday: SpendiestWeekday,
  heavy_week: HeavyWeek,
  weekend_split: WeekendSplit,
  your_usual: YourUsual,
  top_category: TopCategory,
  where_it_went: WhereItWent,
  stayed_put: StayedPut,
  burst_envelope: BurstEnvelope,
  up_or_down: UpOrDown,
  category_mover: CategoryMover,
  new_category: NewCategory,
  habit_change: HabitChange,
}

/** False for a story type added on the server after this build shipped; those are skipped.
 *  Own keys only: `in` would let a type named "constructor" through to Object.prototype. */
export function isKnownStory(story: { type: string }): story is WrappedStory {
  return Object.hasOwn(STORY_CARDS, story.type)
}

export function StoryCard({ story, ...rest }: { story: WrappedStory; data: WrappedData; color: string; onColor: string }) {
  const Card = STORY_CARDS[story.type] as (props: Props<StoryType>) => React.ReactElement
  return <Card story={story as StoryOf<StoryType>} {...rest} />
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  flex: { flex: 1 },
  title: { fontSize: 34, lineHeight: 38, letterSpacing: -0.5 },
  closer: { fontSize: 15, lineHeight: 21, opacity: 0.88, marginTop: 14 },
  streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  streakDays: { fontSize: 22 },
  panel: { borderRadius: 22, borderWidth: 1, padding: 20, gap: 8, marginTop: 8 },
  panelBig: { fontSize: 40, lineHeight: 44, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  panelSub: { fontSize: 13, opacity: 0.9 },
  weekdayRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 56, marginTop: 20 },
  weekdayBar: { borderRadius: 6 },
  weekdayLabels: { flexDirection: 'row', gap: 5, marginTop: 6 },
  weekdayLabel: { flex: 1, fontSize: 12, textAlign: 'center', opacity: 0.75 },
  raceList: { gap: 12, marginTop: 8 },
  raceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  raceLabel: { width: 44, fontSize: 12, opacity: 0.8 },
  raceTrack: { flex: 1, height: 18, borderRadius: 100, overflow: 'hidden' },
  raceFill: { height: '100%', borderRadius: 100 },
  raceValue: { width: 72, textAlign: 'right', fontSize: 12 },
  topCatList: { gap: 9, marginTop: 12 },
  topCatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topCatFill: { height: 12, borderRadius: 100 },
  topCatLabel: { flex: 1, fontSize: 12 },
  breakdown: { gap: 16, marginTop: 8 },
  barClip: { borderRadius: 6, overflow: 'hidden' },
  legend: { gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 16 },
  legendPct: { fontSize: 16 },
})
