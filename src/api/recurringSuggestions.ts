import { apiFetch, apiErrorMessage } from './client'
import type { RecurringScan, ScanMonths } from '@/src/types/recurringSuggestions'

const URL = '/api/recurring-expenses/suggestions'

export class RecurringSuggestionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

// Busy (409), too many expenses (422) and too many scans (429) are written for
// people server-side. Anything else (5xx, timeout, offline) gets `fallback`.
const READABLE_STATUSES = [409, 422, 429]

export function recurringSuggestionErrorMessage(err: unknown, fallback: string): string {
  return err instanceof RecurringSuggestionError && READABLE_STATUSES.includes(err.status) ? err.message : fallback
}

async function fail(resp: Response, fallback: string): Promise<never> {
  throw new RecurringSuggestionError(resp.status, await apiErrorMessage(resp, fallback))
}

export async function loadRecurringSuggestions(months: ScanMonths = 6): Promise<RecurringScan> {
  const resp = await apiFetch(`${URL}?months=${months}`)
  if (!resp.ok) await fail(resp, 'Could not load suggestions')
  return resp.json()
}

// A scan runs a batch of Jev calls server-side, well past apiFetch's default
// 15s timeout — same 65s ceiling Web gives it.
export async function scanRecurringSuggestions(months: ScanMonths = 6): Promise<RecurringScan> {
  const resp = await apiFetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ months }),
    signal: AbortSignal.timeout(65_000),
  })
  if (!resp.ok) await fail(resp, 'Could not scan expenses')
  return resp.json()
}

export async function dismissRecurringSuggestion(id: string): Promise<void> {
  const resp = await apiFetch(URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!resp.ok) await fail(resp, 'Could not dismiss suggestion')
}
