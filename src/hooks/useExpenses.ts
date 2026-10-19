import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  deleteExpense,
  deleteExpensePhoto,
  dismissDuplicate,
  getDuplicates,
  getExpensePhotoUrl,
  getExpenses,
  getExpensesPage,
  getRecentExpenses,
  mintExpensePayload,
  postExpensePayload,
  updateExpense,
  uploadExpensePhoto,
  type ExpensesPageParams,
  type PhotoMimeType,
  type NewExpenseRow,
  type RecentExpenses,
} from '@/src/api/expenses'
import { currentMonthKey, shiftMonthKey } from '@/src/lib/envelope'
import { currentUserId, sessionGeneration, SessionChangedError } from '@/src/api/accessMode'
import { HttpError } from '@/src/api/client'
import { enqueue, list as listQueued } from '@/src/lib/pendingExpenses'
import { budgetsKey } from '@/src/hooks/useBudgets'
import { track, trackFirst } from '@/src/lib/analytics'
import { invalidateExpenseCreateQueries } from '@/src/lib/expenseQueries'
import { splitEmoji } from '@/src/lib/emoji'
import { isOnline } from '@/src/lib/netStatus'
import { undoPendingExpense } from '@/src/sync/undoExpense'
import { flush } from '@/src/sync/flush'
import { insertExpense, queuedRow, removeExpense, restoreExpenses, snapshotExpenses, withLastSpent, withQueued } from '@/src/lib/optimisticExpenses'

const key = ['expenses'] as const
// Ask Aviary's brief is computed from expenses too, but keyed separately —
// an edit here must bust it or it shows stale numbers for up to its 15min staleTime.
const briefKey = ['ai-brief'] as const
// The autosuggest word->category map is built from expense item/category text —
// bust it too or it shows stale suggestions for up to its 60s staleTime.
const categoryMapKey = ['category-map'] as const

// Creates still in the offline queue. Merged into the fetches below so a
// refetch (any write's settle, or staleness) can't drop a pending save.
const queuedPayloads = () => listQueued().then((entries) => entries.map((e) => e.payload), () => [])

async function getExpensesWithQueued() {
  const [rows, queued] = await Promise.all([getExpenses(), queuedPayloads()])
  return withQueued(rows, queued)
}

