import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import { completeGuidedTour, getUser, updateUser, restoreAccount, type UserProfile } from '@/src/api/account'
import { useCompleteGuidedTour, useUser, useUpdateUser, useRestoreAccount, userKey } from './useUser'

jest.mock('@/src/api/account', () => ({
  getUser: jest.fn(),
  updateUser: jest.fn(),
  restoreAccount: jest.fn(),
  completeGuidedTour: jest.fn(),
  getSessions: jest.fn(),
  getIdentityProviders: jest.fn(),
}))

function wrapper(queryClient: QueryClient) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return QueryWrapper
}

it('useUser resolves the profile from the API', async () => {
  ;(getUser as jest.Mock).mockResolvedValue({ email: 'a@b.com', emailVerified: true })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  const { result } = renderHook(() => useUser(), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.email).toBe('a@b.com')
})

it('useUpdateUser writes the server response into the cache on success, without a refetch', async () => {
  ;(updateUser as jest.Mock).mockResolvedValue({ email: 'a@b.com', emailVerified: true, name: 'Sukrit' })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useUpdateUser(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ name: 'Sukrit' })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(queryClient.getQueryData(userKey)).toEqual({ email: 'a@b.com', emailVerified: true, name: 'Sukrit' })
  expect(invalidateSpy).not.toHaveBeenCalled()
})

it('useCompleteGuidedTour writes the server-owned completion timestamp into the profile cache', async () => {
  const profile = { email: 'a@b.com', emailVerified: true, guidedTourCompletedAt: '2026-10-01T00:00:00.000Z' }
  ;(completeGuidedTour as jest.Mock).mockResolvedValue(profile)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  const { result } = renderHook(() => useCompleteGuidedTour(), { wrapper: wrapper(queryClient) })

  result.current.mutate()

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(queryClient.getQueryData(userKey)).toEqual(profile)
})

it('applies the patch optimistically before the API call resolves', async () => {
  // Held pending so the assertion below observes the optimistic write, not
  // the post-settle state — resolved at the end so nothing leaks a pending handle.
  let resolveUpdate: () => void = () => {}
  ;(updateUser as jest.Mock).mockImplementation(
    () => new Promise<UserProfile>((resolve) => { resolveUpdate = () => resolve({ email: 'a@b.com', emailVerified: true, notifyCadence: 'daily' }) }),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  queryClient.setQueryData(userKey, { email: 'a@b.com', emailVerified: true, notifyCadence: 'off' })
  const { result } = renderHook(() => useUpdateUser(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ notifyCadence: 'daily' })

  await waitFor(() => {
    const data = queryClient.getQueryData<UserProfile>(userKey)
    expect(data?.notifyCadence).toBe('daily')
  })

  resolveUpdate()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
})

it('rolls back the optimistic patch when the API call errors', async () => {
  ;(updateUser as jest.Mock).mockRejectedValue(new Error('network error'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  queryClient.setQueryData(userKey, { email: 'a@b.com', emailVerified: true, notifyCadence: 'off' })
  const { result } = renderHook(() => useUpdateUser(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ notifyCadence: 'daily' })

  await waitFor(() => expect(result.current.isError).toBe(true))
  const data = queryClient.getQueryData<UserProfile>(userKey)
  expect(data?.notifyCadence).toBe('off')
})

it('useRestoreAccount invalidates every query on success', async () => {
  ;(restoreAccount as jest.Mock).mockResolvedValue(undefined)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useRestoreAccount(), { wrapper: wrapper(queryClient) })

  result.current.mutate()

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(invalidateSpy).toHaveBeenCalled()
})

it('rolls back a failed currency change without changing any amounts', async () => {
  ;(updateUser as jest.Mock).mockRejectedValueOnce(new Error('currency save failed'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  queryClient.setQueryData(userKey, { email: 'a@b.com', currencyCode: 'INR' })
  queryClient.setQueryData(['expenses'], [{ amount_inr: '500' }])
  const { result, unmount } = renderHook(() => useUpdateUser(), { wrapper: wrapper(queryClient) })
  result.current.mutate({ currencyCode: 'USD' })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(queryClient.getQueryData<UserProfile>(userKey)?.currencyCode).toBe('INR')
  expect(queryClient.getQueryData(['expenses'])).toEqual([{ amount_inr: '500' }])
  unmount()
  queryClient.clear()
})
