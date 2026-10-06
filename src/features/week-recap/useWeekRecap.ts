import { useEffect } from 'react'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { getWeekRecap } from '@/src/api/weekRecap'

export const weekRecapKey = ['week-recap'] as const

export function useWeekRecap() {
  return useQuery({ queryKey: weekRecapKey, queryFn: getWeekRecap, staleTime: Infinity, retry: false })
}

// Set by the recap screen, so a notification tap and the gate don't both open it.
let opened = false
export function markRecapOpened(): void {
  opened = true
}

/**
 * Opens the first-week recap on its own, once, the first time it's due on any
 * device. There's no button for it anywhere: once seen, the server stops
 * reporting it due.
 */
export function useWeekRecapGate(): void {
  const { data } = useWeekRecap()
  useEffect(() => {
    if (!data?.due || !data.recap || opened) return
    opened = true
    router.push('/recap')
  }, [data])
}
