import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query'
import type { Persister } from '@tanstack/react-query-persist-client'
import * as Application from 'expo-application'
import * as Updates from 'expo-updates'
import { readEncrypted, writeEncrypted } from './encryptedStorage'
import { budgetKeySuffix, restoreActiveBudget } from './activeBudget'

// What a cold start paints from before the network answers. Screens still
// refetch in the background (each hook's staleTime), so this is a fast first
// paint, not a stale-forever cache. Billing and system status are left out on
// purpose: a stale "subscription required" or kill switch must never be served.
const PERSISTED = new Set([
  'budgets',
  'expenses',
  'categories',
  'groups',
  'user',
  'subscriptions',
  'holdings',
  'holding-events',
  'recurring-expenses',
  'category-map',
  'balance-check',
  'spaces',
])

export const PERSIST_MAX_AGE = 24 * 60 * 60_000

export function shouldPersistQuery(query: Query): boolean {
  const [root] = query.queryKey
  // ['expenses'] alone is all-time history (Insights only): too big for AsyncStorage.
  if (root === 'expenses' && query.queryKey.length === 1) return false
  // Activity's first page only. Every other page, search and filter is its own
  // key, and saving them all would grow the snapshot with every browse.
  // The photo feed's signed URLs expire within the hour; a restored one would 403.
  if (root === 'expenses' && query.queryKey[1] === 'feed') return false
  if (root === 'expenses' && query.queryKey[1] === 'page') {
    const params = query.queryKey[2] as { page?: number; q?: string; category?: string }
    if (params.page !== 1 || params.q || params.category) return false
  }
  return typeof root === 'string' && PERSISTED.has(root) && defaultShouldDehydrateQuery(query)
}

// Expenses, budgets and holdings are financial data: sealed like the other
// offline caches (see encryptedStorage). An unreadable snapshot reads as none.
//
// Query keys carry no budget, so each budget gets its own snapshot
// (`rq-cache:<spaceId>`, plain `rq-cache` for the personal one) and a switch
// swaps them (lib/budgetSwitch.ts). One persister per key: the library
// throttles writes, so a save requested for budget A while the switch to B
// is in flight must still land under A's key, not whichever is active when
// the throttle fires. Reads wait for the last used budget so a cold start
// restores the right one.
const persisters = new Map<string, Persister>()
function persisterFor(suffix: string): Persister {
  let p = persisters.get(suffix)
  if (!p) {
    const key = `rq-cache${suffix}`
    p = createAsyncStoragePersister({
      key,
      storage: {
        getItem: () => readEncrypted<string>(key).catch(() => null),
        setItem: (_, value) => writeEncrypted(key, value),
        removeItem: () => AsyncStorage.removeItem(key),
      },
    })
    persisters.set(suffix, p)
  }
  return p
}

// Set while a budget switch runs: the active budget (and so the key) flips
// before the cache does, so a save then would file the old budget's data
// under the new one's key, and the switch would restore it from there.
let paused = false
export function pausePersist(next: boolean): void {
  paused = next
}

export const queryPersister: Persister = {
  persistClient: (client) => (paused ? undefined : persisterFor(budgetKeySuffix()).persistClient(client)),
  restoreClient: async () => {
    await restoreActiveBudget()
    return persisterFor(budgetKeySuffix()).restoreClient()
  },
  removeClient: () => persisterFor(budgetKeySuffix()).removeClient(),
}

/** Sign-out: every budget's snapshot goes, not just the active one's. */
export async function removeAllQuerySnapshots(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k === 'rq-cache' || k.startsWith('rq-cache:'))
  await AsyncStorage.multiRemove(keys)
}

export const persistOptions = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE,
  // A new build or OTA update may change response shapes; start clean rather than render an old one.
  buster: [Application.nativeApplicationVersion, Application.nativeBuildVersion, Updates.updateId].join(':'),
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
}
