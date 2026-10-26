import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { getCategories, updateCategory } from '@/src/api/categories'
import { useWeeklyCategories } from './useWeeklyCategories'

jest.mock('@/src/api/categories', () => ({ getCategories: jest.fn(), updateCategory: jest.fn() }))
jest.mock('@/src/lib/categoryCache', () => ({ readCategoryCache: jest.fn(), writeCategoryCache: jest.fn() }))
jest.mock('@/src/hooks/useBudgetSpaces', () => ({ useBudgetSpaces: () => ({ active: { readOnly: false } }) }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/src/theme/ThemeProvider', () => ({ useTheme: () => ({ tokens: jest.requireActual('@/src/theme/tokens').lightTokens }) }))

const rows = [{ name: 'Groceries', group: '', weeklySince: '2026-10-01' }, { name: 'Rent', group: '' }]

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return renderHook(() => useWeeklyCategories(), { wrapper })
}

beforeEach(() => {
  ;(getCategories as jest.Mock).mockResolvedValue(rows)
  ;(updateCategory as jest.Mock).mockReset()
})

it('reads the switch from the category, not the device', async () => {
  const { result } = setup()
  await waitFor(() => expect(result.current.weekly?.get('Groceries')).toBe('2026-10-01'))
  expect(result.current.weekly?.has('Rent')).toBe(false)
})

it('saves the day it was switched on, and null to switch it off', async () => {
  ;(updateCategory as jest.Mock).mockResolvedValue(undefined)
  const { result } = setup()
  await waitFor(() => expect(result.current.weekly?.size).toBe(1))
  act(() => result.current.setWeekly('Rent', true))
  await waitFor(() => expect(updateCategory).toHaveBeenCalledWith('Rent', { weeklySince: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }))
  act(() => result.current.setWeekly('Groceries', false))
  await waitFor(() => expect(updateCategory).toHaveBeenLastCalledWith('Groceries', { weeklySince: null }))
})

it('flips at once, and flips back if the save fails', async () => {
  let reject!: (e: Error) => void
  ;(updateCategory as jest.Mock).mockReturnValue(new Promise((_, r) => (reject = r)))
  const { result } = setup()
  await waitFor(() => expect(result.current.weekly?.size).toBe(1))
  act(() => result.current.setWeekly('Rent', true))
  await waitFor(() => expect(result.current.weekly?.has('Rent')).toBe(true))
  await act(async () => reject(new Error('503')))
  await waitFor(() => expect(result.current.weekly?.has('Rent')).toBe(false))
})

it('saves quick taps one after another, in tap order', async () => {
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Rent', group: '' }])
  const calls: string[] = []
  let releaseFirst!: () => void
  ;(updateCategory as jest.Mock)
    .mockImplementationOnce(() => { calls.push('on:start'); return new Promise<void>((r) => (releaseFirst = () => { calls.push('on:end'); r() })) })
    .mockImplementationOnce(async () => { calls.push('off') })
  const { result } = setup()
  await waitFor(() => expect(result.current.weekly).toBeDefined())
  act(() => result.current.setWeekly('Rent', true))
  act(() => result.current.setWeekly('Rent', false))
  await waitFor(() => expect(calls).toEqual(['on:start']))
  await act(async () => releaseFirst())
  await waitFor(() => expect(calls).toEqual(['on:start', 'on:end', 'off']))
})
