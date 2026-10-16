import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import { getWeekRecap } from '@/src/api/weekRecap'
import { currentUserId } from '@/src/api/accessMode'
import type { UserProfile } from '@/src/api/account'
import { recapMayShow, useWeekRecap, useWeekRecapGate } from './useWeekRecap'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (p: string) => mockPush(p) } }))
jest.mock('@/src/api/weekRecap', () => ({ getWeekRecap: jest.fn(), markWeekRecapSeen: jest.fn() }))
jest.mock('@/src/api/accessMode', () => ({ currentUserId: jest.fn() }))

const recap = { totalTransactions: 0 }

function renderGate() {
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useWeekRecapGate(), { wrapper })
}

beforeEach(() => jest.clearAllMocks())

it('opens the recap once per account, and again for another account', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: true, recap })
  ;(currentUserId as jest.Mock).mockReturnValue('user_a')

  const first = renderGate()
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/recap'))
  first.unmount()

  const second = renderGate()
  await waitFor(() => expect(getWeekRecap).toHaveBeenCalledTimes(2))
  expect(mockPush).toHaveBeenCalledTimes(1)
  second.unmount()

  ;(currentUserId as jest.Mock).mockReturnValue('user_b')
  renderGate()
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(2))
})

it('does nothing when the recap is not due', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: false })
  ;(currentUserId as jest.Mock).mockReturnValue('user_c')
  renderGate()
  await waitFor(() => expect(getWeekRecap).toHaveBeenCalled())
  expect(mockPush).not.toHaveBeenCalled()
})

describe('recapMayShow', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()
  const profile = (p: Partial<UserProfile>): UserProfile => ({ email: 'a@b.c', emailVerified: true, ...p })

  it('asks the server until the profile rules the recap out', () => {
    expect(recapMayShow(undefined, now)).toBe(true)
    expect(recapMayShow(profile({ onboardedAt: null }), now)).toBe(true)
    expect(recapMayShow(profile({ onboardedAt: daysAgo(10) }), now)).toBe(true)
    expect(recapMayShow(profile({ onboardedAt: daysAgo(15.5) }), now)).toBe(true)
  })

  it('stops once the recap was seen or its window has passed', () => {
    expect(recapMayShow(profile({ onboardedAt: daysAgo(3), weekRecapSeenAt: daysAgo(1) }), now)).toBe(false)
    expect(recapMayShow(profile({ onboardedAt: daysAgo(16) }), now)).toBe(false)
    expect(recapMayShow(profile({ onboardedAt: daysAgo(90) }), now)).toBe(false)
  })
})

it('answers locally, without a request, once the cached profile rules the recap out', async () => {
  ;(currentUserId as jest.Mock).mockReturnValue('user_d')
  const client = createTestQueryClient()
  client.setQueryData(['user'], { email: 'a@b.c', emailVerified: true, onboardedAt: '2026-01-01T00:00:00.000Z' })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useWeekRecap(), { wrapper })
  await waitFor(() => expect(result.current.data).toEqual({ due: false }))
  expect(getWeekRecap).not.toHaveBeenCalled()
})
