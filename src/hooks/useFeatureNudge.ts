import type { UserProfile } from '@/src/api/account'
import { hiddenFeatures } from '@/src/lib/features'
import { ASK_NUDGE_DAYS, FEATURE_NUDGES, INSIGHTS_NUDGE_AT, SCAN_NUDGE_AT, firstBanner, type NudgeFeature } from '@/src/lib/homeBanner'
import { useDismissedRolloverBanner } from './useDismissedRolloverBanner'
import { useRecurringSuggestions } from './useRecurringSuggestions'
import { useWrappedStatus } from './useWrapped'

/**
 * At most one offer to turn on a hidden feature, driven by data the app
 * already has: subscription suggestions from a recurring scan, last month's
 * Wrapped unlocking, a few dozen logged expenses, a week of logging days, or
 * the first handful of expenses. Each is dismissed for good on this device.
 */
export function useFeatureNudge(user: UserProfile | undefined, expenses: readonly { date: string }[]) {
  const hidden = user ? hiddenFeatures(user) : []
  const [subsDismissed, setSubsDismissed] = useDismissedRolloverBanner('nudge-subscriptions')
  const [insightsDismissed, setInsightsDismissed] = useDismissedRolloverBanner('nudge-insights')
  const [wrappedDismissed, setWrappedDismissed] = useDismissedRolloverBanner('nudge-wrapped')
  const [askDismissed, setAskDismissed] = useDismissedRolloverBanner('nudge-askAviary')
  const [scanDismissed, setScanDismissed] = useDismissedRolloverBanner('nudge-billScan')
  const loggedDays = new Set(expenses.map((e) => e.date.slice(0, 10))).size

  const wantSubs = hidden.includes('subscriptions') && subsDismissed === false
  const wantWrapped = hidden.includes('wrapped') && wrappedDismissed === false
  const suggestionsQ = useRecurringSuggestions(6, wantSubs)
  const suggestions = suggestionsQ.data?.suggestions
  const wrapped = useWrappedStatus(wantWrapped).data

  const feature = firstBanner<NudgeFeature>([
    // Still loading counts as unknown, so a lower offer doesn't show and then get swapped out.
    [
      'subscriptions',
      hidden.includes('subscriptions') && (suggestionsQ.isLoading || !!suggestions?.some((s) => s.kind === 'subscription')),
      suggestionsQ.isLoading ? null : subsDismissed,
    ],
    ['wrapped', hidden.includes('wrapped') && !!wrapped?.available, wrappedDismissed],
    ['insights', hidden.includes('insights') && expenses.length >= INSIGHTS_NUDGE_AT, insightsDismissed],
    ['askAviary', hidden.includes('askAviary') && loggedDays >= ASK_NUDGE_DAYS, askDismissed],
    ['billScan', hidden.includes('billScan') && expenses.length >= SCAN_NUDGE_AT, scanDismissed],
  ])

  function dismiss() {
    if (feature === 'subscriptions') setSubsDismissed(true)
    else if (feature === 'insights') setInsightsDismissed(true)
    else if (feature === 'wrapped') setWrappedDismissed(true)
    else if (feature === 'askAviary') setAskDismissed(true)
    else if (feature === 'billScan') setScanDismissed(true)
  }

  return { feature, nudge: feature ? FEATURE_NUDGES[feature] : null, hidden, dismiss }
}
