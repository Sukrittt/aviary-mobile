import { useEffect, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getBillingStatus, syncBilling, type BillingStatus } from '@/src/api/billing'
import { isAccessBlocked, onAccessChange } from '@/src/lib/accessGate'
import { accessAllowed } from '@/src/lib/billingStatus'
import { currentUserId } from '@/src/api/accessMode'
import { setEventContext } from '@/src/lib/analytics'

export const billingKey = ['billing-status'] as const

/**
 * The account's subscription state.
 *
 * Cached rather than fetched per screen, and never refetched on a timer: the
 * server is the authority, and a client polling it would just spend battery
 * to learn the same thing the next real request already tells it. The moments
 * that matter are covered explicitly — app foreground, and any 402.
 *
 * `staleTime` is deliberately short. A user who just paid in the Play sheet
 * expects the app to open up, and being made to wait out a cache for that is
 * the worst minute of the whole purchase.
 */
export function useBillingStatus(enabled = true) {
  const qc = useQueryClient()
  // Guests (the shared demo account) have no billing, and the server answers
  // them with a 401 — which the root layout would read as a dead session.
  const query = useQuery({ queryKey: billingKey, queryFn: getBillingStatus, staleTime: 30_000, enabled: enabled && currentUserId() !== null })

  // Every event carries the plan it happened on, so a chart can split trial
  // users from paying ones without a join.
  const mode = query.data?.mode
  useEffect(() => {
    if (mode) setEventContext({ plan_status: mode })
  }, [mode])

  // The gate flips from src/api/client.ts the instant any request is refused,
  // which is usually well before this query would have noticed on its own.
  const blocked = useSyncExternalStore(onAccessChange, isAccessBlocked, () => false)
  useEffect(() => {
    if (blocked) void qc.invalidateQueries({ queryKey: billingKey })
  }, [blocked, qc])

  // A subscription can lapse, renew, or be restored while the app sits in the
  // background — none of which produce a request for this app to notice.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void qc.invalidateQueries({ queryKey: billingKey })
    })
    return () => sub.remove()
  }, [qc])

  return query
}

/**
 * Re-verify against the store on demand — after a purchase, a restore, or a
 * "Refresh" tap. Seeds the cache with the server's answer rather than
 * invalidating, so the screen updates in the same tick the purchase resolves.
 */
export function useSyncBilling() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: syncBilling,
    onSuccess: (status: BillingStatus) => seedBillingStatus(qc, status),
  })
}

/** Put a fresh server answer (from a sync, purchase or restore) straight into the cache. */
export function seedBillingStatus(qc: QueryClient, status: BillingStatus): void {
  qc.setQueryData(billingKey, status)
  // Access just changed — every screen that was showing restricted or
  // cached content needs to refetch what it could not load before.
  if (status.allowed) void qc.invalidateQueries()
}

/** Whether normal app features should be usable right now — see accessAllowed for the rules. */
export function useAccessAllowed(enabled = true): boolean {
  const { data } = useBillingStatus(enabled)
  return accessAllowed(data)
}
