// One request for the reads every app open makes, instead of ~16 at once.
// On Android those queued behind OkHttp's per-host cap and, after a resume, a
// fresh TLS handshake: the slowest of a burst had a p90 of 2.6s (PostHog,
// 2026-11-06). Web's /api/app-open runs each route's own GET with this
// request's headers, so every slice is what the separate call would answer.
//
// Nothing above apiFetch changes. While a bundle is fresh, apiFetch answers a
// plain GET for one of its paths from it. A slice that isn't a 200, a failed
// bundle or an older server that has no /api/app-open all fall through to the
// real request, so 401/402/403 handling stays exactly where it was.
// The request itself is client.ts's startAppOpen; this file only holds the
// answer, so client.ts can read it without an import cycle.
import { sessionGeneration } from './accessMode'
import { activeBudgetId } from '@/src/lib/activeBudget'
import { currentMonthKey } from '@/src/lib/envelope'

type Slice = { status: number; body: unknown }
export type AppOpenSlices = Record<string, Slice>
type Bundle = { generation: number; budgetId: string | null; landedAt: number | null; slices: Promise<AppOpenSlices | null> }

/**
 * How long after it lands a bundle still answers: the bundled queries' own
 * 30s staleTime, so it's never older than what React Query would show without
 * refetching. Counted from the answer, so a slow bundle doesn't shut out the
 * reads it covers (Home can mount well after launch).
 */
const WINDOW_MS = 30_000

let current: Bundle | null = null

/** Exactly the paths the app's own wrappers request on Home and the tab bar. Expenses and the forecast stay separate: heavy. */
export function appOpenPaths(): string[] {
  return [
    '/api/user',
    '/api/budgets',
    `/api/budgets/carry?month=${currentMonthKey()}`,
    '/api/categories',
    '/api/groups',
    '/api/groups?icons=1',
    '/api/spaces',
    '/api/accounts',
    '/api/billing/status',
    '/api/category-map',
    '/api/incomes',
    '/api/recurring-incomes',
    '/api/import/status',
    '/api/changelog/latest?platform=mobile',
    '/api/wrapped/status',
    '/api/expenses/duplicates',
    '/api/recap',
    '/api/recurring-expenses/suggestions?months=6',
    '/api/system/status',
  ]
}

/** Holds a bundle just sent, so the reads it covers wait on it instead of going out. */
export function holdAppOpen(slices: Promise<AppOpenSlices | null>): void {
  const bundle: Bundle = { generation: sessionGeneration(), budgetId: activeBudgetId(), landedAt: null, slices }
  bundle.slices = slices.finally(() => { bundle.landedAt = Date.now() })
  current = bundle
}

// Writes every launch makes that change nothing a bundled read returns. Any
// other write ends the bundle; one missing here only costs the bundle, never
// correctness.
const UNRELATED_WRITES = ['/api/notifications/register', '/api/habit-nudges/copy']

/** A write to `path` landed after the bundle was read, so nothing may be answered from it any more. */
export function forgetAppOpen(path: string): void {
  if (!UNRELATED_WRITES.includes(path.split('?')[0])) current = null
}

/** The bundled answer for `path`, or null to fetch it for real. */
export async function appOpenAnswer(path: string): Promise<Response | null> {
  const bundle = current
  if (!bundle || (bundle.landedAt !== null && Date.now() - bundle.landedAt > WINDOW_MS) || !sameScope(bundle)) return null
  const slices = await bundle.slices
  // A sign-out or a budget switch while it was in flight.
  if (!sameScope(bundle)) return null
  const slice = slices?.[path]
  if (slice?.status !== 200) return null
  return new Response(JSON.stringify(slice.body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function sameScope(bundle: Bundle): boolean {
  return bundle.generation === sessionGeneration() && bundle.budgetId === activeBudgetId()
}
