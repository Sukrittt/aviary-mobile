/**
 * Home shows one banner at a time. Candidates go in priority order as
 * [kind, applies, dismissed]; `dismissed` is null while its stored value is
 * still loading. The first that applies wins, and an unknown one holds the
 * slot empty so a lower banner never flashes before it.
 */
export function firstBanner<K extends string>(candidates: [K, boolean, boolean | null][]): K | null {
  for (const [kind, applies, dismissed] of candidates) {
    if (!applies || dismissed === true) continue
    return dismissed === false ? kind : null
  }
  return null
}

export type NudgeFeature = 'subscriptions' | 'insights' | 'wrapped'

/** How many logged expenses earn the Insights nudge. */
export const INSIGHTS_NUDGE_AT = 30

/** One-line offers for a hidden feature, shown when the app has data it'd use. */
export const FEATURE_NUDGES: Record<NudgeFeature, { message: string; href: '/subscriptions' | '/insights' | '/wrapped' }> = {
  subscriptions: { message: 'Looks like you pay for a few subscriptions. Want them in one place?', href: '/subscriptions' },
  insights: { message: `You've logged ${INSIGHTS_NUDGE_AT} expenses. Insights can show you where it all goes.`, href: '/insights' },
  wrapped: { message: "Last month's Wrapped is ready. Want to see your recap?", href: '/wrapped' },
}
