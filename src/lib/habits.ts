import type { ExpenseRow } from '@/src/types'
import { toLocalDateString } from '@/src/lib/date'

/**
 * Spending habits read off the user's own history, for the "time to log it?"
 * nudges in habitNudges.ts. Pure: no storage, no clock, no notifications.
 *
 * A habit is the same spend (item + category) logged on the same weekday at
 * least MIN_HITS times in the last LOOKBACK_DAYS, inside one SLOT_MIN window.
 * Weekdays whose slots line up merge into one habit, so a nightly spend and a
 * Mon/Wed/Fri one fall out of the same rule.
 *
 * Time of day is when the spend was *logged*, not spent. Someone who logs
 * their whole day at night looks like a 10pm habit; settleNudges' shift is
 * how the schedule walks toward when they actually respond.
 */

export type Habit = {
  id: string
  item: string
  category: string
  amountInr: number
  paymentMethod: string
  /** 0 = Sunday, ascending. */
  weekdays: number[]
  /** Minutes after local midnight. */
  minute: number
  /** Hits behind this habit. Ranks habits when a day has too many. */
  count: number
}

export type HabitState = Record<string, { ignores: number; shiftMin: number; muted: boolean }>

/** A nudge that was handed to the OS. `fireAt` is ISO so it survives storage. */
export type ScheduledNudge = { id: string; habitId: string; fireAt: string; date: string }

export type PlannedNudge = { habitId: string; fireAt: Date; date: string }

const LOOKBACK_DAYS = 56
const STALE_DAYS = 21
const MIN_HITS = 3
const SLOT_MIN = 120
const LEAD_MIN = 15
const PLAN_DAYS = 7
const MAX_PER_DAY = 2
const SHIFT_AFTER = 2
const SHIFT_STEP = 60
const MAX_SHIFT = 180
const MUTE_AFTER = 5

