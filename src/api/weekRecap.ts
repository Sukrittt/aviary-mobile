import { apiFetch } from './client'

/** Twin of Web/lib/weekRecap.ts's `WeekRecap`, as GET /api/recap returns it. */
export interface WeekRecap {
  startDate: string
  endDate: string
  totalTransactions: number
  totalSpent: number
  daysLogged: number
  topCategory: { category: string; total: number; pct: number } | null
  biggest: { item: string; category: string; amountInr: number; date: string } | null
  repeats: { item: string; category: string; count: number }[]
  usualMinute: number | null
  /** Newer servers only: each date with an expense, every log's minute, and up to 4 categories. */
  loggedDates?: string[]
  logMinutes?: number[]
  categories?: { category: string; total: number; pct: number }[]
}

export async function getWeekRecap(): Promise<{ due: boolean; recap?: WeekRecap }> {
  const resp = await apiFetch('/api/recap')
  if (!resp.ok) throw new Error(`Failed to load recap: ${resp.status}`)
  return resp.json()
}

/** First device to call this wins; the recap is never due again anywhere. */
export async function markWeekRecapSeen(): Promise<void> {
  const resp = await apiFetch('/api/user', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekRecapSeen: true }),
  })
  if (!resp.ok) throw new Error(`Failed to mark recap seen: ${resp.status}`)
}
