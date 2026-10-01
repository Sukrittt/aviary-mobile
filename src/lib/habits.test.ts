import { findHabits, planNudges, settleNudges, type Habit } from './habits'
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
