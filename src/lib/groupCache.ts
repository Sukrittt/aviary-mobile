import { readEncrypted, writeEncrypted } from './encryptedStorage'
import { budgetKeySuffix } from './activeBudget'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { currentUserId } from '@/src/api/accessMode'

const PREFIX = 'mc-group-cache'

function key(): string | null {
  const uid = currentUserId()
  return uid ? `${PREFIX}:${uid}${budgetKeySuffix()}` : null
}

/** Reads the last-known group list for the signed-in user, or null (guest, or never cached). */
export async function readGroupCache(): Promise<string[] | null> {
  const k = key()
  if (!k) return null
  try { return await readEncrypted<string[]>(k) } catch { return null }
}

/** Written on every successful fetch, so cache and server never drift. */
async function writeGroups(groups: string[]): Promise<void> {
  const k = key()
  if (!k) return
  await writeEncrypted(k, groups)
}

async function clearGroups(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(`${PREFIX}:`))
  await AsyncStorage.multiRemove(keys)
}

let chain: Promise<unknown> = Promise.resolve()
export function writeGroupCache(groups: string[]): Promise<void> {
  const operation = chain.then(() => writeGroups(groups))
  chain = operation.catch(() => {})
  return operation
}
export function clearGroupCache(): Promise<void> {
  const operation = chain.then(clearGroups)
  chain = operation.catch(() => {})
  return operation
}
