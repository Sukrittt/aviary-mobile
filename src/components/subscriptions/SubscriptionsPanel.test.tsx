import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { SubscriptionsPanel } from './SubscriptionsPanel'
import type { SubscriptionRow } from '@/src/types'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))

function sub(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    timestamp: '2026-01-01T00:00:00',
    service: 'Netflix',
    amount_inr: '649',
    billing_cycle: 'monthly',
    next_due_date: '',
    status: 'active',
    renewal_or_end_month: '',
    notes: '',
    category: '',
    ...overrides,
  }
}

beforeEach(() => mockPush.mockClear())

describe('monthly total across mixed billing cycles', () => {
  it('normalizes yearly, quarterly, weekly, and monthly to a single monthly figure', () => {
    const subs = [
      sub({ service: 'Netflix', amount_inr: '600', billing_cycle: 'monthly' }),
      sub({ service: 'Prime', amount_inr: '1200', billing_cycle: 'yearly' }), // 100/mo
      sub({ service: 'Water', amount_inr: '300', billing_cycle: 'quarterly' }), // 100/mo
      sub({ service: 'News', amount_inr: '100', billing_cycle: 'weekly' }), // 433/mo
    ]
    const { getByText } = renderWithProviders(<SubscriptionsPanel subscriptions={subs} />)
    // 600 + 100 + 100 + 433 = 1233
    expect(getByText('₹1,233')).toBeTruthy()
  })

  it('excludes one-time charges from the monthly total', () => {
    const subs = [
      sub({ service: 'Netflix', amount_inr: '733', billing_cycle: 'monthly' }),
      sub({ service: 'Setup fee', amount_inr: '5000', billing_cycle: 'one-time' }),
    ]
    const { getAllByText, queryByText } = renderWithProviders(<SubscriptionsPanel subscriptions={subs} />)
    // 733 alone, not 733 + 5000 — a one-time charge isn't a recurring monthly cost.
    expect(getAllByText('₹733').length).toBeGreaterThan(0)
    expect(queryByText('₹5,733')).toBeNull()
  })
})

describe('active / cancelled split', () => {
  it('counts only active subs toward the hero total and "N active"', () => {
    // Two active amounts that don't equal either row's own figure, so the
    // hero total ("₹600") can't collide with a row's individually rendered amount.
    const subs = [
      sub({ service: 'Netflix', amount_inr: '400', status: 'active' }),
      sub({ service: 'Spotify', amount_inr: '200', status: 'active' }),
      sub({ service: 'Hulu', amount_inr: '999', status: 'cancelled' }),
    ]
    const { getByText } = renderWithProviders(<SubscriptionsPanel subscriptions={subs} />)
    expect(getByText('₹600')).toBeTruthy()
    expect(getByText(/2 active/)).toBeTruthy()
  })

  it('renders cancelled subs under the collapsed CANCELLED section', () => {
    const subs = [
      sub({ service: 'Netflix', status: 'active' }),
      sub({ service: 'Hulu', status: 'cancelled' }),
    ]
    const { getByText, queryByText } = renderWithProviders(<SubscriptionsPanel subscriptions={subs} />)
    expect(getByText('CANCELLED (1)')).toBeTruthy()
    // Collapsed by default — the row itself isn't rendered until expanded.
    expect(queryByText('Hulu')).toBeNull()

    fireEvent.press(getByText('CANCELLED (1)'))
    expect(getByText('Hulu')).toBeTruthy()
  })
})

describe('empty state', () => {
  it('shows a quiet prompt when there are no subscriptions', () => {
    const { getByText } = renderWithProviders(<SubscriptionsPanel subscriptions={[]} />)
    expect(getByText('No subscriptions tracked yet.')).toBeTruthy()
  })

  it('opens subscription entry from the empty state', () => {
    const { getByRole } = renderWithProviders(<SubscriptionsPanel subscriptions={[]} />)
    fireEvent.press(getByRole('button', { name: 'Add a subscription' }))
    expect(mockPush).toHaveBeenCalledWith('/modals/subscription')
  })
})

describe('row navigation', () => {
  it('tapping a row pushes the edit modal with that service', () => {
    // A single active sub: no AllocationBar (needs 3+ to say anything), so
    // "Netflix" renders exactly once, as the row's own name.
    const subs = [sub({ service: 'Netflix' })]
    const { getByText } = renderWithProviders(<SubscriptionsPanel subscriptions={subs} />)
    fireEvent.press(getByText('Netflix'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/modals/subscription', params: { service: 'Netflix' } })
  })
})

describe('category link', () => {
  it('shows no "View transactions" action when the subscription has no linked category', () => {
    const subs = [sub({ service: 'Netflix', category: '' })]
    const { queryByText } = renderWithProviders(<SubscriptionsPanel subscriptions={subs} />)
    expect(queryByText('View transactions ›')).toBeNull()
  })

  it('drills into Activity pre-filtered to the linked category', () => {
    const subs = [sub({ service: 'Netflix', category: 'Entertainment' })]
    const { getByText } = renderWithProviders(<SubscriptionsPanel subscriptions={subs} />)
    fireEvent.press(getByText('View transactions ›'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/activity', params: { category: 'Entertainment', period: 'month' } })
  })
})
