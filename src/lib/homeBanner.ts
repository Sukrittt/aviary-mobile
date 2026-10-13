import type { Href } from 'expo-router'

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

export type NudgeFeature = 'subscriptions' | 'insights' | 'wrapped' | 'askAviary' | 'billScan'

/** How many logged expenses earn the Insights nudge. */
export const INSIGHTS_NUDGE_AT = 30
/** How many days with a logged expense earn the Ask Aviary nudge. */
export const ASK_NUDGE_DAYS = 7
/** How many logged expenses earn the Scan a bill nudge. */
export const SCAN_NUDGE_AT = 10

/** One-line offers for a hidden feature, shown when the app has data it'd use. */
export const FEATURE_NUDGES: Record<NudgeFeature, { message: string; href: Href }> = {
  subscriptions: { message: 'Looks like you pay for a few subscriptions. Want them in one place?', href: '/subscriptions' },
  insights: { message: `You've logged ${INSIGHTS_NUDGE_AT} expenses. Insights can show you where it all goes.`, href: '/insights' },
  wrapped: { message: "Last month's Wrapped is ready. Want to see your recap?", href: '/wrapped' },
  askAviary: { message: "You've logged a week of spending. Ask Aviary can answer questions about it.", href: '/modals/money-brain' },
  billScan: { message: 'Got a receipt? Scan it and skip the typing.', href: { pathname: '/more', params: { scan: '1' } } },
}
