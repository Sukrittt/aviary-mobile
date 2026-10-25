import { apiFetch } from './client'

/** Twin of Web's src/api/referrals.ts (and lib/referrals.ts's ReferralSummary). */
export interface ReferralSummary {
  code: string
  link: string
  joined: number
  activated: number
  monthsEarned: number
  referredBy: string | null
}

export const referralsKey = ['referrals'] as const

export async function getReferrals(): Promise<ReferralSummary> {
  const res = await apiFetch('/api/referrals/me')
  if (!res.ok) throw new Error(`referrals ${res.status}`)
  return res.json()
}

/** What the share sheet sends. Same words on Web. */
export function shareMessage(link: string): string {
  return `I plan my spending with Aviary. It tells me what I can still spend this month. Sign up with my link and we both get a month of Pro: ${link}`
}
