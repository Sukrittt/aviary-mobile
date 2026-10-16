import { useEffect } from 'react'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getWeekRecap, markWeekRecapSeen } from '@/src/api/weekRecap'
import { currentUserId } from '@/src/api/accessMode'
import type { UserProfile } from '@/src/api/account'
import { userKey } from '@/src/hooks/useUser'

export const weekRecapKey = ['week-recap'] as const

// The server's window (Web/lib/weekRecap.ts): learning on days 1 to 7, due
// through day 15. A day of slack covers the user's timezone.
// ponytail: mirrors DUE_DAYS there by hand. If the server's window grows,
// grow this too, or accounts past day 16 stop asking.
const RECAP_WINDOW_MS = 16 * 86_400_000

/** False once the profile proves the recap can never show again: seen, or onboarded past its window. */
export function recapMayShow(user: UserProfile | undefined, now = Date.now()): boolean {
  if (!user) return true
  if (user.weekRecapSeenAt) return false
  return !user.onboardedAt || now - Date.parse(user.onboardedAt) < RECAP_WINDOW_MS
}

export function useWeekRecap() {
  const qc = useQueryClient()
  // Answered locally once the cached profile rules the recap out, which is
  // every account past its first two weeks: asking the server on each return
  // to the app only ever came back `due: false`.
  const queryFn = (): ReturnType<typeof getWeekRecap> => (recapMayShow(qc.getQueryData<UserProfile>(userKey)) ? getWeekRecap() : Promise.resolve({ due: false }))
  // Rechecked on return to the app once 5 minutes old, and every 15 minutes,
  // so Home left open across midnight moves on to the next day (or to the recap).
  return useQuery({ queryKey: weekRecapKey, queryFn, staleTime: 5 * 60_000, refetchInterval: 15 * 60_000, retry: false, refetchOnWindowFocus: true })
}

/** Marks it seen, retrying a few times, then drops the cached `due` so nothing in this session reopens it. */
export function useMarkWeekRecapSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: markWeekRecapSeen,
    retry: 3,
    onSuccess: () => qc.setQueryData(weekRecapKey, { due: false }),
  })
}

// The account whose recap was opened this session, so a notification tap and
// the gate don't both open it. Per account: a sign-in as someone else in the
// same session still gets theirs.
let openedFor: string | null = null
export function markRecapOpened(): void {
  openedFor = currentUserId()
}

/**
 * Opens the first-week recap on its own, once, the first time it's due on any
 * device. There's no button for it anywhere: once seen, the server stops
 * reporting it due. Rechecks on returns to the app, so a session that
 * spans day 7 still gets it.
 */
export function useWeekRecapGate(): void {
  // Rechecks on returns to the app via useWeekRecap's refetchOnWindowFocus.
  const { data } = useWeekRecap()

  useEffect(() => {
    if (!data?.due || !data.recap || openedFor === currentUserId()) return
    markRecapOpened()
    router.push('/recap')
  }, [data])
}