export function useExpenses() {
  return useQuery({ queryKey: key, queryFn: getExpensesWithQueued, staleTime: 30_000 })
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
  return {
    queryKey: [...key, 'recent', from] as const,
    queryFn: async (): Promise<RecentExpenses> => {
      const [recent, queued] = await Promise.all([getRecentExpenses(from), queuedPayloads()])
      const rows = withQueued(recent.rows, queued, from)
      return { rows, lastSpent: withLastSpent(recent.lastSpent, rows.slice(0, rows.length - recent.rows.length)) }
    },
    staleTime: 30_000,
  }
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
 * Activity's photo feed: the same paged read with `photo_url`s, loaded page
 * after page as you scroll. Under `'expenses'` too, so writes refresh it.
 */
export const FEED_MAX_PAGES = 5

export function useExpensesFeed(params: Omit<ExpensesPageParams, 'page' | 'photos'>) {
  return useInfiniteQuery({
    queryKey: [...key, 'feed', params] as const,
    queryFn: ({ pageParam }) => getExpensesPage({ ...params, page: pageParam, photos: true }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pageCount ? last.page + 1 : undefined),
    // A write invalidates ['expenses'], which refetches every loaded page (and re-signs
    // each photo). Keep a window of pages; scrolling back up refetches the dropped ones.
    getPreviousPageParam: (first) => (first.page > 1 ? first.page - 1 : undefined),
    maxPages: FEED_MAX_PAGES,
    staleTime: 30_000,
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

/**
 * `instant`: don't hold the caller past SLOW_SAVE_MS. A POST still in flight by
 * then is queued as well (submitted, so the replay is a client_id dedupe) and
 * the caller gets a pending result. Only for callers that need no server id
 * straight away: scan-bill links its bill to `id`, the money brain collects them.
 */
export type AddExpenseVars = NewExpenseRow & { instant?: boolean }

// A stalled connection held the log screen for the full 15s request timeout
// (PostHog, 2026-10-18: a 10.7s save). Past this, the save finishes in the background.
export const SLOW_SAVE_MS = 2500
const SLOW = Symbol('slow')

export function useAddExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ instant, ...row }: AddExpenseVars): Promise<AddExpenseResult> => {
      const owner = currentUserId()
      const generation = sessionGeneration()
      const payload = mintExpensePayload(row)
      // A create deliberately not sent yet can be cancelled entirely offline.
      if (owner && !isOnline()) {
        await enqueue(payload, owner)
        if (generation !== sessionGeneration()) throw new SessionChangedError()
        return { timestamp: payload.timestamp, clientId: payload.client_id, pending: true }
      }
      try {
        const post = postExpensePayload(payload, generation)
        let timer: ReturnType<typeof setTimeout> | undefined
        const result = instant && owner
          ? await Promise.race([post, new Promise<typeof SLOW>((r) => { timer = setTimeout(() => r(SLOW), SLOW_SAVE_MS) })]).finally(() => clearTimeout(timer))
          : await post
        if (result === SLOW) {
          // Queued before the caller moves on, so the save survives a killed app.
          // Whichever lands first, this POST or the replay, the server keeps one row.
          await enqueue(payload, owner, true)
          if (generation !== sessionGeneration()) throw new SessionChangedError()
          void post.catch(() => {}).finally(() => void flush())
          return { timestamp: payload.timestamp, clientId: payload.client_id, pending: true }
        }
        if (generation !== sessionGeneration()) throw new SessionChangedError()
        return { id: result.id, timestamp: result.timestamp, version: result.version, category: result.category, clientId: payload.client_id, pending: false }
      } catch (err) {
        // A real rejection (bad request, auth) must still fail loudly — only a
        // transport failure (offline) gets queued for later.
        if (err instanceof HttpError || err instanceof SessionChangedError || generation !== sessionGeneration()) throw err
        await enqueue(payload, owner, true)
        if (generation !== sessionGeneration()) throw new SessionChangedError()
        return { timestamp: payload.timestamp, clientId: payload.client_id, pending: true }
      }
    },
    onSuccess: (res, row) => {
      // Both the manual screen and scan-bill's confirm land here, which is the
      // point: one event for "an expense got saved". $screen_name splits them
      // after the fact. No amount, no item name and no category name either:
      // categories are named by the user, and "Therapy" is as personal as an
      // item. `first_expense_at` stamps the activation moment on the person.
      trackFirst('expense_logged', 'first_expense_at', {
        payment_method: row.payment_method ?? 'unknown',
        has_notes: !!row.notes?.trim(),
        // A blank name saves under the category's (see log-expense), so this
        // says how often people skip naming. A yes/no only, never the text.
        named: row.item.trim() !== splitEmoji(row.category).text,
      })
      if (!res.pending || !res.timestamp) {
        void invalidateExpenseCreateQueries(qc)
        return
      }
      // Not on the server yet, so don't refetch for it. Show it in the cached
      // lists instead (envelopes count it straight away); later fetches merge
      // it from the queue until the drain's synced event refetches for real.
      insertExpense(qc, queuedRow({ ...row, date: res.timestamp.slice(0, 10), timestamp: res.timestamp, client_id: res.clientId }))
    },
  })
}

export function useUndoPendingExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { clientId: string; owner: string | null; generation: number }) =>
      undoPendingExpense(params.clientId, params.owner, params.generation),
    onSuccess: (_data, params) => {
      if (params.generation === sessionGeneration()) track('expense_deleted')
    },
    onSettled: (_data, _error, params) => {
      if (params.generation !== sessionGeneration()) return
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
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
    // Gone from every list (and its envelope) on tap; a failed delete puts it back.
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey: key })
      const snapshot = snapshotExpenses(qc)
      const written = removeExpense(qc, params)
      return { snapshot, written }
    },
    onError: (_err, _params, context) => {
      if (context) restoreExpenses(qc, context.snapshot, context.written)
    },
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

const photoKey = (id: string) => ['expense-photo', id] as const

/** Signed URL for an expense's photo. The URL is short-lived, so it's refetched rather than kept. */
export function useExpensePhotoUrl(id: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: photoKey(id ?? ''), queryFn: () => getExpensePhotoUrl(id!), enabled: enabled && !!id, staleTime: 60_000, gcTime: 0 })
}

/** Attaches (`photo` set) or removes (`photo: null`) an expense's photo. */
export function useSaveExpensePhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, photo }: { id: string; photo: { base64: string; mimeType: PhotoMimeType } | null }) =>
      photo ? uploadExpensePhoto(id, photo.base64, photo.mimeType).then(() => undefined) : deleteExpensePhoto(id),
    onSettled: (_data, _error, { id }) => {
      // Rows carry `has_photo`; the version doesn't change, so nothing else does.
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: photoKey(id) })
    },
  })
}
