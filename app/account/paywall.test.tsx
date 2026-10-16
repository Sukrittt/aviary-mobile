import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { BillingStatus } from '@/src/api/billing'
import { track } from '@/src/lib/analytics'
import PaywallScreen from './paywall'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
}))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/src/lib/purchases', () => ({
  purchasesAvailable: () => true,
  getPackages: () =>
    Promise.resolve([
      { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { price: 39, priceString: '₹39', pricePerMonthString: '₹39' } },
      { identifier: '$rc_annual', packageType: 'ANNUAL', product: { price: 399, priceString: '₹399', pricePerMonthString: '₹33.25' } },
    ]),
}))

let mockStatus: BillingStatus
jest.mock('@/src/hooks/useBillingStatus', () => ({
  useBillingStatus: () => ({ data: mockStatus, isLoading: false }),
  seedBillingStatus: jest.fn(),
}))

const trial: BillingStatus = {
  mode: 'trial',
  allowed: true,
  enforced: true,
  trialStartedAt: '2026-10-16T00:00:00Z',
  trialEndsAt: '2099-11-15T12:00:00Z',
  trialDaysRemaining: 5,
  productId: null,
  basePlanId: null,
  paidExpiresAt: null,
  autoRenew: false,
  renewalState: null,
  retentionDeadline: null,
  purchaseEnabled: true,
}

beforeEach(() => jest.clearAllMocks())

it('shows the trial timeline with a close button and logs one view', async () => {
  mockStatus = trial
  const { findByText, getByLabelText } = renderWithProviders(<PaywallScreen />)

  expect(await findByText('Try everything. Pay only if it sticks.')).toBeTruthy()
  expect(track).toHaveBeenCalledTimes(1)
  expect(track).toHaveBeenCalledWith('paywall_viewed', { trigger: 'plan_screen', plan_status: 'trial' })
  fireEvent.press(getByLabelText('Close'))
  expect(mockBack).toHaveBeenCalled()
})

it('pitches the benefits with no way to close while locked out', async () => {
  mockStatus = { ...trial, mode: 'expired', allowed: false, trialDaysRemaining: 0 }
  const { findByText, queryByLabelText, getByText } = renderWithProviders(<PaywallScreen />)

  expect(await findByText('Keep Aviary · ₹399/year')).toBeTruthy()
  expect(getByText('Restore')).toBeTruthy()
  expect(queryByLabelText('Close')).toBeNull()
  expect(track).toHaveBeenCalledWith('paywall_viewed', { trigger: 'access_expired', plan_status: 'expired' })
})
