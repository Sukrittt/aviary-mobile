import AsyncStorage from '@react-native-async-storage/async-storage'
import * as StoreReview from 'expo-store-review'

const COUNT_KEY = 'mc-review-log-count'
const ASKED_KEY = 'mc-review-asked-at'

/** Saved logs on this device before the first ask. */
export const MIN_LOGS = 10
/** Never ask more often than this, whatever Play's own quota allows. */
export const ASK_EVERY_MS = 90 * 24 * 60 * 60 * 1000

let inFlight: Promise<boolean> | null = null

/**
 * Counts one saved expense, then opens Play's in-app review sheet if this
 * device has logged enough and hasn't been asked in the last 90 days. Call
 * only from a calm, positive moment (expense-added's Done), never mid-flow
 * or after an error. Play may still silently skip the sheet and never says
 * whether the user rated, so the result only means "we asked". Never throws.
 *
 * A second call while one is running (a double-tapped Done) joins it rather
 * than counting twice or racing it past the 90-day stamp.
 */
export function recordLogAndMaybeAsk(now = Date.now()): Promise<boolean> {
  inFlight ??= run(now).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(now: number): Promise<boolean> {
  try {
    const [[, rawCount], [, askedAt]] = await AsyncStorage.multiGet([COUNT_KEY, ASKED_KEY])
    const count = (Number(rawCount) || 0) + 1
    await AsyncStorage.setItem(COUNT_KEY, String(count))
    if (count < MIN_LOGS) return false
    if (askedAt && now - Number(askedAt) < ASK_EVERY_MS) return false
    // hasAction() is also true whenever app.json has a playStoreUrl, and then
    // requestReview() without the native module jumps straight to the Play
    // listing. isAvailableAsync() makes sure it's the in-app sheet or nothing.
    if (!(await StoreReview.hasAction()) || !(await StoreReview.isAvailableAsync())) return false
    // Stamped before asking so a throwing request still counts as an ask
    // rather than retrying on every Done.
    await AsyncStorage.setItem(ASKED_KEY, String(now))
    await StoreReview.requestReview()
    return true
  } catch {
    return false
  }
}
