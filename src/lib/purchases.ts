// Google Play checkout, via RevenueCat.
//
// The rule this file exists to enforce: **the device never decides whether
// the user has paid.** RevenueCat's `CustomerInfo` is available here and is
// deliberately not used as the answer — it is a signal that something may
// have changed. Every purchase and restore ends by asking our backend, which
// verifies against RevenueCat server-side (Web/lib/billing/service.ts) and
// returns the access decision. Anything else is an entitlement a rooted
// device can mint for itself.
//
// Structured like src/lib/analytics.ts: a module singleton bound to the
// session through accessMode, so the identity mapping lives in one place
// instead of being repeated at every sign-in call site.
import { Platform } from 'react-native'
import Purchases, { LOG_LEVEL, PURCHASES_ERROR_CODE, type CustomerInfo, type PurchasesError, type PurchasesPackage } from 'react-native-purchases'
import { accessMode, currentUserId } from '../api/accessMode'
import { syncBilling, type BillingStatus } from '../api/billing'
import { track } from './analytics'

/**
 * The *public* SDK key. Safe to ship — it can only read and start purchases
 * for the signed-in customer. The secret key lives on the server and must
 * never appear in this bundle.
 *
 * A `test_…` key is RevenueCat's Test Store, which is how this is developed
 * before Play products exist; the real Android key starts `goog_…`.
 */
const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? ''

let configured = false

/** Whether checkout can run at all on this build. iOS is out of launch scope. */
export function purchasesAvailable(): boolean {
  return Platform.OS === 'android' && API_KEY.length > 0
}

/**
 * Configure the SDK and keep its customer identity tied to the session.
 * Call once at module scope in the root layout, beside initAnalytics().
 *
 * The app user id is the WorkOS user id — the same id our backend
 * authenticates and bills against. Without that, a purchase would be filed
 * under an anonymous RevenueCat id the server has no way to connect to an
 * account.
 */
export function initPurchases(): void {
  if (!purchasesAvailable()) return

  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR)
    // Configured with whatever identity exists right now: on a relaunch
    // accessMode has already restored the session, so this avoids a moment
    // where the SDK is anonymous and an in-flight renewal lands on the wrong
    // customer. Signed out, it stays anonymous until logIn below.
    Purchases.configure({ apiKey: API_KEY, appUserID: currentUserId() ?? null })
    configured = true
  } catch (err) {
    // A misconfigured key must not take the app down — budgeting still works
    // without checkout, and the server decides access anyway.
    console.warn('[purchases] configure failed:', (err as Error).message)
    return
  }

  accessMode.subscribe((mode) => {
    // Same guard as analytics: on the way out, subscribers are notified with
    // 'guest' and currentUserId() is already null.
    if (mode !== 'real') return
    const userId = currentUserId()
    if (userId) void Purchases.logIn(userId).catch((err) => console.warn('[purchases] logIn failed:', err.message))
  })

  // Drop the customer identity with the session, so the next account on this
  // device does not inherit the previous one's entitlement view.
  accessMode.subscribeLogout(() => {
    void Purchases.logOut().catch(() => {
      // Already anonymous, or the SDK never configured. Nothing to undo.
    })
  })
}

/** The purchasable plans, with prices as the store returned them (already localized). */
export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return []
  const offerings = await Purchases.getOfferings()
  return offerings.current?.availablePackages ?? []
}

export type PurchaseOutcome =
  | { status: 'purchased'; access: BillingStatus }
  | { status: 'cancelled' }
  /** The store accepted the purchase but has not settled it (UPI mandate, carrier billing). */
  | { status: 'pending' }
  | { status: 'failed'; message: string }

/**
 * Buy a plan, then ask the server what that bought.
 *
 * `status: 'purchased'` does not mean access is on — it means the store
 * completed and the backend has re-verified. The returned access is what the
 * UI must show; a device-side entitlement check would be the thing to fake.
 */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  // The package id ('$rc_monthly', '$rc_annual') is what the paywall funnel
  // splits on. No price: that's the store's number, already in RevenueCat.
  const plan = pkg.identifier
  track('purchase_started', { package: plan })
  try {
    await Purchases.purchasePackage(pkg)
  } catch (err) {
    const error = err as Partial<PurchasesError>
    if (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      track('purchase_cancelled', { package: plan })
      return { status: 'cancelled' }
    }
    // Slow payment methods (common in India) complete out of band; the
    // webhook grants access when the store settles it. Telling the user it
    // failed here would send them back to buy a second time.
    if (error.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
      track('purchase_completed', { package: plan, verified: false, pending: true })
      return { status: 'pending' }
    }
    track('purchase_failed', { package: plan, error_code: String(error.code ?? 'unknown') })
    return { status: 'failed', message: error.message ?? 'Purchase failed' }
  }

  try {
    const access = await syncBilling()
    track('purchase_completed', { package: plan, verified: access.allowed, pending: false })
    return { status: 'purchased', access }
  } catch {
    // Paid, but we could not confirm it right now. Not a failure — the
    // webhook reaches the server independently of this device, so the
    // caller should re-check status rather than re-charge the user.
    track('purchase_completed', { package: plan, verified: false, pending: true })
    return { status: 'pending' }
  }
}

/**
 * "Restore purchases" — a reinstall, a new device, or a user who already
 * paid and is looking at a subscribe screen.
 *
 * Restores against the store, then takes the server's answer. Returns the
 * fresh access so the caller can say plainly whether anything was found.
 */
export async function restore(): Promise<BillingStatus> {
  track('restore_tapped')
  if (configured) await Purchases.restorePurchases()
  const access = await syncBilling()
  if (access.allowed) track('restore_succeeded', { plan_status: access.mode })
  return access
}

/**
 * Deep link to Google Play's subscription management for this purchase, or
 * null if there is nothing to manage. Cancelling has to happen in Play —
 * cancelling in our app is not something we can do on the user's behalf.
 */
export async function managementUrl(): Promise<string | null> {
  if (!configured) return null
  try {
    const info: CustomerInfo = await Purchases.getCustomerInfo()
    return info.managementURL ?? null
  } catch {
    return null
  }
}
