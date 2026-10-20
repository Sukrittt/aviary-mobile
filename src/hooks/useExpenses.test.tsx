import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { deleteExpense, getExpenses, getExpensesPage, mintExpensePayload, postExpensePayload, updateExpense, type RecentExpenses } from '@/src/api/expenses'
import { flush } from '@/src/sync/flush'
import { HttpError } from '@/src/api/client'
import { enqueue } from '@/src/lib/pendingExpenses'
import { isOnline } from '@/src/lib/netStatus'
import { setActiveBudget } from '@/src/lib/activeBudget'
import { track, trackFirst } from '@/src/lib/analytics'
import { FEED_MAX_PAGES, SLOW_SAVE_MS, useExpensesFeed, useExpenses, useLastSpent, useAddExpense, useUpdateExpense, useDeleteExpense } from './useExpenses'

jest.mock('@/src/api/expenses', () => ({
  getExpenses: jest.fn(),
  getRecentExpenses: jest.fn(),
  getExpensesPage: jest.fn(),
  mintExpensePayload: jest.fn((row) => ({ ...row, client_id: 'client-1', date: '2026-01-01', timestamp: '2026-01-01T10:00:00+05:30' })),
  postExpensePayload: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
}))

jest.mock('@/src/api/client', () => ({
  HttpError: class HttpError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

jest.mock('@/src/lib/pendingExpenses', () => ({
  enqueue: jest.fn(),
  list: jest.fn(() => Promise.resolve([])),
}))

jest.mock('@/src/sync/flush', () => ({ flush: jest.fn(() => Promise.resolve()) }))

jest.mock('@/src/lib/analytics', () => ({ track: jest.fn(), trackFirst: jest.fn() }))
jest.mock('@/src/lib/netStatus', () => ({ isOnline: jest.fn(() => true) }))
jest.mock('@/src/api/accessMode', () => ({
  ...jest.requireActual('@/src/api/accessMode'),
  currentUserId: jest.fn(() => null),
}))

function wrapper(queryClient: QueryClient) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return QueryWrapper
}

it('useExpenses resolves the query with the API result', async () => {
  ;(getExpenses as jest.Mock).mockResolvedValue([{ item: 'Coffee' }])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  const { result } = renderHook(() => useExpenses(), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([{ item: 'Coffee' }])
})

it('useAddExpense invalidates both the expenses and ai-brief queries on success', async () => {
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'row-1', timestamp: '2026-01-01T10:00:00+05:30' })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ item: 'Coffee', amount_inr: '150', category: 'Food' })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['expenses'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['category-map'] })
})

it('useAddExpense leaves the refetch to a batch caller that defers it, and never sends the flag', async () => {
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'row-1', timestamp: '2026-01-01T10:00:00+05:30' })
  ;(mintExpensePayload as jest.Mock).mockClear()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ item: 'Coffee', amount_inr: '150', category: 'Food', deferRefresh: true })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(invalidateSpy).not.toHaveBeenCalled()
  expect(mintExpensePayload).toHaveBeenCalledWith({ item: 'Coffee', amount_inr: '150', category: 'Food' })
})

describe('useAddExpense offline (offline sync §5/§7)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(isOnline).mockReturnValue(true)
  })

  it('queues a known-unsent create while already offline without attempting a POST', async () => {
    const { currentUserId } = jest.requireMock('@/src/api/accessMode')
    currentUserId.mockReturnValueOnce('offline-user')
    jest.mocked(isOnline).mockReturnValueOnce(false)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(queryClient) })
    result.current.mutate({ item: 'Milk', amount_inr: '450', category: 'Food' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(postExpensePayload).not.toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ client_id: expect.any(String) }), 'offline-user', false, 'offline-user')
    expect(result.current.data?.pending).toBe(true)
  })

  it('resolves successfully and enqueues on a transport failure', async () => {
    ;(mintExpensePayload as jest.Mock).mockReturnValue({
      item: 'Coffee',
      amount_inr: '150',
      category: 'Food',
      date: '2026-01-01',
      timestamp: '2026-01-01T10:00:00+05:30',
      client_id: 'client-offline-1',
    })
    ;(postExpensePayload as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(queryClient) })

    result.current.mutate({ item: 'Coffee', amount_inr: '150', category: 'Food' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ clientId: 'client-offline-1', pending: true })
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'client-offline-1' }), null, true, undefined,
    )
  })

  it('a 4xx still rejects', async () => {
    ;(postExpensePayload as jest.Mock).mockRejectedValue(new HttpError(400, 'item, amount_inr, category required'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(queryClient) })

    result.current.mutate({ item: '', amount_inr: '150', category: 'Food' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(enqueue).not.toHaveBeenCalled()
  })
})

