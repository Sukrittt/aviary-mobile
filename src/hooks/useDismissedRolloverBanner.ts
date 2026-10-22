import { useEffect, useRef, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { accessMode } from '@/src/api/accessMode'

/**
 * Whether the "left over from last month" banner has been dismissed,
 * remembered on this device. Drop-in for `useState(false)` — same tuple,
 * same setter. Keyed by the month the banner is about, so next month's
 * banner starts undismissed on its own without any reset logic here.
 *
 * Starts `null` (unknown) rather than `false` so callers don't flash the
 * banner before the stored value has loaded.
 */
export function useDismissedRolloverBanner(monthKey: string) {
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  // Nothing is written until the stored value has landed — the initial
  // false would otherwise overwrite it on every mount.
  const hydrated = useRef(false)
  const key = `mc-rollover-dismissed-${monthKey}`

  // Reset to "unknown" during render (not in the effect below) when the
  // month changes, so the previous month's answer never flashes for the
  // new one while its own stored value is still loading.
  const prevKey = useRef(key)
  if (prevKey.current !== key) {
    prevKey.current = key
    hydrated.current = false
    setDismissed(null)
  }

  useEffect(() => {
    hydrated.current = false
    // A read for a key we've since moved off must not land on the new one.
    let stale = false
    SecureStore.getItemAsync(key)
      .then((raw) => {
        if (!stale) setDismissed(raw === '1')
      })
      .catch(() => {})
      .finally(() => {
        if (!stale) hydrated.current = true
      })

    // Otherwise the next account signed into on this device inherits the
    // previous one's dismissal.
    const unsubscribe = accessMode.subscribeLogout(() => {
      hydrated.current = false
      setDismissed(false)
      SecureStore.deleteItemAsync(key).catch(() => {})
    })
    return () => {
      stale = true
      unsubscribe()
    }
  }, [key])

  useEffect(() => {
    if (!hydrated.current) return
    if (dismissed) SecureStore.setItemAsync(key, '1').catch(() => {})
  }, [dismissed, key])

  return [dismissed, setDismissed] as const
}
