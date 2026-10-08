import { fireEvent } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { OfflineBanner } from './OfflineBanner'

let mockOnline = false
jest.mock('@/src/lib/netStatus', () => ({ useOnline: () => mockOnline }))

const refetch = jest.spyOn(QueryClient.prototype, 'refetchQueries').mockResolvedValue()

beforeEach(() => {
  jest.useFakeTimers()
  refetch.mockClear()
})
afterEach(() => jest.useRealTimers())

it('retries the visible screen on tap and every 15s while offline', () => {
  mockOnline = false
  const { getByLabelText } = renderWithProviders(<OfflineBanner />)
  fireEvent.press(getByLabelText("You're offline. Tap to retry."))
  expect(refetch).toHaveBeenCalledWith({ type: 'active' })
  refetch.mockClear()
  jest.advanceTimersByTime(15_000)
  expect(refetch).toHaveBeenCalledTimes(1)
})

it('stays out of the way while online', () => {
  mockOnline = true
  renderWithProviders(<OfflineBanner />)
  jest.advanceTimersByTime(30_000)
  expect(refetch).not.toHaveBeenCalled()
})