// An edit can flip payment_method or move month, which rebalances the
// Credit Card envelope server-side — the budgets cache must bust too or
// Envelopes shows a stale balance until its 30s staleTime lapses.
it('useUpdateExpense also invalidates the budgets query on success', async () => {
  ;(updateExpense as jest.Mock).mockResolvedValue(undefined)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useUpdateExpense(), { wrapper: wrapper(queryClient) })

  result.current.mutate({
    timestamp: '2026-01-01T10:00:00',
    item: 'Taxi',
    amountInr: 400,
    updates: { new_payment_method: 'credit_card' },
  })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['expenses'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['budgets'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['category-map'] })
})

describe('expense analytics', () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })

  it('logs an expense without its category, item or amount, and stamps first_expense_at', async () => {
    ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'row-1', timestamp: '2026-01-01T10:00:00+05:30' })
    const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(client()) })
    result.current.mutate({ item: 'Therapy', amount_inr: '2500', category: '🧠 Therapy', payment_method: 'bank', notes: ' ' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Named after its category: what a blank "What was it for?" saves as.
    expect(trackFirst).toHaveBeenCalledWith('expense_logged', 'first_expense_at', { payment_method: 'bank', has_notes: false, named: false })
  })

  it('flags an expense the user named', async () => {
    ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'row-2', timestamp: '2026-01-01T10:00:00+05:30' })
    const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(client()) })
    result.current.mutate({ item: 'Uber home', amount_inr: '300', category: '🚕 Transport', payment_method: 'bank', notes: '' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(trackFirst).toHaveBeenCalledWith('expense_logged', 'first_expense_at', expect.objectContaining({ named: true }))
  })

  it('names the edited fields and flags a category change', async () => {
    ;(updateExpense as jest.Mock).mockResolvedValue({})
    const { result } = renderHook(() => useUpdateExpense(), { wrapper: wrapper(client()) })
    result.current.mutate({ timestamp: 't', item: 'Coffee', amountInr: 150, updates: { new_amount_inr: '160', category: 'Food' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(track).toHaveBeenCalledWith('expense_edited', { fields: 'category,new_amount_inr', changed_category: true })
  })

  it('counts a delete', async () => {
    const { result } = renderHook(() => useDeleteExpense(), { wrapper: wrapper(client()) })
    result.current.mutate({ timestamp: 't', item: 'Coffee', amountInr: 150 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(track).toHaveBeenCalledWith('expense_deleted')
  })
})

it('useExpensesFeed refetches at most a window of pages after a write', async () => {
  ;(getExpensesPage as jest.Mock).mockImplementation(async ({ page }) => ({ rows: [{ id: `e${page}` }], page, pageCount: 20 }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const { result } = renderHook(() => useExpensesFeed({ limit: 12 }), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  let feed = result.current.data
  for (let i = 0; i < 7; i++) feed = (await act(() => result.current.fetchNextPage())).data
  expect(feed?.pages.map((p) => p.page)).toEqual([4, 5, 6, 7, 8])

  ;(getExpensesPage as jest.Mock).mockClear()
  await act(() => queryClient.invalidateQueries({ queryKey: ['expenses'] }))
  expect(getExpensesPage).toHaveBeenCalledTimes(FEED_MAX_PAGES)
})

describe('useAddExpense instant (stalled connection)', () => {
  const recentKey = ['expenses', 'recent', '2025-10-01']
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(isOnline).mockReturnValue(true)
    ;(mintExpensePayload as jest.Mock).mockReturnValue({
      item: 'Coffee', amount_inr: '150', category: 'Food', date: '2026-01-01',
      timestamp: '2026-01-01T10:00:00+05:30', client_id: 'client-slow-1',
    })
  })
  afterEach(() => jest.useRealTimers())

  it('stops waiting after SLOW_SAVE_MS: queues the create, shows it in the cache, reconciles once the POST lands', async () => {
    jest.useFakeTimers()
    const { currentUserId } = jest.requireMock('@/src/api/accessMode')
    currentUserId.mockReturnValue('user-1')
    let land!: (v: unknown) => void
    ;(postExpensePayload as jest.Mock).mockReturnValue(new Promise((r) => { land = r }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    queryClient.setQueryData<RecentExpenses>(recentKey, { rows: [], lastSpent: {} })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(queryClient) })

    act(() => { result.current.mutate({ item: 'Coffee', amount_inr: '150', category: 'Food', instant: true }) })
    // A switch while the POST stalls must not move the queued replay.
    await waitFor(() => expect(postExpensePayload).toHaveBeenCalled())
    setActiveBudget('sp_home')
    await act(async () => { jest.advanceTimersByTime(SLOW_SAVE_MS) })
    setActiveBudget(null)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toMatchObject({ clientId: 'client-slow-1', pending: true })
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'client-slow-1' }), 'user-1', true, 'user-1')
    // `instant` is a client option, never sent to the server.
    expect(mintExpensePayload).toHaveBeenCalledWith({ item: 'Coffee', amount_inr: '150', category: 'Food' })
    const rows = queryClient.getQueryData<RecentExpenses>(recentKey)!.rows
    expect(rows).toEqual([expect.objectContaining({ item: 'Coffee', amount_inr: '150', category: 'Food', date: '2026-01-01' })])
    // A refetch now would drop the row the server doesn't have yet.
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['expenses'] })
    expect(flush).not.toHaveBeenCalled()

    await act(async () => { land({ id: 'row-1', timestamp: '2026-01-01T10:00:00+05:30' }) })
    await waitFor(() => expect(flush).toHaveBeenCalled())
    currentUserId.mockReturnValue(null)
  })

  it('answers normally when the POST beats the deadline', async () => {
    const { currentUserId } = jest.requireMock('@/src/api/accessMode')
    currentUserId.mockReturnValueOnce('user-1')
    ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'row-1', timestamp: '2026-01-01T10:00:00+05:30' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(queryClient) })
    result.current.mutate({ item: 'Coffee', amount_inr: '150', category: 'Food', instant: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ id: 'row-1', pending: false })
    expect(enqueue).not.toHaveBeenCalled()
  })
})

