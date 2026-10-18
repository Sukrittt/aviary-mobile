import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import type { ExpensesPage, RecentExpenses } from '@/src/api/expenses'
import type { ExpenseRow } from '@/src/types'
import { insertExpense, removeExpense, restoreExpenses, snapshotExpenses } from './optimisticExpenses'

const row = (over: Partial<ExpenseRow>): ExpenseRow => ({
  timestamp: '2026-10-10T10:00:00', date: '2026-10-10', item: 'Coffee', amount_inr: '100', category: 'Food',
  notes: '', source: 'manual', amount: '', description: '', payment_method: 'bank', ...over,
})

const recentKey = ['expenses', 'recent', '2026-07-01']

function seeded() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  const a = row({ id: 'a', timestamp: '2026-10-09T09:00:00', date: '2026-10-09' })
  const b = row({ id: 'b', timestamp: '2026-10-08T09:00:00', date: '2026-10-08', category: 'Travel', amount_inr: '500' })
  qc.setQueryData<RecentExpenses>(recentKey, { rows: [a, b], lastSpent: { Food: '2026-10-09', Travel: '2026-10-08' } })
  qc.setQueryData<ExpenseRow[]>(['expenses'], [a, b])
  const page: ExpensesPage = { rows: [a, b], total: 2, page: 1, pageCount: 1, totalAmount: 600 }
  qc.setQueryData(['expenses', 'page', { page: 1, limit: 20 }], page)
  qc.setQueryData<InfiniteData<ExpensesPage>>(['expenses', 'feed', { limit: 20 }], { pages: [page], pageParams: [1] })
  return qc
}

describe('insertExpense', () => {
  it('adds the row to recent and full lists so envelope totals count it at once', () => {
    const qc = seeded()
    insertExpense(qc, row({ timestamp: '2026-10-10T10:00:00', amount_inr: '250' }))
    const recent = qc.getQueryData<RecentExpenses>(recentKey)!
    expect(recent.rows.map((r) => r.amount_inr)).toEqual(['250', '100', '500'])
    expect(recent.lastSpent.Food).toBe('2026-10-10')
    expect(qc.getQueryData<ExpenseRow[]>(['expenses'])).toHaveLength(3)
  })

  it('keeps a later lastSpent date and skips a recent window the row predates', () => {
    const qc = seeded()
    insertExpense(qc, row({ timestamp: '2026-06-01T10:00:00', date: '2026-06-01' }))
    const recent = qc.getQueryData<RecentExpenses>(recentKey)!
    expect(recent.rows).toHaveLength(2)
    expect(recent.lastSpent.Food).toBe('2026-10-09')
    // The all-history list has no window.
    expect(qc.getQueryData<ExpenseRow[]>(['expenses'])).toHaveLength(3)
  })

  it('leaves uncached lists alone', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    insertExpense(qc, row({}))
    expect(qc.getQueryData(['expenses'])).toBeUndefined()
  })
})

describe('removeExpense', () => {
  it('drops the row by id from every expenses list, page and feed included', () => {
    const qc = seeded()
    removeExpense(qc, { id: 'b', timestamp: '2026-10-08T09:00:00', item: 'Coffee', amountInr: 500 })
    expect(qc.getQueryData<RecentExpenses>(recentKey)!.rows.map((r) => r.id)).toEqual(['a'])
    expect(qc.getQueryData<ExpenseRow[]>(['expenses'])!.map((r) => r.id)).toEqual(['a'])
    const page = qc.getQueryData<ExpensesPage>(['expenses', 'page', { page: 1, limit: 20 }])!
    expect(page.rows.map((r) => r.id)).toEqual(['a'])
    expect(page.total).toBe(1)
    expect(page.totalAmount).toBe(100)
    const feed = qc.getQueryData<InfiniteData<ExpensesPage>>(['expenses', 'feed', { limit: 20 }])!
    expect(feed.pages[0].rows.map((r) => r.id)).toEqual(['a'])
  })

  it('matches by timestamp when the row has no id yet', () => {
    const qc = seeded()
    removeExpense(qc, { timestamp: '2026-10-09T09:00:00', item: 'Coffee', amountInr: 100 })
    expect(qc.getQueryData<ExpenseRow[]>(['expenses'])!.map((r) => r.id)).toEqual(['b'])
  })

  it('keeps a different id-less row logged in the same second', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    const ts = '2026-10-09T09:00:00'
    qc.setQueryData<ExpenseRow[]>(['expenses'], [row({ timestamp: ts, item: 'Coffee' }), row({ timestamp: ts, item: 'Bagel', amount_inr: '80' })])
    removeExpense(qc, { timestamp: ts, item: 'Coffee', amountInr: 100 })
    expect(qc.getQueryData<ExpenseRow[]>(['expenses'])!.map((r) => r.item)).toEqual(['Bagel'])
  })

  it('leaves duplicates (a different shape under the same prefix) untouched', () => {
    const qc = seeded()
    const dupes = [[{ id: 'b' }]]
    qc.setQueryData(['expenses', 'duplicates'], dupes)
    removeExpense(qc, { id: 'b', timestamp: '2026-10-08T09:00:00', item: 'Coffee', amountInr: 500 })
    expect(qc.getQueryData(['expenses', 'duplicates'])).toBe(dupes)
  })
})

it('restoreExpenses puts back what snapshotExpenses saw', () => {
  const qc = seeded()
  const snap = snapshotExpenses(qc)
  const written = removeExpense(qc, { id: 'a', timestamp: '2026-10-09T09:00:00', item: 'Coffee', amountInr: 100 })
  restoreExpenses(qc, snap, written)
  expect(qc.getQueryData<ExpenseRow[]>(['expenses'])!.map((r) => r.id)).toEqual(['a', 'b'])
  expect(qc.getQueryData<RecentExpenses>(recentKey)!.rows.map((r) => r.id)).toEqual(['a', 'b'])
})

it('restoreExpenses leaves a list changed since (a pending add) for the refetch instead of erasing it', () => {
  const qc = seeded()
  const snap = snapshotExpenses(qc)
  const written = removeExpense(qc, { id: 'a', timestamp: '2026-10-09T09:00:00', item: 'Coffee', amountInr: 100 })
  insertExpense(qc, row({ id: 'z' }))
  restoreExpenses(qc, snap, written)
  expect(qc.getQueryData<ExpenseRow[]>(['expenses'])!.map((r) => r.id)).toEqual(['z', 'b'])
  // Lists the add didn't touch still roll back.
  expect(qc.getQueryData<ExpensesPage>(['expenses', 'page', { page: 1, limit: 20 }])!.rows.map((r) => r.id)).toEqual(['a', 'b'])
})
