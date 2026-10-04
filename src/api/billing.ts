// Subscription access, as the server sees it. The mobile app's only
// authority on what this account may do — see src/lib/purchases.ts for why
// the on-device RevenueCat entitlement is not used for this.
import { markAccessAllowed, markAccessBlocked } from '@/src/lib/accessGate'
import { apiFetch } from './client'

/** Mirrors the `Access` shape returned by Web/app/api/billing/status. */
export interface BillingStatus {
  mode: 'setup_incomplete' | 'trial' | 'paid' | 'expired'
  /** May the account use normal budgeting, reports, AI and writes? */
  allowed: boolean
  /** False while the server's enforcement flag is off — `allowed` is then true regardless of mode. */
  enforced: boolean
  trialStartedAt: string | null
  trialEndsAt: string | null
  trialDaysRemaining: number
  productId: string | null
  basePlanId: string | null
  paidExpiresAt: string | null
  autoRenew: boolean
  renewalState: 'active' | 'cancelled' | 'grace' | 'on_hold' | 'paused' | 'expired' | 'revoked' | 'pending' | 'scheduled' | null
  /**
   * Where the purchase lives, so where it's managed: `'play'` (bought in this
   * app) or `'web'` (bought on the website through Razorpay, and managed
   * there). Absent from older servers, which only sold through Play.
   */
  store?: 'play' | 'web' | null
  retentionDeadline: string | null
  /** Whether the server is currently offering checkout at all. */
  purchaseEnabled: boolean
  /** Present and false when a sync returned stale data because the provider was unreachable. */
  refreshed?: boolean
}

/**
 * Reconcile the app-wide gate with what the server just said. This endpoint
 * stays reachable while expired, so its own 200 proves nothing — `allowed` in
 * the body is the answer, and it is the only thing that reopens the app after
 * a 402.
 */
function applyGate(status: BillingStatus): BillingStatus {
  if (status.allowed) markAccessAllowed()
  else markAccessBlocked()
  return status
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const resp = await apiFetch('/api/billing/status')
  if (!resp.ok) throw new Error(`Failed to load billing status: ${resp.status}`)
  return applyGate(await resp.json())
}

/**
 * Re-verify this account against the store. Call after a purchase, after a
 * restore, and when the user asks to refresh — not on every app open, since
 * each call is an outbound request to RevenueCat and the server rate-limits
 * it.
 *
 * A 503 means the provider was unreachable and the body is the *existing*
 * access, unchanged. That is deliberately not thrown: an outage must not
 * look like a cancellation to the user.
 */
export async function syncBilling(): Promise<BillingStatus> {
  const resp = await apiFetch('/api/billing/sync', { method: 'POST' })
  if (resp.status === 503) return applyGate(await resp.json())
  if (!resp.ok) throw new Error(`Failed to refresh subscription: ${resp.status}`)
  return applyGate(await resp.json())
}

/**
 * Finish onboarding server-side. This is what starts the 45-day trial, so
 * the date is the server's, not this device's — call it after the initial
 * budget writes have landed, or it refuses.
 */
export async function completeOnboarding(): Promise<{ onboardedAt: string; access: BillingStatus }> {
  const resp = await apiFetch('/api/onboarding/complete', { method: 'POST' })
  if (!resp.ok) throw new Error(`Failed to complete onboarding: ${resp.status}`)
  const body = await resp.json()
  applyGate(body.access)
  return body
}
