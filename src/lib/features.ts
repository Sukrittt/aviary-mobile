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
  { key: 'recurring', label: 'Recurring expenses', hint: 'Plan upcoming payments' },
  { key: 'subscriptions', label: 'Subscriptions', hint: 'What renews and when' },
  { key: 'wrapped', label: 'Expense Wrapped', hint: 'Your monthly recap' },
] as const

export type HideableFeature = (typeof HIDEABLE_FEATURES)[number]['key']

export function isHidden(user: Pick<UserProfile, 'hiddenFeatures'> | undefined, key: HideableFeature): boolean {
  return !!user?.hiddenFeatures?.includes(key)
}
