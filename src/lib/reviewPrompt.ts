import AsyncStorage from '@react-native-async-storage/async-storage'
import * as StoreReview from 'expo-store-review'

const COUNT_KEY = 'mc-review-log-count'
const ASKED_KEY = 'mc-review-asked-at'

/** Successful logs on this device before the first ask. */
export const MIN_LOGS = 10
/** Never ask more often than this, whatever Play's own quota allows. */
export const ASK_EVERY_MS = 90 * 24 * 60 * 60 * 1000

/** Counts one successful expense add. Never throws. */
export async function recordExpenseLogged(): Promise<void> {
  try {
    const n = Number(await AsyncStorage.getItem(COUNT_KEY)) || 0
    await AsyncStorage.setItem(COUNT_KEY, String(n + 1))
  } catch {}
}

/**
 * Opens Play's in-app review sheet if this device has logged enough and
 * hasn't been asked in the last 90 days. Call only from a calm, positive
 * moment (expense-added's Done), never mid-flow or after an error. Play may
 * still silently skip the sheet and never says whether the user rated, so
 * the result only means "we asked". Never throws.
 */
export async function maybeAskForReview(now = Date.now()): Promise<boolean> {
  try {
    const [[, count], [, askedAt]] = await AsyncStorage.multiGet([COUNT_KEY, ASKED_KEY])
    if ((Number(count) || 0) < MIN_LOGS) return false
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
