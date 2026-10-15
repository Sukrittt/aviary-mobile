import { useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { accessMode } from '@/src/api/accessMode'

export type ActivityView = 'list' | 'feed'

const PREF_KEY = 'mc-activity-view'

/** Activity's List / Feed choice, remembered on this device like Hide amounts. */
export function useActivityView() {
  const [view, setViewState] = useState<ActivityView>('list')

  useEffect(() => {
    SecureStore.getItemAsync(PREF_KEY)
      .then((stored) => {
        if (stored === 'feed') setViewState('feed')
      })
      .catch(() => {})
    // The next account signed into on this device starts on the list.
    return accessMode.subscribeLogout(() => {
      setViewState('list')
      SecureStore.deleteItemAsync(PREF_KEY).catch(() => {})
    })
  }, [])

  const setView = (next: ActivityView) => {
    setViewState(next)
    SecureStore.setItemAsync(PREF_KEY, next).catch(() => {})
  }

  return [view, setView] as const
}
