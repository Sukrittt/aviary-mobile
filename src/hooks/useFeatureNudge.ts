import type { UserProfile } from '@/src/api/account'
import { hiddenFeatures } from '@/src/lib/features'
import { FEATURE_NUDGES, INSIGHTS_NUDGE_AT, firstBanner, type NudgeFeature } from '@/src/lib/homeBanner'
import { useDismissedRolloverBanner } from './useDismissedRolloverBanner'
import { useRecurringSuggestions } from './useRecurringSuggestions'
import { useWrappedStatus } from './useWrapped'

/**
 * At most one offer to turn on a hidden feature, driven by data the app
 * already has: subscription suggestions from a recurring scan, a few dozen
 * logged expenses, or last month's Wrapped unlocking. Each is dismissed for
 * good on this device.
 */
export function useFeatureNudge(user: UserProfile | undefined, expenseCount: number) {
  const hidden = user ? hiddenFeatures(user) : []
  const [subsDismissed, setSubsDismissed] = useDismissedRolloverBanner('nudge-subscriptions')
  const [insightsDismissed, setInsightsDismissed] = useDismissedRolloverBanner('nudge-insights')
  const [wrappedDismissed, setWrappedDismissed] = useDismissedRolloverBanner('nudge-wrapped')

  const wantSubs = hidden.includes('subscriptions') && subsDismissed === false
  const wantWrapped = hidden.includes('wrapped') && wrappedDismissed === false
  const suggestions = useRecurringSuggestions(6, wantSubs).data?.suggestions
  const wrapped = useWrappedStatus(wantWrapped).data

  const feature = firstBanner<NudgeFeature>([
    ['subscriptions', hidden.includes('subscriptions') && !!suggestions?.some((s) => s.kind === 'subscription'), subsDismissed],
    ['insights', hidden.includes('insights') && expenseCount >= INSIGHTS_NUDGE_AT, insightsDismissed],
    ['wrapped', hidden.includes('wrapped') && !!wrapped?.available, wrappedDismissed],
  ])

  function dismiss() {
    if (feature === 'subscriptions') setSubsDismissed(true)
    else if (feature === 'insights') setInsightsDismissed(true)
    else if (feature === 'wrapped') setWrappedDismissed(true)
  }

  return { feature, nudge: feature ? FEATURE_NUDGES[feature] : null, hidden, dismiss }
}
