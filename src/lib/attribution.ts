// Where this install came from, for the signup it leads to. Twin of
// Web/lib/attribution.ts. Read once from the Play install referrer (the
// `&referrer=` on a Play link, e.g. from useaviary.com/get/android), kept in
// AsyncStorage, and sent as the `x-aviary-attribution` header until the first
// profile load, when the server has either created the account with it or
// ignored it for an existing one.
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Application from 'expo-application'
import { Platform } from 'react-native'

export const ATTRIBUTION_HEADER = 'x-aviary-attribution'
const KEY = 'aviary-attribution'
const READ_KEY = 'aviary-attribution-read'

let pending: string | null = null

/** `utm_source=reddit&utm_campaign=r%2Fx&ref=k7qm4p` → the fields the server keeps. */
export function parseInstallReferrer(raw: string): Record<string, string> {
  const q = new URLSearchParams(raw)
  const out: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const v = q.get(key)?.trim()
    if (v) out[key] = v.slice(0, 64)
  }
  const ref = q.get('ref')?.trim().toUpperCase()
  if (ref && /^[A-Z0-9]{3,16}$/.test(ref)) out.referral_code = ref
  return out
}

async function readReferrer(): Promise<string> {
  // An emulator has no Play install to ask about; this lets a dev build fake one.
  if (__DEV__ && process.env.EXPO_PUBLIC_DEV_INSTALL_REFERRER) return process.env.EXPO_PUBLIC_DEV_INSTALL_REFERRER
  return Application.getInstallReferrerAsync()
}

/**
 * Called once at boot. Reads the install referrer the first time only; a
 * failure (Play services busy) leaves it for the next launch.
 */
export async function captureInstallReferrer(): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    const [stored, read] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(READ_KEY)])
    if (stored) pending = stored
    if (read) return
    const fields = parseInstallReferrer(await readReferrer())
    pending = JSON.stringify(fields)
    await AsyncStorage.multiSet([[KEY, pending], [READ_KEY, '1']])
  } catch {
    // Not a Play install, or the referrer service is unavailable. Nothing to send.
  }
}

/** The header to add to requests while the signup hasn't been reported. */
export function attributionHeaders(): Record<string, string> {
  return pending ? { [ATTRIBUTION_HEADER]: pending } : {}
}

/** The profile loaded, so the account exists and has (or never needed) its source. */
export async function clearAttribution(): Promise<void> {
  if (!pending) return
  pending = null
  await AsyncStorage.removeItem(KEY).catch(() => {})
}
