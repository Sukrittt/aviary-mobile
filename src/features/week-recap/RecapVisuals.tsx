import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import type { WeekRecap } from '@/src/api/weekRecap'
import type { BlobSpec } from '@/src/components/wrapped/WrappedCard'
import { WFade, WGrowX, WPop, WRise } from '@/src/components/wrapped/WrappedCard'
import { BirdLandingMark } from '@/src/components/splash/BirdLandingMark'
import { SnoozingBird } from '@/src/components/shared/SnoozingBird'
import { ConfettiPiece } from '@/src/components/onboarding/SetupDone'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { formatDateShort } from '@/src/lib/format'
import { splitEmoji } from '@/src/lib/emoji'
import type { RecapSlide } from './slides'

/**
 * What each recap slide shows besides its copy. `RecapHero` sits above the
 * title, `RecapDetail` below the body. Built from Wrapped's pieces (blobs,
 * WPop/WRise/WGrowX, the bird) so the recap reads as its sibling.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Drifting shapes behind each slide, so no slide is a flat colour. */
export function recapBlobs(kind: RecapSlide['kind']): BlobSpec[] {
  const ring = 'rgba(255, 255, 255, 0.16)'
  const fill = 'rgba(255, 255, 255, 0.10)'
  switch (kind) {
    case 'intro':
    case 'light':
      return [
        { size: 340, top: -90, right: -140, color: ring, variant: 'ring', ringWidth: 26, motion: 'drift', durationMs: 13000 },
        { size: 160, bottom: 120, left: -50, color: fill, motion: 'spin', durationMs: 30000, borderRadius: 40 },
      ]
    case 'regulars':
      return [
        { size: 300, top: 60, left: -150, color: 'rgba(255, 255, 255, 0.22)', motion: 'drift2', durationMs: 12000 },
        { size: 120, bottom: 90, right: -20, color: 'rgba(46, 18, 0, 0.12)', motion: 'spin', durationMs: 26000, borderRadius: 30 },
      ]
    case 'hour':
      return [{ size: 420, bottom: -200, left: -120, color: ring, variant: 'ring', ringWidth: 30, motion: 'drift2', durationMs: 14000 }]
    case 'categories':
      return [
        { size: 380, top: -160, left: -110, color: 'rgba(51, 172, 90, 0.4)', motion: 'drift2', durationMs: 12000 },
        { size: 140, bottom: 140, right: -40, color: fill, motion: 'spin', durationMs: 28000, borderRadius: 34 },
      ]
    case 'biggest':
      return [
        { size: 360, top: -120, right: -130, color: 'rgba(255, 120, 120, 0.3)', motion: 'drift', durationMs: 12000 },
        { size: 260, bottom: -90, left: -100, color: ring, variant: 'ring', ringWidth: 22, motion: 'drift2', durationMs: 15000 },
      ]
    case 'done':
      return [
        { size: 330, top: 100, left: -140, color: ring, variant: 'ring', ringWidth: 26, motion: 'drift', durationMs: 13000 },
        { size: 200, bottom: -40, right: -60, color: fill, motion: 'drift2', durationMs: 11000 },
      ]
  }
}

/** Counts from 0 to `target` over `durationMs`, starting after `delayMs`. */
export function useCountUp(target: number, durationMs = 900, delayMs = 150): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let frame = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / durationMs)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    const timer = setTimeout(() => (frame = requestAnimationFrame(tick)), delayMs)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [target, durationMs, delayMs])
  return value
}

/** The big title. On the biggest-spend slide the amount counts up. */
export function RecapTitle({ slide, recap, money }: { slide: RecapSlide; recap: WeekRecap; money: (n: number) => string }) {
  const amount = useCountUp(slide.kind === 'biggest' ? (recap.biggest?.amountInr ?? 0) : 0)
  const text = slide.kind === 'biggest' ? money(amount) : slide.title
  return <Text style={[styles.title, { color: slide.ink }]}>{text}</Text>
}

export function RecapHero({ slide }: { slide: RecapSlide }) {
  switch (slide.kind) {
    case 'intro':
      return <BirdLandingMark size={112} color={slide.ink} perched />
    case 'light':
      return <SnoozingBird size={112} color={slide.ink} accent={slide.ink} eyeColor={slide.color} />
    case 'done':
      return <BirdLandingMark size={112} color={slide.ink} perched />
    default:
      return null
  }
}

