import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import {
  addSubscription,
  cancelSubscription,
  deleteSubscription,
  getSubscriptions,
  reactivateSubscription,
  updateSubscription,
} from '@/src/api/subscriptions'
import {
  useAddSubscription,
  useCancelSubscription,
  useDeleteSubscription,
  useReactivateSubscription,
  useSubscriptions,
  useUpdateSubscription,
} from './useSubscriptions'

jest.mock('@/src/api/subscriptions', () => ({
  getSubscriptions: jest.fn(),
  addSubscription: jest.fn(),
  updateSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  reactivateSubscription: jest.fn(),
  deleteSubscription: jest.fn(),
}))

function wrapper(queryClient: QueryClient) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return QueryWrapper
}

it('useSubscriptions resolves the query with the API result', async () => {
  ;(getSubscriptions as jest.Mock).mockResolvedValue([{ service: 'Netflix' }])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  const { result } = renderHook(() => useSubscriptions(), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([{ service: 'Netflix' }])
})

// Subscriptions feed Ask Aviary's brief (Web/lib/ai/expenseContext.ts) — every
// mutation must bust ['ai-brief'] alongside ['subscriptions'] or the brief shows
// stale numbers for up to its 15min staleTime.
describe('every mutation invalidates both subscriptions and ai-brief', () => {
  it('useAddSubscription', async () => {
    ;(addSubscription as jest.Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useAddSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate({ service: 'Netflix', amount_inr: '649' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })

  it('useUpdateSubscription', async () => {
    ;(updateSubscription as jest.Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate({ service: 'Netflix', updates: { amount_inr: '699' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })

  it('useCancelSubscription', async () => {
    ;(cancelSubscription as jest.Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCancelSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate('Netflix')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })

  it('useReactivateSubscription', async () => {
    ;(reactivateSubscription as jest.Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useReactivateSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate('Netflix')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })

  it('useDeleteSubscription', async () => {
    ;(deleteSubscription as jest.Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate('Netflix')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })
})
