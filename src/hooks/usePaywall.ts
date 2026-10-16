import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PurchasesPackage } from 'react-native-purchases'
import { Alert } from '@/src/components/ui/AlertHost'
import { trackAviaryPro } from '@/src/lib/trackAviaryPro'
import { useBillingStatus, seedBillingStatus } from '@/src/hooks/useBillingStatus'
import { getPackages, purchase, purchasesAvailable, restore } from '@/src/lib/purchases'
import { accessAllowed } from '@/src/lib/billingStatus'

/**
 * Billing state and the buy/restore flows, shared by Plan & billing and the
 * paywall modal so both sell and restore the same way.
 *
 * The device never decides access: every purchase and restore ends with the
 * server's answer, seeded into the cache (see src/lib/purchases.ts).
 */
export function usePaywall() {
  const qc = useQueryClient()
  const { data: status, isLoading } = useBillingStatus()
  const [busy, setBusy] = useState<string | null>(null)

  const locked = !accessAllowed(status)
  // Checkout opens at trial expiry for v1 (payment-subscriptions-plan.md).
  // Play charges the moment a subscription starts, so buying early would
  // quietly forfeit the rest of the trial. During the trial the plans are
  // shown with their prices, but can't be bought yet. A trial that's already
  // locked (it ended while the cache still says 'trial') has nothing left to
  // forfeit, so it can buy.
  const showPlans = !!status?.purchaseEnabled && purchasesAvailable() && (status.mode === 'expired' || status.mode === 'trial')
  const canBuy = showPlans && (status?.mode === 'expired' || locked)
  const paid = status?.mode === 'paid'
  const packagesQuery = useQuery({ queryKey: ['billing-packages'], queryFn: getPackages, enabled: showPlans || (paid && purchasesAvailable()) })

  async function buy(pkg: PurchasesPackage) {
    setBusy(pkg.identifier)
    const outcome = await purchase(pkg)
    setBusy(null)
    if (outcome.status === 'purchased') {
      seedBillingStatus(qc, outcome.access)
      if (outcome.access.allowed) void trackAviaryPro(pkg, outcome.access.paidExpiresAt)
      else Alert.alert('Almost there', "Google Play took the payment, but we couldn't confirm it yet. Give it a minute and tap Restore purchases.")
    } else if (outcome.status === 'pending') {
      void qc.invalidateQueries({ queryKey: ['billing-status'] })
      Alert.alert('Payment pending', "Google Play is still confirming your payment. We'll unlock Aviary as soon as it clears. No need to pay again.")
    } else if (outcome.status === 'failed') {
      Alert.alert("Couldn't complete purchase", 'Google Play didn\'t finish the payment. Check your connection and try again.')
    }
  }

  async function doRestore() {
    setBusy('restore')
    try {
      const next = await restore()
      seedBillingStatus(qc, next)
      if (!next.allowed) Alert.alert('Nothing to restore', "We didn't find an active subscription for this Google account. Subscriptions belong to the Aviary account that bought them.")
    } catch {
      Alert.alert("Couldn't reach the store", 'Check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }

  return { status, isLoading, locked, showPlans, canBuy, paid, packagesQuery, busy, setBusy, buy, doRestore }
}
