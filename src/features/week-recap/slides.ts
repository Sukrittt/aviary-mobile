import type { WeekRecap } from '@/src/api/weekRecap'

/**
 * The first-week recap's slides, from the server's numbers. Twin of
 * Web/src/components/wrapped/WeekRecap.tsx's `recapSlides`: same copy and
 * order on both, since a user may see either.
 */

/** Below this many expenses there's nothing to learn yet, so the recap asks for more instead. */
const LIGHT_WEEK = 3

/** `bird` shows the Aviary mark in place of an emoji. */
export type RecapSlide = { color: string; ink: string; eyebrow: string; title: string; emoji?: string; bird?: boolean; body: string }

/** Minutes after midnight, to the nearest half hour: 1230 -> "8:30pm", 1263 -> "9pm". */
export function formatMinute(minute: number): string {
  const rounded = (Math.round(minute / 30) * 30) % 1440
  const h = Math.floor(rounded / 60)
  return `${h % 12 || 12}${rounded % 60 ? ':30' : ''}${h < 12 ? 'am' : 'pm'}`
}

export function recapSlides(recap: WeekRecap, money: (n: number) => string): RecapSlide[] {
  const n = recap.totalTransactions
  if (n < LIGHT_WEEK) {
    return [
      {
        color: '#4b4fcc', ink: '#ffffff', eyebrow: 'Your first week', title: "Let's get to know you", bird: true,
        body: n === 0
          ? "You haven't logged anything yet. Log a few expenses and we'll start spotting your patterns."
          : `You logged ${n} ${n === 1 ? 'expense' : 'expenses'} this week. Log a few more and we'll start spotting your patterns.`,
      },
    ]
  }

  const slides: RecapSlide[] = [
    {
      color: '#4b4fcc', ink: '#ffffff', eyebrow: 'Your first week', title: "Here's what we learned about you", bird: true,
      body: `${n} expenses across ${recap.daysLogged} of 7 days. Here's what stood out.`,
    },
  ]
  const [first, ...rest] = recap.repeats
  if (first) {
    slides.push({
      color: '#cd7d00', ink: '#2e1200', eyebrow: 'Your regulars', title: `${first.item}, ${first.count} times`, emoji: '🔁',
      body: rest.length ? `Then ${rest.map((r) => `${r.item} (${r.count})`).join(' · ')}. We'll have these ready for you.` : "A regular already. We'll have it ready for you.",
    })
  }
  if (recap.usualMinute !== null) {
    slides.push({
      color: '#ad2ca7', ink: '#ffffff', eyebrow: 'Your logging hour', title: `Around ${formatMinute(recap.usualMinute)}`, emoji: '🕘',
      body: "That's when you usually check in. Keep the rhythm going.",
    })
  }
  if (recap.topCategory) {
    slides.push({
      color: '#008140', ink: '#ffffff', eyebrow: 'Where it went', title: recap.topCategory.category, emoji: '📊',
      body: `${Math.round(recap.topCategory.pct)}% of your spending · ${money(recap.topCategory.total)}`,
    })
  }
  if (recap.biggest) {
    slides.push({
      color: '#c91f3a', ink: '#ffffff', eyebrow: 'Biggest spend', title: money(recap.biggest.amountInr), emoji: '💸',
      body: `${recap.biggest.item} in ${recap.biggest.category}.`,
    })
  }
  slides.push({
    color: '#4b4fcc', ink: '#ffffff', eyebrow: 'Week one · done', title: "You're off to a great start", emoji: '🌱',
    body: "Keep logging and we'll get sharper every week.",
  })
  return slides
}
