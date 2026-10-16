import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { BillingStatus } from '@/src/api/billing'
import PlanScreen from './plan'

const mockPush = jest.fn()
const mockReplace = jest.fn()
let mockCanGoBack = true
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace, canGoBack: () => mockCanGoBack }),
}))

let mockPurchasable = false
jest.mock('@/src/lib/purchases', () => ({
  purchasesAvailable: () => mockPurchasable,
  getPackages: () =>
    Promise.resolve([
      { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { price: 39, priceString: '₹39', pricePerMonthString: '₹39' } },
      { identifier: '$rc_annual', packageType: 'ANNUAL', product: { price: 399, priceString: '₹399', pricePerMonthString: '₹33.25' } },
    ]),
  managementUrl: () => Promise.resolve(null),
}))

let mockStatus: BillingStatus | undefined
jest.mock('@/src/hooks/useBillingStatus', () => ({
  useBillingStatus: () => ({ data: mockStatus, isLoading: false }),
  seedBillingStatus: jest.fn(),
}))

const base: BillingStatus = {
  mode: 'trial',
  allowed: true,
  enforced: true,
  trialStartedAt: '2026-09-01T00:00:00Z',
  trialEndsAt: '2099-10-16T00:00:00Z',
  trialDaysRemaining: 12,
  productId: null,
  basePlanId: null,
  paidExpiresAt: null,
  autoRenew: false,
  renewalState: null,
  retentionDeadline: null,
  purchaseEnabled: true,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCanGoBack = true
  mockPurchasable = false
})

it('shows the trial countdown without the lock-screen exits', () => {
  mockStatus = base
  const { getByText, queryByText } = renderWithProviders(<PlanScreen />)

  expect(getByText('Free trial · 12 days left')).toBeTruthy()
  expect(queryByText(/Export it free/)).toBeNull()
})

it('gives an expired account every exit the plan promises', () => {
  mockCanGoBack = false
  mockStatus = { ...base, mode: 'expired', allowed: false, trialDaysRemaining: 0 }
  const { getByText } = renderWithProviders(<PlanScreen />)

  expect(getByText('Your free trial has ended')).toBeTruthy()
  expect(getByText('Restore purchases')).toBeTruthy()
  expect(getByText('Sign out')).toBeTruthy()

  fireEvent.press(getByText(/Export it free/))
  expect(mockPush).toHaveBeenCalledWith('/account/data')
  fireEvent.press(getByText('Manage or delete account'))
  expect(mockPush).toHaveBeenCalledWith('/account/security')
})

it('shows a paying account its plan, renewal and what it includes', () => {
  mockStatus = { ...base, mode: 'paid', productId: 'monthly', paidExpiresAt: '2099-10-18T12:00:00Z', autoRenew: true, renewalState: 'active' }
  const { getByText, queryByText } = renderWithProviders(<PlanScreen />)

  expect(getByText("You're on Aviary Pro")).toBeTruthy()
  expect(getByText('Monthly')).toBeTruthy()
  expect(getByText('Active')).toBeTruthy()
  expect(getByText(/^October 18, 2099|^18 October 2099/)).toBeTruthy()
  expect(getByText('No ads. Ever.')).toBeTruthy()
  expect(getByText('Manage in Google Play')).toBeTruthy()
  expect(queryByText('Manage or delete account')).toBeNull()
})

it('points a web subscriber at the website instead of Google Play, with no Play price', () => {
  mockStatus = { ...base, mode: 'paid', productId: 'plan_year', basePlanId: 'yearly', paidExpiresAt: '2099-10-18T12:00:00Z', autoRenew: true, renewalState: 'active', store: 'web' }
  const { getByText, queryByText } = renderWithProviders(<PlanScreen />)

  expect(getByText('Yearly')).toBeTruthy()
  expect(getByText('Manage on the web')).toBeTruthy()
  expect(queryByText('Manage in Google Play')).toBeNull()
  expect(getByText(/Deleting your Aviary account cancels it for you/)).toBeTruthy()
  expect(queryByText(/Cancel it in Google Play first/)).toBeNull()
})

it('tells a web subscriber with a failed renewal that it is being retried, not to go to Play', () => {
  mockStatus = { ...base, mode: 'paid', productId: 'plan_month', paidExpiresAt: '2099-10-18T12:00:00Z', autoRenew: true, renewalState: 'grace', store: 'web' }
  const { getByText, queryByText } = renderWithProviders(<PlanScreen />)

  expect(getByText(/We're retrying it/)).toBeTruthy()
  expect(queryByText(/Update it in Google Play/)).toBeNull()
})

it('goes Home when unlocked with nothing to go back to, as right after a purchase', () => {
  mockCanGoBack = false
  mockStatus = { ...base, mode: 'paid', productId: 'monthly', paidExpiresAt: '2099-10-18T12:00:00Z', autoRenew: true, renewalState: 'active' }
  const { getByLabelText } = renderWithProviders(<PlanScreen />)

  fireEvent.press(getByLabelText('Back'))
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
})

it('has no back button while locked', () => {
  mockCanGoBack = true
  mockStatus = { ...base, mode: 'expired', allowed: false, trialDaysRemaining: 0 }
  const { queryByLabelText } = renderWithProviders(<PlanScreen />)
  expect(queryByLabelText('Back')).toBeNull()
})

it('mid-trial, shows one row into the paywall instead of the plans', async () => {
  mockPurchasable = true
  mockStatus = base
  const { findByText, getByText, queryByText } = renderWithProviders(<PlanScreen />)

  expect(await findByText("From ₹33.25/month. Nothing's charged unless you subscribe.")).toBeTruthy()
  expect(queryByText('Yearly')).toBeNull()
  expect(queryByText(/Keep Aviary|Available from/)).toBeNull()
  fireEvent.press(getByText(/^What happens on /))
  expect(mockPush).toHaveBeenCalledWith('/account/paywall')
})

it('calls the row See plans in the last week of the trial', () => {
  mockPurchasable = true
  mockStatus = { ...base, trialDaysRemaining: 5 }
  const { getByText } = renderWithProviders(<PlanScreen />)

  fireEvent.press(getByText('See plans'))
  expect(mockPush).toHaveBeenCalledWith('/account/paywall')
})

it('puts the plans under the lock card when access has ended, exits included', async () => {
  mockPurchasable = true
  mockCanGoBack = false
  mockStatus = { ...base, mode: 'expired', allowed: false, trialDaysRemaining: 0 }
  const { findByText, getByText } = renderWithProviders(<PlanScreen />)

  expect(await findByText('Keep Aviary · ₹399/year')).toBeTruthy()
  expect(getByText('Snap a bill')).toBeTruthy()
  expect(getByText('Sign out')).toBeTruthy()
})

it('sells to a trial that ran out while the cached status still says trial', async () => {
  mockPurchasable = true
  mockStatus = { ...base, trialEndsAt: '2020-01-01T00:00:00Z', trialDaysRemaining: 0 }
  const { findByRole, queryByText } = renderWithProviders(<PlanScreen />)

  expect(await findByRole('button', { name: 'Keep Aviary · ₹399/year' })).not.toBeDisabled()
  expect(queryByText(/You can subscribe from/)).toBeNull()
  expect(queryByText('Sign out')).toBeTruthy()
})
