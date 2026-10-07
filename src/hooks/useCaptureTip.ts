import { useCallback, useEffect, useRef, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { accessMode } from '@/src/api/accessMode'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { track } from '@/src/lib/analytics'
import { captureTipReason, clearManualLogs, parseTipState, recentManualLogs, type CaptureTipReason, type CaptureTipState } from '@/src/lib/captureTip'
import { todayLocal } from '@/src/lib/date'

const KEY = 'mc-capture-tip'

// Once per app, not per screen: signing out anywhere clears the tip's memory for the next account.
accessMode.subscribeLogout(() => {
  clearManualLogs()
  SecureStore.deleteItemAsync(KEY).catch(() => {})
})

/**
 * Whether log-expense should point at logging several spends at once right
 * now (src/lib/captureTip.ts), decided once per visit and remembered on this
 * device. Cleared on sign-out so the next account starts fresh.
 */
export function useCaptureTip(enabled: boolean) {
  const rows = useRecentExpenses().data
  const [state, setState] = useState<CaptureTipState | null>(null)
  useEffect(() => {
    let live = true
    SecureStore.getItemAsync(KEY)
      .then((raw) => live && setState(parseTipState(raw)))
      .catch(() => live && setState(parseTipState(null)))
    return () => {
      live = false
    }
  }, [])

  // Decided once per visit: undefined until the stored state and the expenses are in.
  const [decided, setDecided] = useState<CaptureTipReason | null | undefined>(undefined)
  const [closed, setClosed] = useState(false)
  const recorded = useRef(false)

  if (decided === undefined && enabled && state && rows) {
    // eslint-disable-next-line react-hooks/purity -- read once, when deciding
    setDecided(captureTipReason({ rows, today: todayLocal(), now: Date.now(), manualLogs: recentManualLogs(), state }))
  }
  const reason = closed ? null : (decided ?? null)

  useEffect(() => {
    if (!decided || !state || recorded.current) return
    recorded.current = true
    track('capture_tip', { action: 'shown', reason: decided })
    SecureStore.setItemAsync(KEY, JSON.stringify({ ...state, shown: state.shown + 1, lastShown: Date.now() })).catch(() => {})
  }, [decided, state])

  const close = useCallback(
    (action: 'try' | 'dismiss') => {
      if (!reason) return
      track('capture_tip', { action, reason })
      setClosed(true)
      if (action === 'try') {
        SecureStore.getItemAsync(KEY)
          .then((raw) => SecureStore.setItemAsync(KEY, JSON.stringify({ ...parseTipState(raw), done: true })))
          .catch(() => {})
      }
    },
    [reason],
  )

  return { reason, close }
}
