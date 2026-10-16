import { useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { accessMode } from '@/src/api/accessMode'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useUser } from '@/src/hooks/useUser'

export type ActivityView = 'list' | 'feed'

const PREF_KEY = 'mc-activity-view'

/**
 * Activity's List / Feed choice, remembered on this device like Hide amounts.
 * Null until one is made, so Activity can open on the feed once it's turned on in Features.
 */
export function useActivityView() {
  const [view, setViewState] = useState<ActivityView | null>(null)

  useEffect(() => {
    SecureStore.getItemAsync(PREF_KEY)
      .then((stored) => {
        if (stored === 'feed' || stored === 'list') setViewState(stored)
      })
      .catch(() => {})
    // The next account signed into on this device starts fresh.
    return accessMode.subscribeLogout(() => {
      setViewState(null)
      SecureStore.deleteItemAsync(PREF_KEY).catch(() => {})
    })
  }, [])

  const setView = (next: ActivityView) => {
    setViewState(next)
    SecureStore.setItemAsync(PREF_KEY, next).catch(() => {})
  }

  return [view, setView] as const
}

/**
 * Whether Activity offers the feed. Turned on or off in Features wins; until
 * then it comes on by itself once there's an expense with a photo, since
 * that's who the feed is for. `auto` says it came on by itself.
 */
export function useFeedOn() {
  const setting = useUser().data?.activityFeed
  const hasPhoto = useRecentExpenses().data?.some((r) => r.has_photo) === true
  return { on: setting ?? hasPhoto, auto: setting === undefined && hasPhoto }
}