// Logged by the server on a schedule, not by a person at a moment.
const AUTO_SOURCES = new Set(['recurring', 'subscription'])

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const keyOf = (r: Pick<ExpenseRow, 'item' | 'category'>) => `${normalize(r.category)}|${normalize(r.item)}`
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function mostCommon(xs: string[]): string {
  const counts = new Map<string, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

type Hit = { row: ExpenseRow; minute: number }

/** Every SLOT_MIN window with enough hits in it, densest taken first. */
function slotsOf(hits: Hit[]): Hit[][] {
  let rest = [...hits].sort((a, b) => a.minute - b.minute)
  const slots: Hit[][] = []
  for (;;) {
    let best: Hit[] = []
    for (let i = 0, j = 0; j < rest.length; j++) {
      while (rest[j].minute - rest[i].minute > SLOT_MIN) i++
      if (j - i + 1 > best.length) best = rest.slice(i, j + 1)
    }
    if (best.length < MIN_HITS) return slots
    slots.push(best)
    rest = rest.filter((h) => !best.includes(h))
  }
}

export function findHabits(rows: ExpenseRow[], today: string): Habit[] {
  const byKey = new Map<string, Hit[][]>()
  for (const row of rows) {
    if (AUTO_SOURCES.has(row.source)) continue
    if (!(Number(row.amount_inr) > 0) || !row.item.trim()) continue
    const age = daysBetween(row.date, today)
    if (age < 0 || age > LOOKBACK_DAYS) continue
    const time = row.timestamp.slice(11, 16)
    if (!/^\d\d:\d\d$/.test(time)) continue
    const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
    const days = byKey.get(keyOf(row)) ?? Array.from({ length: 7 }, () => [])
    days[weekdayOf(row.date)].push({ row, minute })
    byKey.set(keyOf(row), days)
  }

  const habits: Habit[] = []
  for (const [key, days] of byKey) {
    // One slot per weekday, then merge weekdays whose slots sit close together.
    const slots = days
      .flatMap((hits, weekday) => slotsOf(hits).map((slot) => ({ weekday, hits: slot })))
      .filter((s) => s.hits.some((h) => daysBetween(h.row.date, today) <= STALE_DAYS))
      .map((s) => ({ ...s, minute: median(s.hits.map((h) => h.minute)) }))
      .sort((a, b) => a.minute - b.minute)

    const groups: (typeof slots)[] = []
    for (const slot of slots) {
      const last = groups[groups.length - 1]
      if (last && slot.minute - last[0].minute <= SLOT_MIN) last.push(slot)
      else groups.push([slot])
    }

    groups.forEach((group, i) => {
      const hits = group.flatMap((s) => s.hits)
      const newest = hits.reduce((a, b) => (b.row.timestamp > a.row.timestamp ? b : a))
      habits.push({
        id: groups.length > 1 ? `${key}#${i}` : key,
        item: mostCommon(hits.map((h) => h.row.item.trim())),
        category: newest.row.category,
        amountInr: median(hits.map((h) => Number(h.row.amount_inr))),
        paymentMethod: mostCommon(hits.map((h) => h.row.payment_method || 'bank')),
        weekdays: [...new Set(group.map((s) => s.weekday))].sort((a, b) => a - b),
        minute: median(hits.map((h) => h.minute)),
        count: hits.length,
      })
    })
  }
  return habits.sort((a, b) => a.minute - b.minute)
}

/** Which nudges to schedule for the next PLAN_DAYS days, earliest first. */
export function planNudges(habits: Habit[], state: HabitState, now: Date, rows: ExpenseRow[]): PlannedNudge[] {
  const today = toLocalDateString(now)
  const loggedToday = new Set(rows.filter((r) => r.date === today).map(keyOf))
  const ranked = [...habits].sort((a, b) => b.count - a.count)
  const plan: PlannedNudge[] = []

  for (let d = 0; d < PLAN_DAYS; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    const date = toLocalDateString(day)
    let used = 0
    for (const habit of ranked) {
      if (used >= MAX_PER_DAY) break
      const s = state[habit.id]
      if (s?.muted || !habit.weekdays.includes(day.getDay())) continue
      if (d === 0 && loggedToday.has(keyOf(habit))) continue
      const fireAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, habit.minute + LEAD_MIN + (s?.shiftMin ?? 0))
      if (fireAt <= now) continue
      plan.push({ habitId: habit.id, fireAt, date })
      used++
    }
  }
  return plan.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
}

/**
 * Folds nudges that already fired into each habit's state. Tapped, acted on,
 * or the spend got logged that day anyway: ignores reset. Otherwise it counts
 * as ignored: every SHIFT_AFTER in a row moves the habit an hour later (up to
 * MAX_SHIFT), and MUTE_AFTER in a row stops it.
 */
export function settleNudges(scheduled: ScheduledNudge[], handled: Set<string>, state: HabitState, rows: ExpenseRow[], now: Date): HabitState {
  const next: HabitState = { ...state }
  const logged = new Set(rows.map((r) => `${r.date}~${keyOf(r)}`))
  const fired = scheduled.filter((n) => Date.parse(n.fireAt) <= now.getTime()).sort((a, b) => a.fireAt.localeCompare(b.fireAt))
  for (const n of fired) {
    const prev = next[n.habitId] ?? { ignores: 0, shiftMin: 0, muted: false }
    const key = n.habitId.split('#')[0]
    if (handled.has(n.id) || logged.has(`${n.date}~${key}`)) {
      next[n.habitId] = { ...prev, ignores: 0 }
      continue
    }
    const ignores = prev.ignores + 1
    const shiftMin = ignores % SHIFT_AFTER === 0 ? Math.min(prev.shiftMin + SHIFT_STEP, MAX_SHIFT) : prev.shiftMin
    next[n.habitId] = { ignores, shiftMin, muted: prev.muted || ignores >= MUTE_AFTER }
  }
  return next
}
