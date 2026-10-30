import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { accessMode } from '@/src/api/accessMode'

const KEY = 'aviary-last-manual-log'
const DAY_MS = 86_400_000
/** A week's gap is a normal logger. Two weeks and they may have forgotten that + saves. */
export const ADD_HINT_GAP_DAYS = 14

// Otherwise the next account signed into on this device inherits the clock.
accessMode.subscribeLogout(() => {
  AsyncStorage.removeItem(KEY).catch(() => {})
})

/** Called when log-expense saves a new spend. Imports, scans and Ask Aviary don't count: they don't use this form. */
export function noteHandLog(at: number = Date.now()): void {
  AsyncStorage.setItem(KEY, String(at)).catch(() => {})
}

/**
 * First expense ever, or none by hand for ADD_HINT_GAP_DAYS. A device with no
 * log of its own goes by the account's first expense, so the worst case is one
 * extra hint.
 */
export function addHintDue(stored: string | null, firstLoggedAt: string | null | undefined, now: number): boolean {
  const last = stored ? Number(stored) : firstLoggedAt ? Date.parse(firstLoggedAt) : null
  return last === null || now - last >= ADD_HINT_GAP_DAYS * DAY_MS
}

/** Whether log-expense should point at + as the save button, read afresh on each visit. */
export function useAddHint(user: { manualTransactionCompletedAt?: string | null } | undefined, onForm: boolean): boolean {
  const [stored, setStored] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!onForm) return
    let live = true
    AsyncStorage.getItem(KEY)
      .then((raw) => live && setStored(raw))
      .catch(() => live && setStored(null))
    return () => {
      live = false
    }
  }, [onForm])
  if (!user || stored === undefined) return false
  // eslint-disable-next-line react-hooks/purity -- a day-scale gap, a stale render can't matter
  return addHintDue(stored, user.manualTransactionCompletedAt, Date.now())
}
