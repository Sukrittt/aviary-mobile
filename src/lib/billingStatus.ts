// Pure reads over the server's BillingStatus — what to show, and whether to
// let the user in. Mirrors Web/src/components/billing/copy.ts so both clients
// describe an account the same way.
import type { BillingStatus } from '@/src/api/billing'

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'

/**
 * Whether the plan was bought on the website rather than through Google Play.
 * A web plan can't be managed in Play, so every "fix it in Google Play" line
 * has to say something else for it.
 */
export function isWebPlan(status: Pick<BillingStatus, 'store'> | undefined): boolean {
  return status?.store === 'web'
}

/** Reminder thresholds, in days remaining. Matches payment-subscriptions-plan.md. */
export const REMINDER_DAYS = [7, 3, 1]

/**
 * Whether normal app features should be usable right now.
 *
 * Unknown (no status yet, or the request failed) is allowed: the server
 * enforces this on every route anyway, and failing closed would lock out a
 * paying user whose phone briefly lost signal.
 *
 * A cached answer cannot outlive an expiry it already knows about. A trial
 * that ended while the app sat offline is over — nothing can have renewed
 * it. A paid plan that will not auto-renew is the same. An auto-renewing one
 * is not: it most likely renewed, and only the server can say otherwise.
 */
export function accessAllowed(status: BillingStatus | undefined, now: number = Date.now()): boolean {
  if (!status) return true
  if (!status.allowed) return false
  if (!status.enforced) return true
  const knownEnd =
    status.mode === 'trial' ? status.trialEndsAt : status.mode === 'paid' && !status.autoRenew ? status.paidExpiresAt : null
  return !knownEnd || Date.parse(knownEnd) > now
}

/**
 * Whether billing is worth mentioning at all. With both server flags off
 * and nobody paid, there's no plan to show or trial to count down.
 */
export function billingVisible(status: BillingStatus | undefined): boolean {
  return !!status && (status.enforced || status.purchaseEnabled || status.mode === 'paid')
}

/** The reminder threshold the trial is currently inside (7, 3 or 1), or null if it is not time to warn yet. */
export function trialReminderBucket(status: BillingStatus | undefined): number | null {
  if (!billingVisible(status) || status?.mode !== 'trial') return null
  const days = status.trialDaysRemaining
  return [...REMINDER_DAYS].reverse().find((d) => days <= d) ?? null
}

/** "3 days left", "Last day" — the phrase used everywhere the trial is mentioned. */
export function trialRemainingLabel(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'Last day'
  if (daysRemaining === 1) return '1 day left'
  return `${daysRemaining} days left`
}

/** One line for the More screen's Plan & billing row. */
export function planSummary(status: BillingStatus): string {
  switch (status.mode) {
    case 'trial':
      return `Free trial · ${trialRemainingLabel(status.trialDaysRemaining)}`
    case 'paid':
      if (status.renewalState === 'grace') return isWebPlan(status) ? 'Payment issue · retrying' : 'Payment issue · fix in Google Play'
      // Subscribed on the web mid-trial: nothing's charged until the trial ends.
      if (status.renewalState === 'scheduled') return `Free trial · first charge ${formatDate(status.paidExpiresAt)}`
      return status.autoRenew ? `Renews ${formatDate(status.paidExpiresAt)}` : `Ends ${formatDate(status.paidExpiresAt)}`
    case 'expired':
      return status.trialEndsAt && !status.productId ? 'Trial ended' : 'Subscription ended'
    default:
      return 'Finish setup to start your trial'
  }
}

/**
 * Why the account is locked, as a headline and one follow-up line. Each case
 * names something the user can act on: "a payment didn't go through" is
 * useful, "status: on_hold" isn't.
 */
export function lockedCopy(status: BillingStatus | undefined): { title: string; body: string } {
  // A web plan lapsed on the website, so the way back is picking a plan, not Google Play.
  if (isWebPlan(status)) {
    if (status?.renewalState === 'on_hold') return { title: "A payment didn't go through", body: 'Your web plan stopped renewing. Pick a plan to get back in.' }
    if (status?.renewalState === 'paused') return { title: 'Your subscription is paused', body: 'Your web plan is paused. Pick a plan to carry on.' }
  }
  switch (status?.renewalState) {
    case 'on_hold':
      return { title: "A payment didn't go through", body: 'Update your payment method in Google Play to get back in.' }
    case 'paused':
      return { title: 'Your subscription is paused', body: "Resume it in Google Play whenever you're ready." }
    case 'revoked':
      return { title: 'Your subscription was refunded', body: "It's no longer active. Pick a plan to carry on." }
    case 'pending':
      return { title: 'Your payment is on its way', body: 'Some payment methods take a while to clear. No need to pay again.' }
    default:
      return {
        // Keyed on "never bought", not mode: a trial that ran out while the app
        // was offline is still reported as mode 'trial' by the cached status.
        title: status?.trialEndsAt && !status.productId ? 'Your free trial has ended' : 'Your subscription has ended',
        body: 'Everything you logged is still here. Pick a plan to carry on.',
      }
  }
}

/** Human date, e.g. "2 November 2026". Missing input renders as an em dash. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Whole-percent saving of yearly over twelve months of monthly, or null if there's no real saving to claim. */
export function yearlySavingsPercent(monthlyPrice: number, yearlyPrice: number): number | null {
  if (monthlyPrice <= 0) return null
  const pct = Math.floor((1 - yearlyPrice / (monthlyPrice * 12)) * 100)
  return pct > 0 ? pct : null
}

/** Monthly or yearly, read off the store's product/base-plan ids (`monthly`, `envelope_individual:annual`, …). */
export function planPeriod(status: Pick<BillingStatus, 'productId' | 'basePlanId'>): 'monthly' | 'yearly' {
  return /year|annual/i.test(`${status.productId ?? ''} ${status.basePlanId ?? ''}`) ? 'yearly' : 'monthly'
}

/** "today", "tomorrow", "in 12 days", counted in whole calendar days on this device. */
export function daysUntilLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ''
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((day(new Date(iso)) - day(now)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}
