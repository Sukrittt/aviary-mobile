import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  deleteExpense,
  dismissDuplicate,
  getDuplicates,
  getExpenses,
  getExpensesPage,
  getRecentExpenses,
  mintExpensePayload,
  postExpensePayload,
  updateExpense,
  type ExpensesPageParams,
  type NewExpenseRow,
  type RecentExpenses,
} from '@/src/api/expenses'
import { currentMonthKey, shiftMonthKey } from '@/src/lib/envelope'
import { currentUserId, sessionGeneration, SessionChangedError } from '@/src/api/accessMode'
import { HttpError } from '@/src/api/client'
import { enqueue } from '@/src/lib/pendingExpenses'
import { budgetsKey } from '@/src/hooks/useBudgets'
import { track, trackFirst } from '@/src/lib/analytics'

const key = ['expenses'] as const
// Money Brain's brief is computed from expenses too, but keyed separately —
// an edit here must bust it or it shows stale numbers for up to its 15min staleTime.
const briefKey = ['ai-brief'] as const
// The autosuggest word->category map is built from expense item/category text —
// bust it too or it shows stale suggestions for up to its 60s staleTime.
const categoryMapKey = ['category-map'] as const

export function useExpenses() {
  return useQuery({ queryKey: key, queryFn: getExpenses, staleTime: 30_000 })
}

/**
 * This month and the 3 before it: covers every screen that isn't Insights
 * (envelopes and last month's, the ~90-day unusual-amount window, widget
 * trends, recent categories). Month-aligned so the key, and the cache entry
 * every caller shares, only changes once a month.
 */
function recentFrom(): string {
  return `${shiftMonthKey(currentMonthKey(), -3)}-01`
}

const selectRows = (d: RecentExpenses) => d.rows
const selectLastSpent = (d: RecentExpenses) => d.lastSpent

function recentQuery() {
  const from = recentFrom()
  return { queryKey: [...key, 'recent', from] as const, queryFn: () => getRecentExpenses(from), staleTime: 30_000 }
}

/** Recent rows only. Use instead of `useExpenses()` unless you need all history. */
export function useRecentExpenses() {
  return useQuery({ ...recentQuery(), select: selectRows })
}

/** All-time last spend date per category, from the same fetch as `useRecentExpenses`. */
export function useLastSpent() {
  return useQuery({ ...recentQuery(), select: selectLastSpent })
}

/**
 * Server-paginated read for the Activity tab. Key starts with `'expenses'`
 * so the add/update/delete mutations below already invalidate it via their
 * existing `queryKey: key` prefix match — nothing extra to wire up.
 */
export function useExpensesPage(params: ExpensesPageParams) {
  return useQuery({
    queryKey: [...key, 'page', params] as const,
    queryFn: () => getExpensesPage(params),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

/**
 * Warms the cache for the next page so the Activity screen's "Next" button
 * is instant — call this once the current page's data is in, passing
 * `{ ...params, page: page + 1 }`. Same key/queryFn as `useExpensesPage`
 * above, so it lands in the exact cache slot that hook will later read from.
 */
export function prefetchExpensesPage(qc: QueryClient, params: ExpensesPageParams) {
  return qc.prefetchQuery({
    queryKey: [...key, 'page', params] as const,
    queryFn: () => getExpensesPage(params),
    staleTime: 30_000,
  })
}

/** `category` is the server's, which can differ from the one posted if it was renamed. Absent offline. */
export type AddExpenseResult = { id?: string; timestamp?: string; version?: number; category?: string; clientId: string; pending: boolean }

export function useAddExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: NewExpenseRow): Promise<AddExpenseResult> => {
      const owner = currentUserId()
      const generation = sessionGeneration()
      const payload = mintExpensePayload(row)
      try {
        const result = await postExpensePayload(payload, generation)
        return { id: result.id, timestamp: result.timestamp, version: result.version, category: result.category, clientId: payload.client_id, pending: false }
      } catch (err) {
        // A real rejection (bad request, auth) must still fail loudly — only a
        // transport failure (offline) gets queued for later.
        if (err instanceof HttpError || err instanceof SessionChangedError || generation !== sessionGeneration()) throw err
        await enqueue(payload, owner)
        return { timestamp: payload.timestamp, clientId: payload.client_id, pending: true }
      }
    },
    onSuccess: (_data, row) => {
      // Both the manual screen and scan-bill's confirm land here, which is the
      // point: one event for "an expense got saved". $screen_name splits them
      // after the fact. No amount, no item name and no category name either:
      // categories are named by the user, and "Therapy" is as personal as an
      // item. `first_expense_at` stamps the activation moment on the person.
      trackFirst('expense_logged', 'first_expense_at', {
        payment_method: row.payment_method ?? 'unknown',
        has_notes: !!row.notes?.trim(),
      })
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
      // A credit-card expense add/edit/delete also rebalances the Credit
      // Card envelope server-side — bust budgets too or Envelopes shows a
      // stale balance for up to its 30s staleTime.
      qc.invalidateQueries({ queryKey: budgetsKey })
      qc.invalidateQueries({ queryKey: categoryMapKey })
    },
  })
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      id?: string
      version?: number
      timestamp: string
      item: string
      amountInr: number
      updates: Parameters<typeof updateExpense>[4]
    }) => updateExpense(params.id, params.timestamp, params.item, params.amountInr, params.updates, params.version),
    onSuccess: (_data, params) => {
      // Field names only. A category fix right after logging is the signal
      // that auto-categorising got it wrong.
      track('expense_edited', {
        fields: Object.keys(params.updates ?? {}).sort().join(','),
        changed_category: 'category' in (params.updates ?? {}),
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
      // See useAddExpense — this can also rebalance the CC envelope.
      qc.invalidateQueries({ queryKey: budgetsKey })
      qc.invalidateQueries({ queryKey: categoryMapKey })
    },
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { id?: string; version?: number; timestamp: string; item: string; amountInr: number }) =>
      deleteExpense(params.id, params.timestamp, params.item, params.amountInr, params.version),
    onSuccess: () => track('expense_deleted'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
      // See useAddExpense — this can also rebalance the CC envelope.
      qc.invalidateQueries({ queryKey: budgetsKey })
      qc.invalidateQueries({ queryKey: categoryMapKey })
    },
  })
}

/** Under the `'expenses'` prefix, so every add/edit/delete above refreshes it too. */
export function useDuplicates() {
  return useQuery({ queryKey: [...key, 'duplicates'] as const, queryFn: getDuplicates, staleTime: 30_000 })
}

export function useDismissDuplicate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dismissDuplicate,
    onSettled: () => qc.invalidateQueries({ queryKey: [...key, 'duplicates'] }),
  })
}
