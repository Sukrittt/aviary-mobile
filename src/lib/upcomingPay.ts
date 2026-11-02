import type { RecurringIncomeRow } from '@/src/types'
import { parseLocalDate } from '@/src/lib/date'

/**
 * The next pay to land, for a month it hasn't landed in yet. Until then
 * envelopes hold only what carried in (src/lib/envelope.ts `PAYCHECK_START`), so
 * Home says when the plan fills up. Twin of Web's src/lib/upcomingPay.ts.
 */
export function upcomingPayday(schedules: RecurringIncomeRow[]): RecurringIncomeRow | undefined {
  return schedules
    .filter((r) => r.status === 'active' && r.next_run_date)
    .sort((a, b) => a.next_run_date.localeCompare(b.next_run_date))[0]
}

/** 21 -> "21st". */
export function ordinal(day: number): string {
  const teens = day % 100 >= 11 && day % 100 <= 13
  return `${day}${(!teens && ['th', 'st', 'nd', 'rd'][day % 10]) || 'th'}`
}

/** This month's date for a day of the month, or its last day when the month is short. */
export function paydayInMonth(day: number, today: string): string {
  const [y, m] = today.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${today.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, '0')}`
}

/** What picking this payday in setup means: a day that's come already counts now. */
export function paydayHint(day: number, today: string): string {
  const date = paydayInMonth(day, today)
  return date <= today ? "That's already landed, so your plan fills up now." : `Your plan fills up ${paydayLabel(date)}.`
}

/** "Nov 4". */
export function paydayLabel(date: string): string {
  return parseLocalDate(date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

/** Add income as this month's starting balance, the bridge until `payday`. */
export function startingBalanceHref(payday: string) {
  const day = paydayLabel(payday)
  return {
    pathname: '/modals/add-income' as const,
    params: { label: 'Starting balance', intro: `Your pay lands ${day}. What do you have to spend till then?` },
  }
}
