import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useRecurringIncomes } from './useIncomes'
import { forgetAppOpen } from '@/src/api/appOpen'

jest.mock('@/src/api/incomes', () => ({ getRecurringIncomes: jest.fn(async () => []) }))
jest.mock('@/src/api/appOpen', () => ({ forgetAppOpen: jest.fn() }))

it('loading schedules ends the app-open bundle before refetching budgets, since that load can post a pay', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = jest.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  renderHook(() => useRecurringIncomes(), { wrapper })
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['budgets'] }))
  expect((forgetAppOpen as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(invalidate.mock.invocationCallOrder[0])
})