export function RecapDetail({ slide, recap, money }: { slide: RecapSlide; recap: WeekRecap; money: (n: number) => string }) {
  switch (slide.kind) {
    case 'intro':
      return <DayDots recap={recap} ink={slide.ink} bg={slide.color} />
    case 'regulars':
      return <Chips repeats={recap.repeats} ink={slide.ink} bg={slide.color} />
    case 'hour':
      return <DayArc minutes={recap.logMinutes?.length ? recap.logMinutes : [recap.usualMinute ?? 0]} usual={recap.usualMinute ?? 0} ink={slide.ink} />
    case 'categories':
      return <CategoryBars categories={recap.categories?.length ? recap.categories : recap.topCategory ? [recap.topCategory] : []} ink={slide.ink} money={money} />
    case 'biggest':
      return recap.biggest ? <Receipt biggest={recap.biggest} accent={slide.color} money={money} /> : null
    default:
      return null
  }
}

/** One dot per day of the week, lit where they logged. */
function DayDots({ recap, ink, bg }: { recap: WeekRecap; ink: string; bg: string }) {
  if (!recap.loggedDates) return null
  const logged = new Set(recap.loggedDates)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${recap.startDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return { date: d.toISOString().slice(0, 10), letter: WEEKDAYS[d.getUTCDay()] }
  })
  return (
    <View style={styles.dotRow}>
      {days.map((day, i) => {
        const on = logged.has(day.date)
        return (
          <WPop key={day.date} delay={450 + i * 90} style={styles.dotCol}>
            <View style={[styles.dot, on ? { backgroundColor: ink } : { borderColor: `${ink}55`, borderWidth: 2 }]}>
              {on && <Text style={[styles.dotTick, { color: bg }]}>✓</Text>}
            </View>
            <Text style={[styles.dotLabel, { color: `${ink}cc` }]}>{day.letter}</Text>
          </WPop>
        )
      })}
    </View>
  )
}

/** The repeat items, stamped in at slight angles. */
function Chips({ repeats, ink, bg }: { repeats: WeekRecap['repeats']; ink: string; bg: string }) {
  const tilts = ['-4deg', '3deg', '-2deg']
  return (
    <View style={styles.chipWrap}>
      {repeats.map((r, i) => (
        <WPop key={r.item} delay={350 + i * 160}>
          <View style={[styles.chip, { backgroundColor: i === 0 ? ink : `${ink}22`, borderColor: ink, transform: [{ rotate: tilts[i % 3] }] }]}>
            <Text style={[styles.chipText, { color: i === 0 ? bg : ink }]}>{r.item}</Text>
            <View style={[styles.badge, { backgroundColor: i === 0 ? bg : ink }]}>
              <Text style={[styles.badgeText, { color: i === 0 ? ink : bg }]}>×{r.count}</Text>
            </View>
          </View>
        </WPop>
      ))}
    </View>
  )
}

/** A day as a half circle, midnight to midnight: a dot per log, the bird perched at their usual time. */
function DayArc({ minutes, usual, ink }: { minutes: number[]; usual: number; ink: string }) {
  const { width } = useWindowDimensions()
  const w = Math.min(width - 56, 360)
  const pad = 10
  const r = w / 2 - pad
  const cx = w / 2
  const cy = r + pad
  const at = (m: number) => {
    const theta = Math.PI * (1 - Math.min(1440, Math.max(0, m)) / 1440)
    return { x: cx + r * Math.cos(theta), y: cy - r * Math.sin(theta) }
  }
  const bird = at(usual)
  const birdSize = 46
  return (
    <WFade delay={250} style={{ width: w, alignSelf: 'center', marginTop: 8 }}>
      <View style={{ width: w, height: cy + 4 }}>
        <Svg width={w} height={cy + 4}>
          <Path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} stroke={`${ink}66`} strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" fill="none" />
          {minutes.map((m, i) => {
            const p = at(m)
            return <Circle key={i} cx={p.x} cy={p.y} r={6} fill={ink} opacity={0.85} />
          })}
        </Svg>
        <WPop delay={600} style={{ position: 'absolute', left: bird.x - birdSize / 2, top: bird.y - birdSize + 6 }}>
          <BirdLandingMark size={birdSize} color={ink} autoplay={false} perched />
        </WPop>
      </View>
      <View style={styles.arcLabels}>
        {['12am', 'noon', '12am'].map((label, i) => (
          <Text key={i} style={[styles.arcLabel, { color: `${ink}bb` }]}>{label}</Text>
        ))}
      </View>
    </WFade>
  )
}

