import type { ExpenseRow, IncomeRow } from '@/src/types'

export type FeedItem =
  | { kind: 'day'; date: string }
  | { kind: 'card'; txn: ExpenseRow }
  | { kind: 'income'; income: IncomeRow }

/**
 * Rows arrive newest first; a day label goes ahead of each day's first card.
 * Income is slotted in by date, ahead of that day's spends, like the list.
 */
export function groupByDay(rows: readonly ExpenseRow[], incomes: readonly IncomeRow[] = []): FeedItem[] {
  const pending = [...incomes].sort((a, b) => b.date.localeCompare(a.date))
  const out: FeedItem[] = []
  let day = ''
  const push = (date: string, item: FeedItem) => {
    if (date !== day) {
      day = date
      out.push({ kind: 'day', date })
    }
    out.push(item)
  }
  for (const txn of rows) {
    while (pending.length > 0 && pending[0].date >= txn.date) {
      const income = pending.shift()!
      push(income.date, { kind: 'income', income })
    }
    push(txn.date, { kind: 'card', txn })
  }
  for (const income of pending) push(income.date, { kind: 'income', income })
  return out
}

/**
 * The income that belongs in the feed's loaded window. The feed loads pages
 * newest first and drops old ones, so income outside the loaded dates waits
 * until scrolling brings its page in.
 */
export function incomesInWindow(
  incomes: readonly IncomeRow[],
  rows: readonly ExpenseRow[],
  { hasNewer, hasOlder }: { hasNewer: boolean; hasOlder: boolean },
): IncomeRow[] {
  if (rows.length === 0) return hasNewer || hasOlder ? [] : [...incomes]
  const newest = rows[0].date
  const oldest = rows[rows.length - 1].date
  return incomes.filter((i) => (!hasOlder || i.date >= oldest) && (!hasNewer || i.date < newest))
}

// Every feed refetch re-signs every photo, and a new URL is a cache miss, so
// each image would reload on any write. Keep the first URL seen for a blob
// until it could expire. The server signs for an hour but keeps handing out a
// URL while 30 minutes remain, so a URL seen now may only have 30 minutes left.
// Keyed by the path, which changes when a photo is replaced.
const REUSE_MS = 25 * 60 * 1000
// Far more photos than one session scrolls past; past it, the oldest go.
const MAX_SEEN = 500
const seen = new Map<string, { url: string; at: number }>()

export function stablePhotoUrl(url: string, now: number = Date.now()): string {
  const path = url.split('?')[0]
  const hit = seen.get(path)
  if (hit && now - hit.at < REUSE_MS) return hit.url
  seen.delete(path)
  seen.set(path, { url, at: now })
  if (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value!)
  return url
}
