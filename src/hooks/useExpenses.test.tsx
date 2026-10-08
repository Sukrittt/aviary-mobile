import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import { getExpenses, mintExpensePayload, postExpensePayload, updateExpense } from '@/src/api/expenses'
import { HttpError } from '@/src/api/client'
import { enqueue } from '@/src/lib/pendingExpenses'
import { track, trackFirst } from '@/src/lib/analytics'
import { useExpenses, useAddExpense, useUpdateExpense, useDeleteExpense } from './useExpenses'

jest.mock('@/src/api/expenses', () => ({
  getExpenses: jest.fn(),
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
}))

jest.mock('@/src/lib/analytics', () => ({ track: jest.fn(), trackFirst: jest.fn() }))

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

describe('useAddExpense offline (offline sync §5/§7)', () => {
  beforeEach(() => jest.clearAllMocks())

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
      expect.objectContaining({ client_id: 'client-offline-1' }), null,
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
