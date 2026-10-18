import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'
import type { ExpensesPage, RecentExpenses } from '@/src/api/expenses'
import type { ExpenseRow } from '@/src/types'

// Optimistic edits to the cached expense lists, so a write shows up (and the
// envelopes computed from these rows move) before the server answers. Each
// mutation snapshots first, rolls back on error and invalidates on settle, so
// the server's copy always wins in the end. Only the shapes below are touched:
// ['expenses'] (all history), its 'recent' window, Activity's 'page' and
// 'feed'. Anything else under the prefix (duplicates) is left to the refetch.

type Snapshot = [QueryKey, unknown][]
type Match = { id?: string; timestamp: string; item: string; amountInr: number }

const prefix = ['expenses'] as const

export function snapshotExpenses(qc: QueryClient): Snapshot {
  return qc.getQueriesData({ queryKey: prefix })
}

/**
 * Rolls back a failed write. With `written` (what the write left in each list),
 * a list changed since (a pending add landed meanwhile) is skipped rather than
 * reset, so the rollback can't erase that add; the write's settle refetch
 * fixes the list instead.
 */
export function restoreExpenses(qc: QueryClient, snapshot: Snapshot, written?: Snapshot): void {
  const ours = written && new Map(written.map(([key, data]) => [JSON.stringify(key), data]))
  for (const [key, data] of snapshot) {
    if (ours && qc.getQueryData(key) !== ours.get(JSON.stringify(key))) continue
    qc.setQueryData(key, data)
  }
}

function kind(key: QueryKey): 'all' | 'recent' | 'page' | 'feed' | null {
  if (key.length === 1) return 'all'
  return key[1] === 'recent' || key[1] === 'page' || key[1] === 'feed' ? key[1] : null
}

/**
 * Adds a just-logged row to the all-history list and every recent window it
 * falls in. Activity's pages and feed are sorted and filtered server-side, so
 * they wait for the refetch rather than guessing where the row lands.
 */
export function insertExpense(qc: QueryClient, row: ExpenseRow): void {
  for (const [key, data] of snapshotExpenses(qc)) {
    if (data === undefined) continue
    const k = kind(key)
    if (k === 'all') {
      qc.setQueryData<ExpenseRow[]>(key, [row, ...(data as ExpenseRow[])])
    } else if (k === 'recent' && row.date >= String(key[2])) {
      const recent = data as RecentExpenses
      const last = recent.lastSpent[row.category]
      qc.setQueryData<RecentExpenses>(key, {
        rows: [row, ...recent.rows],
        lastSpent: !last || row.date > last ? { ...recent.lastSpent, [row.category]: row.date } : recent.lastSpent,
      })
    }
  }
}

// No id (a legacy row): the same triple the server's delete matches on, so a
// second row logged in the same second stays put.
const matches = (m: Match) => (r: ExpenseRow) =>
  m.id ? r.id === m.id : r.timestamp === m.timestamp && r.item === m.item && Number(r.amount_inr) === m.amountInr

function dropFromPage(page: ExpensesPage, m: Match): ExpensesPage {
  const gone = page.rows.find(matches(m))
  if (!gone) return page
  return {
    ...page,
    rows: page.rows.filter((r) => r !== gone),
    total: page.total - 1,
    totalAmount: page.totalAmount - (Number(gone.amount_inr) || 0),
  }
}

/** Drops a row from every cached list, Activity's pages and feed included. Returns what it wrote, for restoreExpenses. */
export function removeExpense(qc: QueryClient, m: Match): Snapshot {
  const keep = (r: ExpenseRow) => !matches(m)(r)
  for (const [key, data] of snapshotExpenses(qc)) {
    if (data === undefined) continue
    switch (kind(key)) {
      case 'all':
        qc.setQueryData<ExpenseRow[]>(key, (data as ExpenseRow[]).filter(keep))
        break
      case 'recent':
        // lastSpent is left as is: an older row may still hold that date, and the refetch settles it.
        qc.setQueryData<RecentExpenses>(key, { ...(data as RecentExpenses), rows: (data as RecentExpenses).rows.filter(keep) })
        break
      case 'page':
        qc.setQueryData<ExpensesPage>(key, dropFromPage(data as ExpensesPage, m))
        break
      case 'feed': {
        const feed = data as InfiniteData<ExpensesPage>
        qc.setQueryData<InfiniteData<ExpensesPage>>(key, { ...feed, pages: feed.pages.map((p) => dropFromPage(p, m)) })
        break
      }
    }
  }
  return snapshotExpenses(qc)
}
