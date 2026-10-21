import { readEncrypted, writeEncrypted } from './encryptedStorage'
import { budgetKeySuffix } from './activeBudget'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { currentUserId } from '@/src/api/accessMode'
import type { CategoryRow } from '@/src/types'

const PREFIX = 'mc-category-cache'

function key(): string | null {
  const uid = currentUserId()
  return uid ? `${PREFIX}:${uid}${budgetKeySuffix()}` : null
}

/** Reads the last-known category list for the signed-in user, or null (guest, or never cached). */
export async function readCategoryCache(): Promise<CategoryRow[] | null> {
  const k = key()
  if (!k) return null
  try { return await readEncrypted<CategoryRow[]>(k) } catch { return null }
}

/** Written on every successful fetch and every category mutation, so cache and server never drift. */
async function writeCategories(categories: CategoryRow[]): Promise<void> {
  const k = key()
  if (!k) return
  await writeEncrypted(k, categories)
}

async function clearCategories(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(`${PREFIX}:`))
  await AsyncStorage.multiRemove(keys)
}

let chain: Promise<unknown> = Promise.resolve()
export function writeCategoryCache(categories: CategoryRow[]): Promise<void> {
  const operation = chain.then(() => writeCategories(categories))
  chain = operation.catch(() => {})
  return operation
}
export function clearCategoryCache(): Promise<void> {
  const operation = chain.then(clearCategories)
  chain = operation.catch(() => {})
  return operation
}
