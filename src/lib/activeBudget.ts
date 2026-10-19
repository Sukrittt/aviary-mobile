import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * The budget this device is working in. Null is the personal budget, which
 * the API serves to any request that names no budget, so a device with one
 * budget sends exactly what it sent before budgets existed.
 */
export const BUDGET_HEADER = 'x-aviary-budget'

// One per device, with the account it belongs to, so the persisted query
// cache can be read before the session is: see `restoreActiveBudget`.
const STORAGE_KEY = 'aviary-active-budget'

let active: string | null = null
let owner: string | null = null

export function activeBudgetId(): string | null {
  return active
}

const listeners = new Set<() => void>()

/** For useSyncExternalStore: the budget chip and log sheet re-render on a switch. */
export function subscribeActiveBudget(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setActiveBudget(id: string | null): void {
  if (id === active) return
  active = id
  listeners.forEach((l) => l())
}

/** Headers that pin one request to `spaceId`, whatever is active when it's sent. */
export function budgetHeaders(spaceId: string | null | undefined): Record<string, string> {
  return spaceId ? { [BUDGET_HEADER]: spaceId } : {}
}

/**
 * Suffix for anything cached per budget on this device (the query snapshot,
 * categories, groups, currency). Empty for the personal budget, so the keys
 * every device already has stay the personal budget's.
 */
export function budgetKeySuffix(sep = ':'): string {
  return active ? `${sep}${active}` : ''
}

let restoring: Promise<void> | null = null

/**
 * Reads the last used budget once per launch. The query cache persister waits
 * on this before reading its snapshot, so a cold start paints the budget the
 * person was last in, not their personal one.
 */
export function restoreActiveBudget(): Promise<void> {
  restoring ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      const saved = raw ? (JSON.parse(raw) as { uid?: string; spaceId?: string | null }) : null
      owner = saved?.uid ?? null
      setActiveBudget(saved?.spaceId ?? null)
    })
    .catch(() => {})
  return restoring
}

/** Once the session is known: a saved budget from another account on this device doesn't carry over. */
export function forgetActiveBudgetUnlessOwnedBy(uid: string | null): void {
  if (owner && owner !== uid) {
    setActiveBudget(null)
    owner = null
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
  }
}

/** Remembers the budget per device. Null (personal) clears it. */
export async function saveActiveBudget(uid: string, spaceId: string | null): Promise<void> {
  setActiveBudget(spaceId)
  owner = uid
  if (spaceId) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ uid, spaceId }))
  else await AsyncStorage.removeItem(STORAGE_KEY)
}

/** Sign-out: the next account on this device starts on its own personal budget. */
export async function clearActiveBudget(): Promise<void> {
  setActiveBudget(null)
  owner = null
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
}
