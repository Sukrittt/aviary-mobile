import { apiFetch } from './client'

export interface WrappedData {
  month: string
  range: { startDate: string; endDate: string; daysTracked: number }
  totalSpent: number
  totalTransactions: number
  topCategories: { category: string; total: number; pct: number }[]
  biggestPurchase: { item: string; amountInr: number; category: string; date: string } | null
  topWeekday: { day: string; total: number; count: number } | null
  longestStreak: { days: number; startDate: string; endDate: string } | null
  longestGap: { days: number; startDate: string; endDate: string } | null
  weeklyTotals: { label: string; total: number }[]
  /** The month's deck, picked and ordered by the server. Absent from a server older than the story engine. */
  stories?: WrappedStory[]
  /** Last month's summary, null when there wasn't one. */
  previous?: {
    month: string
    totalSpent: number
    daysLogged: number
    longestStreak: number
    topCategories: { category: string; total: number }[]
  } | null
}

type Span = { days: number; startDate: string; endDate: string }

/** Mirrors `StoryFacts` in the web repo's src/services/wrappedStories.ts. */
export interface StoryFacts {
  showed_up: { days: number; daysInMonth: number }
  streak: Span
  comeback: { quietDays: number; startDate: string; endDate: string }
  night_logger: { lateCount: number; count: number }
  how_you_log: { scans: number; count: number }
  biggest_hit: { item: string; amount: number; category: string; date: string; timesMedian: number }
  small_stuff: { count: number; total: number; of: number }
  spendiest_weekday: { day: string; total: number; count: number; totals: number[] }
  heavy_week: { startDate: string; endDate: string; total: number; share: number }
  weekend_split: { heavier: 'weekend' | 'weekday'; ratio: number }
  your_usual: { item: string; count: number; total: number }
  top_category: { category: string; total: number; pct: number; runnersUp: { category: string; total: number }[] }
  where_it_went: { categories: { category: string; total: number; pct: number }[] }
  stayed_put: { left: number; assigned: number }
  burst_envelope: { category: string; spent: number; budget: number }
  up_or_down: { previousMonth: string; previousTotal: number; total: number }
  category_mover: { category: string; previous: number; current: number }
  new_category: { category: string; total: number }
  habit_change: { metric: 'streak' | 'days'; from: number; to: number }
}
export type StoryType = keyof StoryFacts

export type WrappedStory = {
  [T in StoryType]: { type: T; group: string; score: number; variant: number; facts: StoryFacts[T] }
}[StoryType]

export type WrappedPersona = 'daily_tracker' | 'loyalist' | 'steady_hand' | 'free_spirit' | 'big_swing' | 'slow_burn'

export interface WrappedJudgement {
  persona: WrappedPersona | null
  treatCategory: string | null
}

export interface WrappedStatus {
  month: string
  transactionCount: number
  available: boolean
  minTransactions: number
  /** In-progress calendar month tracked toward the next unlock. */
  currentMonth: string
  currentMonthCount: number
}

export async function getWrapped(month?: string): Promise<WrappedData> {
  const url = month ? `/api/wrapped?month=${month}` : '/api/wrapped'
  const resp = await apiFetch(url)
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}))
    throw new Error(detail.error ?? `Failed to load wrapped: ${resp.status}`)
  }
  return resp.json()
}

export async function getWrappedStatus(): Promise<WrappedStatus> {
  const resp = await apiFetch('/api/wrapped/status')
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}))
    throw new Error(detail.error ?? `Failed to load wrapped status: ${resp.status}`)
  }
  return resp.json()
}

/** Never throws: the persona is a garnish, so a failure just means the rule-based one. */
export async function getWrappedJudgement(month?: string): Promise<WrappedJudgement> {
  try {
    const resp = await apiFetch(month ? `/api/wrapped/judgement?month=${month}` : '/api/wrapped/judgement')
    if (!resp.ok) return { persona: null, treatCategory: null }
    return await resp.json()
  } catch {
    return { persona: null, treatCategory: null }
  }
}
