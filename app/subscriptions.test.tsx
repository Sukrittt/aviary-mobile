import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SubscriptionsScreen from './subscriptions'
import type { SubscriptionRow } from '@/src/types'

const mockPush = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), navigate: jest.fn() }),
}))

let mockOnline = true
jest.mock('@/src/lib/netStatus', () => ({
  ...jest.requireActual('@/src/lib/netStatus'),
  useOnline: () => mockOnline,
}))

const mockUseSubscriptions = jest.fn()
jest.mock('@/src/hooks/useSubscriptions', () => ({
  useSubscriptions: () => mockUseSubscriptions(),
}))

function sub(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    timestamp: '2026-09-01T10:00:00',
    service: 'Netflix',
    amount_inr: '649',
    billing_cycle: 'monthly',
    next_due_date: '2026-10-01',
    status: 'active',
    renewal_or_end_month: '',
    notes: '',
    category: 'Entertainment',
    ...overrides,
  }
}

beforeEach(() => {
  mockOnline = true
  mockPush.mockClear()
  mockBack.mockClear()
  mockUseSubscriptions.mockReset()
})

it('shows the offline screen instead of stale subscriptions', () => {
  mockOnline = false
  mockUseSubscriptions.mockReturnValue({ data: [], isLoading: false })
  const { getByText } = renderWithProviders(<SubscriptionsScreen />)
  expect(getByText("You're offline")).toBeTruthy()
})

it('opens the add-subscription modal with no service, so it starts blank', () => {
  mockUseSubscriptions.mockReturnValue({ data: [], isLoading: false })
  const { getByRole } = renderWithProviders(<SubscriptionsScreen />)
  fireEvent.press(getByRole('button', { name: 'Add subscription' }))
  expect(mockPush).toHaveBeenCalledWith('/modals/subscription')
})

it('opens the subscription analyzer from the subscriptions screen', () => {
  mockUseSubscriptions.mockReturnValue({ data: [], isLoading: false })
  const { getByRole } = renderWithProviders(<SubscriptionsScreen />)
  fireEvent.press(getByRole('button', { name: 'Find subscriptions' }))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/recurring-suggestions', params: { kind: 'subscription' } })
})

it('renders the live subscriptions list from the shared panel', () => {
  mockUseSubscriptions.mockReturnValue({ data: [sub({})], isLoading: false })
  const { getByText } = renderWithProviders(<SubscriptionsScreen />)
  expect(getByText('Netflix')).toBeTruthy()
})

it('goes back when the back button is pressed', () => {
  mockUseSubscriptions.mockReturnValue({ data: [], isLoading: false })
  const { getByRole } = renderWithProviders(<SubscriptionsScreen />)
  fireEvent.press(getByRole('button', { name: 'Go back' }))
  expect(mockBack).toHaveBeenCalledTimes(1)
})
