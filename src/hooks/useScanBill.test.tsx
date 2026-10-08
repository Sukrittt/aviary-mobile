import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import { createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import { scanBill } from '@/src/api/scan'
import { track } from '@/src/lib/analytics'
import { AiAllowanceError } from '@/src/lib/aiAllowance'
import { useScanBill } from './useScanBill'

jest.mock('@/src/api/scan', () => ({ scanBill: jest.fn() }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

function wrapper({ children }: { children: ReactNode }) {
  const client = createTestQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => jest.clearAllMocks())

type ScanParams = Parameters<typeof scanBill>[0]
const params = {} as ScanParams

it('reports the start and the item count of a scan that came back', async () => {
  ;(scanBill as jest.Mock).mockResolvedValue({ items: [{}, {}, {}] })
  const { result } = renderHook(() => useScanBill(), { wrapper })
  await act(() => result.current.mutateAsync(params))
  expect((track as jest.Mock).mock.calls).toEqual([['bill_scan_started'], ['bill_scanned', { items_count: 3 }]])
})

it('tells a spent AI allowance apart from any other failure', async () => {
  ;(scanBill as jest.Mock).mockRejectedValueOnce(new AiAllowanceError('Used up.'))
  const { result } = renderHook(() => useScanBill(), { wrapper })
  await act(() => result.current.mutateAsync(params).catch(() => {}))
  expect(track).toHaveBeenLastCalledWith('bill_scan_failed', { reason: 'ai_allowance' })

  ;(scanBill as jest.Mock).mockRejectedValueOnce(new Error('network'))
  await act(() => result.current.mutateAsync(params).catch(() => {}))
  expect(track).toHaveBeenLastCalledWith('bill_scan_failed', { reason: 'error' })
})

it('leaves no cache timers running after unmount', async () => {
  jest.useFakeTimers()
  ;(scanBill as jest.Mock).mockResolvedValue({ items: [] })
  const { result, unmount } = renderHook(() => useScanBill(), { wrapper })
  try {
    await act(async () => {
      await result.current.mutateAsync(params)
      jest.advanceTimersByTime(0)
    })
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  } finally {
    unmount()
    jest.clearAllTimers()
    jest.useRealTimers()
  }
})