function CategoryBars({ categories, ink, money }: { categories: NonNullable<WeekRecap['categories']>; ink: string; money: (n: number) => string }) {
  const max = Math.max(...categories.map((c) => c.pct), 1)
  return (
    <View style={styles.bars}>
      {categories.map((c, i) => {
        const { icon, text } = splitEmoji(c.category)
        return (
          <WRise key={c.category} delay={300 + i * 120} style={{ gap: 6 }}>
            <View style={styles.barHead}>
              <Text style={[styles.barLabel, { color: ink }]} numberOfLines={1}>{icon ? `${icon} ` : ''}{text || c.category}</Text>
              <Text style={[styles.barValue, { color: ink }]}>{money(c.total)} · {Math.round(c.pct)}%</Text>
            </View>
            <View style={[styles.barTrack, { backgroundColor: `${ink}26` }]}>
              <WGrowX delay={380 + i * 120} duration={800} style={{ width: `${(c.pct / max) * 100}%` }}>
                <View style={[styles.barFill, { backgroundColor: ink, opacity: i === 0 ? 1 : 0.6 }]} />
              </WGrowX>
            </View>
          </WRise>
        )
      })}
    </View>
  )
}

function Receipt({ biggest, accent, money }: { biggest: NonNullable<WeekRecap['biggest']>; accent: string; money: (n: number) => string }) {
  const { text, icon } = splitEmoji(biggest.category)
  const rows: [string, string][] = [
    ['Item', biggest.item],
    ['Category', `${icon ? `${icon} ` : ''}${text || biggest.category}`],
    ['Date', formatDateShort(biggest.date)],
  ]
  return (
    <WRise delay={350} style={styles.receiptWrap}>
      <View style={styles.receipt}>
        <Text style={[styles.receiptHead, { color: accent }]}>AVIARY · RECEIPT</Text>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>{label}</Text>
            <Text style={styles.receiptValue} numberOfLines={1}>{value}</Text>
          </View>
        ))}
        <View style={styles.receiptRule} />
        <View style={styles.receiptRow}>
          <Text style={[styles.receiptLabel, styles.receiptTotalLabel]}>Total</Text>
          <Text style={[styles.receiptTotal, { color: accent }]}>{money(biggest.amountInr)}</Text>
        </View>
      </View>
    </WRise>
  )
}

/** Full-width burst over the send-off slide. */
export function Confetti() {
  const { tokens } = useTheme()
  return (
    <View style={styles.confetti} pointerEvents="none">
      {Array.from({ length: 22 }, (_, i) => <ConfettiPiece key={i} index={i} tokens={tokens} />)}
    </View>
  )
}

const RECEIPT_INK = '#2a2420'

const styles = StyleSheet.create({
  title: { fontSize: 46, lineHeight: 52, fontFamily: fontFamily.displayBold, letterSpacing: -0.8 },
  dotRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  dotCol: { alignItems: 'center', gap: 6 },
  dot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dotTick: { fontSize: 18, fontFamily: fontFamily.bodyBlack },
  dotLabel: { fontSize: 13, fontFamily: fontFamily.bodyBold },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 18, paddingRight: 8, paddingVertical: 8, borderRadius: 999, borderWidth: 2 },
  chipText: { fontSize: 20, fontFamily: fontFamily.displaySemiBold },
  badge: { minWidth: 36, paddingHorizontal: 8, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 15, fontFamily: fontFamily.bodyBlack },
  arcLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  arcLabel: { fontSize: 12, fontFamily: fontFamily.bodyBold, letterSpacing: 0.5 },
  bars: { gap: 14, marginTop: 18 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  barLabel: { flexShrink: 1, fontSize: 16, fontFamily: fontFamily.bodyBold },
  barValue: { fontSize: 14, fontFamily: fontFamily.bodyExtraBold },
  barTrack: { height: 14, borderRadius: 7, overflow: 'hidden' },
  barFill: { flex: 1, height: 14, borderRadius: 7 },
  receiptWrap: { marginTop: 20, transform: [{ rotate: '-2deg' }] },
  receipt: { backgroundColor: '#fffaf3', borderRadius: 18, padding: 20, gap: 10, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  receiptHead: { fontSize: 12, letterSpacing: 2, fontFamily: fontFamily.bodyBlack, marginBottom: 4 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 },
  receiptLabel: { fontSize: 14, color: `${RECEIPT_INK}99`, fontFamily: fontFamily.bodySemiBold },
  receiptValue: { flexShrink: 1, fontSize: 16, color: RECEIPT_INK, fontFamily: fontFamily.bodyBold },
  receiptRule: { borderTopWidth: 2, borderStyle: 'dashed', borderColor: `${RECEIPT_INK}33`, marginVertical: 4 },
  receiptTotalLabel: { color: RECEIPT_INK, fontFamily: fontFamily.bodyBlack },
  receiptTotal: { fontSize: 24, fontFamily: fontFamily.displayBold },
  confetti: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
})
