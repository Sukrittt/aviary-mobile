import { useEffect } from 'react'
import { AppState } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getWeekRecap, markWeekRecapSeen } from '@/src/api/weekRecap'
import { currentUserId } from '@/src/api/accessMode'

export const weekRecapKey = ['week-recap'] as const

export function useWeekRecap() {
  // Also every 15 minutes, so Home left open across midnight moves on to the next day (or to the recap).
  return useQuery({ queryKey: weekRecapKey, queryFn: getWeekRecap, staleTime: Infinity, refetchInterval: 15 * 60_000, retry: false })
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
 * reporting it due. Rechecks on every return to the app, so a session that
 * spans day 7 still gets it.
 */
export function useWeekRecapGate(): void {
  const { data, refetch } = useWeekRecap()

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch()
    })
    return () => sub.remove()
  }, [refetch])

  useEffect(() => {
    if (!data?.due || !data.recap || openedFor === currentUserId()) return
    markRecapOpened()
    router.push('/recap')
  }, [data])
}
