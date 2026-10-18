import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import RecurringSuggestionsScreen from './recurring-suggestions'
import type { RecurringSuggestion } from '@/src/types/recurringSuggestions'

const mockPush = jest.fn()
let mockParams: { kind?: string } = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))
jest.mock('@/src/lib/netStatus', () => ({ ...jest.requireActual('@/src/lib/netStatus'), useOnline: () => true }))

const mockSuggestion = (kind: RecurringSuggestion['kind'], item: string): RecurringSuggestion => ({
  id: item,
  kind,
  dates: ['2026-08-12', '2026-09-12', '2026-10-12'],
  occurrences: 3,
  variableAmount: false,
  input: { item, amount_inr: '15.49', category: 'Subscriptions', payment_method: 'credit_card', frequency: 'monthly', start_date: '2026-11-12' } as RecurringSuggestion['input'],
})
const mockScan = { suggestions: [mockSuggestion('subscription', 'Netflix'), mockSuggestion('other_recurring', 'Landlord')], scannedAt: '2026-10-18T22:00:00Z', windowStart: '2026-04-19', windowEnd: '2026-10-19', remaining: 0 }
const mockIdle = { mutate: jest.fn(), mutateAsync: jest.fn(), reset: jest.fn(), isPending: false, error: null }
jest.mock('@/src/hooks/useRecurringSuggestions', () => ({
  useRecurringSuggestions: () => ({ data: mockScan, isLoading: false, error: null }),
  useScanRecurringSuggestions: () => mockIdle,
  useDismissRecurringSuggestion: () => mockIdle,
}))
let mockUser: { hiddenFeatures?: string[] } = { hiddenFeatures: [] }
jest.mock('@/src/hooks/useUser', () => ({ useUser: () => ({ data: mockUser }) }))

beforeEach(() => {
  mockPush.mockClear()
  mockParams = {}
  mockUser = { hiddenFeatures: [] }
})

it('shows one kind on its own screen', async () => {
  const { findByText, queryByText } = renderWithProviders(<RecurringSuggestionsScreen />)
  expect(await findByText('Landlord')).toBeTruthy()
  expect(queryByText('Netflix')).toBeNull()
})

it('shows subscriptions and recurring payments together for the import banner', async () => {
  mockParams = { kind: 'all' }
  const { findByText, getByText, getAllByText } = renderWithProviders(<RecurringSuggestionsScreen />)
  expect(await findByText('Netflix')).toBeTruthy()
  expect(getByText('Landlord')).toBeTruthy()
  expect(getAllByText('Find repeat payments').length).toBeGreaterThan(0)
})

it('sets a subscription up as a recurring expense when Subscriptions is switched off', async () => {
  mockParams = { kind: 'all' }
  mockUser = { hiddenFeatures: ['subscriptions'] }
  const { findAllByText } = renderWithProviders(<RecurringSuggestionsScreen />)
  fireEvent.press((await findAllByText('Review'))[0])
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/modals/recurring-expense', params: expect.objectContaining({ item: 'Netflix' }) }))
})

it('sets a subscription up as one when Subscriptions is on', async () => {
  mockParams = { kind: 'all' }
  const { findAllByText } = renderWithProviders(<RecurringSuggestionsScreen />)
  fireEvent.press((await findAllByText('Review'))[0])
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/modals/subscription', params: expect.objectContaining({ service: 'Netflix' }) }))
})
