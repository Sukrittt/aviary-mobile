import { useCallback, useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { accessMode } from '@/src/api/accessMode'
import { track } from '@/src/lib/analytics'

const KEY = 'mc-feed-tip'

accessMode.subscribeLogout(() => {
  SecureStore.deleteItemAsync(KEY).catch(() => {})
})

/**
 * Activity's one-time pointer at the feed switch, for when the feed came on
 * by itself (useFeedOn). Gone for good on this device once tried or dismissed.
 */
export function useFeedTip(enabled: boolean) {
  const [done, setDone] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    SecureStore.getItemAsync(KEY)
      .then((v) => live && setDone(v === 'done'))
      .catch(() => live && setDone(false))
    return () => {
      live = false
    }
  }, [])

  const show = enabled && done === false

  useEffect(() => {
    if (show) track('feed_tip', { action: 'shown' })
  }, [show])

  const close = useCallback((action: 'try' | 'dismiss') => {
    track('feed_tip', { action })
    setDone(true)
    SecureStore.setItemAsync(KEY, 'done').catch(() => {})
  }, [])

  return { show, close }
}
