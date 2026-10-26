import { findHabits, habitProgress, planNudges, settleNudges, type Habit } from './habits'
import type { ExpenseRow } from '@/src/types'

// 2026-09-28 is a Monday.
const TODAY = '2026-10-01' // Thursday

function row(date: string, time: string, item: string, amount: number, extra: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    timestamp: `${date}T${time}:00+05:30`,
    date,
    item,
    amount_inr: String(amount),
    category: extra.category ?? 'Groceries',
    notes: '',
    source: 'manual',
    amount: String(amount),
    description: '',
    payment_method: 'bank',
    ...extra,
  }
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** `weeks` consecutive weeks of the same weekday, ending at `last`. */
function weekly(last: string, weeks: number, time: string, item: string, amount: number, extra: Partial<ExpenseRow> = {}): ExpenseRow[] {
  return Array.from({ length: weeks }, (_, i) => row(addDays(last, -7 * i), time, item, amount, extra))
}

describe('findHabits', () => {
  it('finds a Mon/Wed/Fri evening habit as one habit', () => {
    const rows = [
      ...weekly('2026-09-28', 4, '19:10', 'Football', 200, { category: 'Fun' }),
      ...weekly('2026-09-30', 4, '19:40', 'football ', 200, { category: 'Fun' }),
      ...weekly('2026-09-25', 4, '18:50', 'Football', 250, { category: 'Fun' }),
    ]
    const habits = findHabits(rows, TODAY)
    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({ item: 'Football', category: 'Fun', weekdays: [1, 3, 5], amountInr: 200, paymentMethod: 'bank' })
    expect(habits[0].minute).toBeGreaterThanOrEqual(18 * 60 + 50)
    expect(habits[0].minute).toBeLessThanOrEqual(19 * 60 + 40)
  })

  it('finds a nightly habit across every weekday', () => {
    const rows = Array.from({ length: 28 }, (_, i) => row(addDays('2026-09-30', -i), '21:30', 'Groceries', 300))
    const [habit] = findHabits(rows, TODAY)
    expect(habit.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(habit.minute).toBe(21 * 60 + 30)
  })

  it('needs at least 3 hits on a weekday', () => {
    expect(findHabits(weekly('2026-09-28', 2, '19:00', 'Football', 200), TODAY)).toEqual([])
  })

  it('ignores hits spread across the day', () => {
    const rows = [row('2026-09-28', '08:00', 'Coffee', 100), row('2026-09-21', '13:00', 'Coffee', 100), row('2026-09-14', '20:00', 'Coffee', 100)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('drops a habit that stopped more than 3 weeks ago', () => {
    expect(findHabits(weekly('2026-09-07', 5, '19:00', 'Football', 200), TODAY)).toEqual([])
  })

  it('only looks back 8 weeks', () => {
    const rows = [...weekly('2026-09-28', 2, '19:00', 'Football', 200), row('2026-07-27', '19:00', 'Football', 200)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('skips spends the server logged on its own', () => {
    expect(findHabits(weekly('2026-09-28', 4, '03:00', 'Netflix', 199, { source: 'subscription' }), TODAY)).toEqual([])
    expect(findHabits(weekly('2026-09-28', 4, '03:00', 'Rent', 9000, { source: 'recurring' }), TODAY)).toEqual([])
  })

  it('keeps two time slots of the same spend apart', () => {
    const rows = [...weekly('2026-09-28', 4, '08:00', 'Coffee', 100), ...weekly('2026-09-28', 4, '16:00', 'Coffee', 150)]
    const habits = findHabits(rows, TODAY)
    expect(habits.map((h) => h.minute)).toEqual([8 * 60, 16 * 60])
    expect(new Set(habits.map((h) => h.id)).size).toBe(2)
  })
})

describe('findHabits, across weekdays', () => {
  /** One log a day for `days` days ending yesterday (2026-09-30). */
  const daily = (days: number, time: string, item: string, extra: Partial<ExpenseRow> = {}) =>
    Array.from({ length: days }, (_, i) => row(addDays('2026-09-30', -i), time, item, 120, extra))

  it('finds a daily coffee after 3 days, nudging every weekday', () => {
    const habits = findHabits(daily(3, '09:05', 'Coffee', { category: 'Food' }), TODAY)
    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({ id: 'food|coffee', item: 'Coffee', weekdays: [0, 1, 2, 3, 4, 5, 6], minute: 9 * 60 + 5 })
  })

  it('a nudge can fire on day 4', () => {
    const habits = findHabits(daily(3, '09:05', 'Coffee'), TODAY)
    expect(planNudges(habits, {}, at(TODAY, 8), [])[0]).toMatchObject({ date: TODAY, fireAt: at(TODAY, 9, 20) })
  })

  it('needs 3 different days, not 3 logs', () => {
    const rows = [row('2026-09-30', '09:00', 'Coffee', 100), row('2026-09-30', '09:30', 'Coffee', 100), row('2026-09-29', '09:10', 'Coffee', 100)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('needs the days to line up in one time slot', () => {
    const rows = [row('2026-09-30', '08:00', 'Coffee', 100), row('2026-09-29', '13:00', 'Coffee', 100), row('2026-09-28', '20:00', 'Coffee', 100)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('only pools the last 2 weeks', () => {
    const rows = [row('2026-09-30', '09:00', 'Coffee', 100), row('2026-09-29', '09:00', 'Coffee', 100), row('2026-09-16', '09:00', 'Coffee', 100)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('keeps the exclusions', () => {
    expect(findHabits(daily(3, '03:00', 'Netflix', { source: 'subscription' }), TODAY)).toEqual([])
    expect(findHabits(daily(3, '09:00', 'Coffee', { amount_inr: '0' }), TODAY)).toEqual([])
    expect(findHabits(daily(3, '09:00', '  '), TODAY)).toEqual([])
  })

  it('drops weekdays that came round and got skipped', () => {
    // Mon to Fri for two weeks, never on a weekend.
    const rows = daily(14, '09:00', 'Coffee').filter((r) => ![0, 6].includes(new Date(`${r.date}T00:00:00Z`).getUTCDay()))
    expect(findHabits(rows, TODAY)[0].weekdays).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps weekdays that have not come round yet', () => {
    // Mon, Tue, Wed, then today (Thu) before the usual time: nothing skipped so far.
    expect(findHabits(daily(3, '09:00', 'Coffee'), TODAY)[0].weekdays).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('merges with the weekday rule into one habit, keeping its id', () => {
    // A month of Mon/Wed/Fri: both rules see it. One habit, still only those days.
    const rows = [
      ...weekly('2026-09-28', 4, '19:10', 'Football', 200, { category: 'Fun' }),
      ...weekly('2026-09-30', 4, '19:40', 'Football', 200, { category: 'Fun' }),
      ...weekly('2026-09-25', 4, '18:50', 'Football', 200, { category: 'Fun' }),
    ]
    const habits = findHabits(rows, TODAY)
    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({ id: 'fun|football', weekdays: [1, 3, 5], count: 12 })
  })

  it('widens a weekday habit once the spend turns daily', () => {
    // 3 Wednesdays at 9am, then every day this past week.
    const rows = [...weekly('2026-09-23', 3, '09:00', 'Coffee', 100), ...daily(8, '09:00', 'Coffee')]
    const habits = findHabits(rows, TODAY)
    expect(habits).toHaveLength(1)
    expect(habits[0].weekdays).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('leaves a weekly spend to the weekday rule', () => {
    expect(findHabits(weekly('2026-09-25', 2, '22:00', 'Uber', 300), TODAY)).toEqual([])
    expect(findHabits(weekly('2026-09-25', 3, '22:00', 'Uber', 300), TODAY)[0].weekdays).toEqual([5])
  })
})

describe('habitProgress', () => {
  const coffee = (date: string, time = '09:00', extra: Partial<ExpenseRow> = {}) => row(date, time, 'Coffee', 100, { id: `c-${date}-${time}`, ...extra })

  it('counts days in the same time slot, this log included', () => {
    expect(habitProgress([coffee('2026-09-30')], coffee(TODAY), TODAY)).toEqual({ seen: 2, left: 1, habit: false })
  })

  it('counts this log once when the list already has it', () => {
    const now = coffee(TODAY)
    expect(habitProgress([coffee('2026-09-30'), now], now, TODAY)).toEqual({ seen: 2, left: 1, habit: false })
  })

  it('sees the first log as 1', () => {
    expect(habitProgress([], coffee(TODAY), TODAY)).toEqual({ seen: 1, left: 2, habit: false })
  })

  it('ignores logs at another time of day, or the same day', () => {
    expect(habitProgress([coffee('2026-09-30', '20:00'), coffee(TODAY, '08:00')], coffee(TODAY), TODAY)).toEqual({ seen: 1, left: 2, habit: false })
  })

  it('is a habit on the third day', () => {
    expect(habitProgress([coffee('2026-09-29'), coffee('2026-09-30')], coffee(TODAY), TODAY)).toEqual({ seen: 3, left: 0, habit: true })
  })

  it('is a habit when the weekday rule already found one', () => {
    const rows = weekly('2026-09-24', 3, '09:00', 'Coffee', 100)
    expect(habitProgress(rows, coffee(TODAY, '09:00'), TODAY)).toMatchObject({ habit: true })
  })

  it('has nothing to say about spends nudges never cover', () => {
    expect(habitProgress([], coffee(TODAY, '09:00', { amount_inr: '0' }), TODAY)).toBeNull()
    expect(habitProgress([], coffee(TODAY, '09:00', { timestamp: '' }), TODAY)).toBeNull()
  })
})

const football: Habit = { id: 'fun|football', item: 'Football', category: 'Fun', amountInr: 200, paymentMethod: 'bank', weekdays: [1, 3, 5], minute: 19 * 60, count: 12 }

// Local wall-clock dates, so the test reads the same in any TZ.
const at = (date: string, hh: number, mm = 0) => new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hh, mm)

describe('planNudges', () => {
  it('schedules the next 7 days, 15 min after the usual time', () => {
    const plan = planNudges([football], {}, at(TODAY, 9), [])
    expect(plan.map((p) => p.date)).toEqual(['2026-10-02', '2026-10-05', '2026-10-07'])
    expect(plan[0].fireAt).toEqual(at('2026-10-02', 19, 15))
  })

  it('includes today when the time is still ahead', () => {
    const plan = planNudges([{ ...football, weekdays: [4] }], {}, at(TODAY, 9), [])
    expect(plan[0].date).toBe(TODAY)
  })

  it('skips today once the spend is already logged', () => {
    const plan = planNudges([{ ...football, weekdays: [4] }], {}, at(TODAY, 9), [row(TODAY, '08:00', 'football', 200, { category: 'Fun' })])
    // Next Thursday is 7 days out, past the window.
    expect(plan).toEqual([])
  })

  it('applies the learned shift and skips muted habits', () => {
    expect(planNudges([football], { [football.id]: { ignores: 2, shiftMin: 60, muted: false } }, at(TODAY, 9), [])[0].fireAt).toEqual(at('2026-10-02', 20, 15))
    expect(planNudges([football], { [football.id]: { ignores: 5, shiftMin: 60, muted: true } }, at(TODAY, 9), [])).toEqual([])
  })

  it('caps nudges at 2 a day, keeping the strongest habits', () => {
    const habits = [1, 2, 3].map((n) => ({ ...football, id: `h${n}`, count: n, weekdays: [5] }))
    const plan = planNudges(habits, {}, at(TODAY, 9), [])
    expect(plan.map((p) => p.habitId)).toEqual(['h3', 'h2'])
  })
})

describe('settleNudges', () => {
  const past = { id: 'n1', habitId: football.id, fireAt: at('2026-09-30', 19, 15).toISOString(), date: '2026-09-30' }

  it('counts an unanswered nudge as ignored', () => {
    expect(settleNudges([past], new Set(), {}, [], at(TODAY, 9))[football.id]).toEqual({ ignores: 1, shiftMin: 0, muted: false })
  })

  it('shifts an hour later after 2 ignores and mutes after 5', () => {
    expect(settleNudges([past], new Set(), { [football.id]: { ignores: 1, shiftMin: 0, muted: false } }, [], at(TODAY, 9))[football.id]).toEqual({ ignores: 2, shiftMin: 60, muted: false })
    expect(settleNudges([past], new Set(), { [football.id]: { ignores: 4, shiftMin: 60, muted: false } }, [], at(TODAY, 9))[football.id]).toEqual({ ignores: 5, shiftMin: 60, muted: true })
  })

  it('resets ignores when the spend got logged that day, keeping the shift', () => {
    const rows = [row('2026-09-30', '22:00', 'Football', 200, { category: 'Fun' })]
    expect(settleNudges([past], new Set(), { [football.id]: { ignores: 3, shiftMin: 60, muted: false } }, rows, at(TODAY, 9))[football.id]).toEqual({ ignores: 0, shiftMin: 60, muted: false })
  })

  it('resets ignores when the nudge was tapped', () => {
    expect(settleNudges([past], new Set(['n1']), { [football.id]: { ignores: 3, shiftMin: 0, muted: false } }, [], at(TODAY, 9))[football.id].ignores).toBe(0)
  })

  it('leaves nudges that have not fired yet alone', () => {
    expect(settleNudges([{ ...past, fireAt: at(TODAY, 19).toISOString() }], new Set(), {}, [], at(TODAY, 9))).toEqual({})
  })
})
