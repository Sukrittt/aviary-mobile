import { useCallback, useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { accessMode } from '@/src/api/accessMode'

const KEY = 'mc-balance-check-later'
export const SNOOZE_MS = 24 * 60 * 60 * 1000

/**
 * Whether Home's balance check card was put off with Later in the last day,
 * remembered on this device. Starts `null` (unknown) so the card doesn't
 * flash before the stored time has loaded, and clears on sign-out so the next
 * account on the device isn't hidden by the last one's tap.
 */
export function useBalanceCheckSnooze() {
  const [snoozed, setSnoozed] = useState<boolean | null>(null)

  useEffect(() => {
    let live = true
    SecureStore.getItemAsync(KEY)
      .then((raw) => {
        if (live) setSnoozed(Number(raw) > Date.now())
      })
      .catch(() => {
        if (live) setSnoozed(false)
      })
    const unsubscribe = accessMode.subscribeLogout(() => {
      setSnoozed(false)
      SecureStore.deleteItemAsync(KEY).catch(() => {})
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  const snooze = useCallback(() => {
    setSnoozed(true)
    SecureStore.setItemAsync(KEY, String(Date.now() + SNOOZE_MS)).catch(() => {})
  }, [])

  return [snoozed, snooze] as const
}