describe('useDeleteExpense optimistic', () => {
  const recentKey = ['expenses', 'recent', '2025-10-01']
  const rowA = { id: 'a', timestamp: 't-a', date: '2026-01-01', item: 'Tea', amount_inr: '50', category: 'Food', notes: '', source: 'manual', amount: '', description: '', payment_method: 'bank' }

  function setup() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    queryClient.setQueryData<RecentExpenses>(recentKey, { rows: [rowA], lastSpent: {} })
    const { result } = renderHook(() => useDeleteExpense(), { wrapper: wrapper(queryClient) })
    return { queryClient, result }
  }

  it('drops the row before the server answers', async () => {
    let answer!: () => void
    ;(deleteExpense as jest.Mock).mockReturnValue(new Promise<void>((r) => { answer = r }))
    const { queryClient, result } = setup()
    act(() => { result.current.mutate({ id: 'a', timestamp: 't-a', item: 'Tea', amountInr: 50 }) })
    await waitFor(() => expect(queryClient.getQueryData<RecentExpenses>(recentKey)!.rows).toEqual([]))
    await act(async () => answer())
  })

  it('puts the row back when the delete fails', async () => {
    ;(deleteExpense as jest.Mock).mockRejectedValue(new Error('nope'))
    const { queryClient, result } = setup()
    act(() => { result.current.mutate({ id: 'a', timestamp: 't-a', item: 'Tea', amountInr: 50 }) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(queryClient.getQueryData<RecentExpenses>(recentKey)!.rows).toEqual([rowA])
  })
})

it('useExpenses keeps a still-queued save the refetched server copy lacks (#214)', async () => {
  const { list } = jest.requireMock('@/src/lib/pendingExpenses') as { list: jest.Mock }
  list.mockResolvedValueOnce([{ attempts: 0, submitted: true, payload: { item: 'Coffee', amount_inr: '50', category: 'Food', date: '2026-10-10', timestamp: '2026-10-10T10:00:00', client_id: 'c1' } }])
  ;(getExpenses as jest.Mock).mockResolvedValue([{ id: 'a', item: 'Lunch', timestamp: '2026-10-09T09:00:00', amount_inr: '200' }])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const { result } = renderHook(() => useExpenses(), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data!.map((r) => r.item)).toEqual(['Coffee', 'Lunch'])
})

it('useExpenses moves lastSpent for a queued row older than the recent window', async () => {
  const { list } = jest.requireMock('@/src/lib/pendingExpenses') as { list: jest.Mock }
  const { getRecentExpenses } = jest.requireMock('@/src/api/expenses') as { getRecentExpenses: jest.Mock }
  list.mockResolvedValueOnce([{ attempts: 0, payload: { item: 'Gift', amount_inr: '900', category: 'Gifts', date: '2020-01-05', timestamp: '2020-01-05T10:00:00', client_id: 'c2' } }])
  getRecentExpenses.mockResolvedValue({ rows: [], lastSpent: { Gifts: '2019-12-01' } })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const { result } = renderHook(() => useLastSpent(), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual({ Gifts: '2020-01-05' })
})

it('useExpenses leaves out a queued save from another budget', async () => {
  const { list } = jest.requireMock('@/src/lib/pendingExpenses') as { list: jest.Mock }
  const { currentUserId } = jest.requireMock('@/src/api/accessMode')
  currentUserId.mockReturnValue('user-1')
  list.mockResolvedValueOnce([
    { attempts: 0, spaceId: 'sp_home', payload: { item: 'Rent', amount_inr: '500', category: 'Home', date: '2026-10-10', timestamp: '2026-10-10T10:00:00', client_id: 'c1' } },
    { attempts: 0, payload: { item: 'Coffee', amount_inr: '50', category: 'Food', date: '2026-10-10', timestamp: '2026-10-10T11:00:00', client_id: 'c2' } },
  ])
  ;(getExpenses as jest.Mock).mockResolvedValue([])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const { result } = renderHook(() => useExpenses(), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data!.map((r) => r.item)).toEqual(['Coffee'])
  currentUserId.mockReturnValue(null)
})
