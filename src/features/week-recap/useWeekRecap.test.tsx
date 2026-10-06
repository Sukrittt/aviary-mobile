import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import { getWeekRecap } from '@/src/api/weekRecap'
import { currentUserId } from '@/src/api/accessMode'
import { useWeekRecapGate } from './useWeekRecap'

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
