import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { BillingStatus } from '@/src/api/billing'
import { formatDate } from '@/src/lib/billingStatus'
import { CurrentPlan } from './CurrentPlan'

const firstCharge = new Date(Date.now() + 12 * 86_400_000).toISOString()

const status = (over: Partial<BillingStatus> = {}): BillingStatus => ({
  mode: 'paid',
  allowed: true,
  enforced: true,
  trialStartedAt: null,
  trialEndsAt: null,
  trialDaysRemaining: 0,
  productId: 'aviary_pro',
  basePlanId: 'monthly',
  paidExpiresAt: firstCharge,
  autoRenew: true,
  renewalState: 'active',
  store: 'web',
  retentionDeadline: null,
  purchaseEnabled: true,
  ...over,
})

it('shows a web plan bought mid-trial as a free trial with its first charge date', () => {
  const { getByText, queryByText } = renderWithProviders(<CurrentPlan status={status({ renewalState: 'scheduled' })} packages={[]} />)

  expect(getByText('Free trial')).toBeTruthy()
  expect(getByText('First charge')).toBeTruthy()
  expect(getByText(new RegExp(formatDate(firstCharge)))).toBeTruthy()
  expect(getByText(/you won't be charged until it ends/)).toBeTruthy()
  expect(queryByText('Next renewal')).toBeNull()
})

it('shows an active plan with its next renewal', () => {
  const { getByText, queryByText } = renderWithProviders(<CurrentPlan status={status()} packages={[]} />)

  expect(getByText('Active')).toBeTruthy()
  expect(getByText('Next renewal')).toBeTruthy()
  expect(queryByText('First charge')).toBeNull()
})
