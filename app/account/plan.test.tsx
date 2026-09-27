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
