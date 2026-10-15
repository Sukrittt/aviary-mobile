import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import InvestmentsScreen from './investments'
import type { HoldingEventRow, HoldingRow } from '@/src/types'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))
jest.mock('@/src/lib/netStatus', () => ({
  ...jest.requireActual('@/src/lib/netStatus'),
  useOnline: () => true,
}))
jest.mock('@/src/lib/haptics', () => ({ ...jest.requireActual('@/src/lib/haptics'), tap: jest.fn() }))

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

jest.mock('@/src/hooks/useHoldings', () => ({
  useHoldings: () => ({ data: [{ name: 'Gold', type: 'Gold', value: '150', updated_at: ago(10) } as unknown as HoldingRow], isLoading: false }),
  useDeleteHolding: () => ({ mutate: jest.fn(), error: null }),
}))
jest.mock('@/src/hooks/useHoldingEvents', () => ({
  useHoldingEvents: () => ({
    data: [
      { holding_name: 'Gold', previous_value: '0', new_value: '100', timestamp: ago(400) },
      { holding_name: 'Gold', previous_value: '100', new_value: '150', timestamp: ago(10) },
    ] as HoldingEventRow[],
    isLoading: false,
  }),
}))

it('shows the change over the picked range, and the touched day while scrubbing', () => {
  const screen = renderWithProviders(<InvestmentsScreen />)
  expect(screen.getByText(/\+.*50 \(50\.0%\) since/)).toBeTruthy()

  // All starts at the first event (₹100), so it's the same change.
  fireEvent.press(screen.getByText('All'))
  expect(screen.getByText(/\+.*50 \(50\.0%\) since/)).toBeTruthy()

  // Touch the left edge: back at the range's start, so no change yet.
  const plot = screen.getByTestId('line-plot')
  fireEvent(plot, 'layout', { nativeEvent: { layout: { width: 300 } } })
  fireEvent(plot, 'responderGrant', { nativeEvent: { locationX: 0 } })
  expect(screen.getByText(/\+.*0 \(0\.0%\) · .* to /)).toBeTruthy()

  fireEvent(plot, 'responderRelease')
  expect(screen.getByText(/since/)).toBeTruthy()
})
