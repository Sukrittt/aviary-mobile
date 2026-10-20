import { fireEvent, waitFor } from '@testing-library/react-native'
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

const mockRestore = jest.fn()
jest.mock('@/src/api/account', () => ({
  getArchive: async () => [
    { id: 'old', collection: 'holdings', label: 'Gold', deletedAt: '2026-01-01T00:00:00Z' },
    { id: 'new', collection: 'holdings', label: 'Gold', deletedAt: '2026-06-01T00:00:00Z' },
  ],
  restoreArchivedItem: (...args: unknown[]) => mockRestore(...args),
}))
jest.mock('@/src/components/activity/DeletingRow', () => ({
  DeletingRow: ({ children, active, onDone }: { children: React.ReactNode; active: boolean; onDone: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => { if (active) onDone() }, [active])
    return children
  },
}))

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

jest.mock('@/src/hooks/useHoldings', () => ({
  useHoldings: () => ({ data: [{ name: 'Gold', type: 'Gold', value: '150', updated_at: ago(10) } as unknown as HoldingRow], isLoading: false }),
  useDeleteHolding: () => ({ mutate: (_name: string, o: { onSuccess: () => void }) => o.onSuccess(), error: null }),
}))
const TWO_EVENTS = [
  { holding_name: 'Gold', previous_value: '0', new_value: '100', timestamp: ago(400) },
  { holding_name: 'Gold', previous_value: '100', new_value: '150', timestamp: ago(10) },
] as HoldingEventRow[]
let mockEvents = TWO_EVENTS
beforeEach(() => { mockEvents = TWO_EVENTS })
jest.mock('@/src/hooks/useHoldingEvents', () => ({
  useHoldingEvents: () => ({ data: mockEvents, isLoading: false }),
}))

it('shows the change over the picked range', () => {
  const screen = renderWithProviders(<InvestmentsScreen />)
  expect(screen.getByText(/\+.*50 \(50\.0%\) since/)).toBeTruthy()

  // All starts at the first event (₹100), so it's the same change.
  fireEvent.press(screen.getByText('All'))
  expect(screen.getByText(/\+.*50 \(50\.0%\) since/)).toBeTruthy()
})

it('renders a page of activity and shows more on demand', () => {
  mockEvents = Array.from({ length: 45 }, (_, i) => ({
    holding_name: 'Gold', event_type: 'market_update', amount: '150', previous_value: '150', new_value: '150', timestamp: ago(45 - i),
  })) as HoldingEventRow[]
  const screen = renderWithProviders(<InvestmentsScreen />)
  expect(screen.getByText('Activity (45)')).toBeTruthy()
  expect(screen.getAllByText('Market update')).toHaveLength(20)

  fireEvent.press(screen.getByText('Show more'))
  expect(screen.getAllByText('Market update')).toHaveLength(45)
  expect(screen.queryByText('Show more')).toBeNull()
})

it('deletes a holding without a confirm, and Undo restores the one just archived', async () => {
  mockRestore.mockResolvedValue(undefined)
  const screen = renderWithProviders(<InvestmentsScreen />)
  fireEvent.press(screen.getAllByText('Gold')[1])
  fireEvent.press(screen.getByText('Delete'))
  expect(screen.queryByText(/cannot be undone/)).toBeNull()
  fireEvent.press(await screen.findByText('Undo'))
  await waitFor(() => expect(mockRestore).toHaveBeenCalledWith('holdings', 'new'))
})
