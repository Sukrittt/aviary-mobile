import * as SecureStore from 'expo-secure-store'
import { currentUserId } from '@/src/api/accessMode'
import { resolveCurrency } from './currencies'
const key = (id: string) => `mc-currency-${id}`
export async function readCurrencyPreference(): Promise<string> {
  const id = currentUserId()
  if (!id) return 'INR'
  try { return resolveCurrency(await SecureStore.getItemAsync(key(id))) } catch { return 'INR' }
}
export async function writeCurrencyPreference(code: unknown, userId = currentUserId()): Promise<void> {
  if (userId) await SecureStore.setItemAsync(key(userId), resolveCurrency(code)).catch(() => {})
}
// Many Indian phones run an en-US locale, so the timezone is the better hint there.
// ponytail: India-only map, add zones here if other markets show the same mismatch.
const TIMEZONE_CURRENCY: Record<string, string> = { 'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR' }
export function deviceCurrency(timeZone: string | undefined, localeCurrency: string | null | undefined) {
  return resolveCurrency((timeZone && TIMEZONE_CURRENCY[timeZone]) ?? localeCurrency)
}
