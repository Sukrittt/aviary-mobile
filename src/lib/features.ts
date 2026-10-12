import type { UserProfile } from '@/src/api/account'

/**
 * Features a user can hide for a simpler app (More → Features). Hiding only
 * removes entry points; the data stays. Keys mirror Web's lib/users.ts
 * HIDEABLE_FEATURES, which the PATCH /api/user allowlist validates against.
 */
export const HIDEABLE_FEATURES = [
  { key: 'askAviary', label: 'Ask Aviary', hint: 'Ask about your spending' },
  { key: 'insights', label: 'Insights', hint: 'Trends and breakdowns' },
  { key: 'investments', label: 'Investments', hint: 'Portfolio at a glance' },
  { key: 'billScan', label: 'Scan a bill', hint: 'Split a cart or receipt' },
  { key: 'income', label: 'Income', hint: 'What comes in and when' },
  { key: 'accounts', label: 'Accounts', hint: 'Bank, card and cash' },
  { key: 'recurring', label: 'Recurring expenses', hint: 'Plan upcoming payments' },
  { key: 'subscriptions', label: 'Subscriptions', hint: 'What renews and when' },
  { key: 'wrapped', label: 'Expense Wrapped', hint: 'Your monthly recap' },
] as const

export type HideableFeature = (typeof HIDEABLE_FEATURES)[number]['key']

/** Extras a new account starts without; the core budget stays on. */
export const OPT_IN_FEATURES: HideableFeature[] = ['askAviary', 'billScan', 'wrapped', 'investments', 'subscriptions', 'insights']

/**
 * Accounts created from this moment start with OPT_IN_FEATURES off. Older
 * accounts that never touched the Features screen keep everything on, which
 * is what they've always seen.
 */
export const OPT_IN_SINCE = '2026-10-12T00:00:00.000Z'

type FeatureUser = Pick<UserProfile, 'hiddenFeatures' | 'createdAt'>

/** What's hidden for this user: their saved choice, else the default for their account's age. */
export function hiddenFeatures(user: FeatureUser | undefined): HideableFeature[] {
  if (!user) return []
  if (user.hiddenFeatures) return user.hiddenFeatures
  return user.createdAt && user.createdAt >= OPT_IN_SINCE ? OPT_IN_FEATURES : []
}

export function isHidden(user: FeatureUser | undefined, key: HideableFeature): boolean {
  return hiddenFeatures(user).includes(key)
}
