import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query'
import * as Application from 'expo-application'
import * as Updates from 'expo-updates'
import { readEncrypted, writeEncrypted } from './encryptedStorage'

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
])

export const PERSIST_MAX_AGE = 24 * 60 * 60_000

export function shouldPersistQuery(query: Query): boolean {
  const [root] = query.queryKey
  // ['expenses'] alone is all-time history (Insights only): too big for AsyncStorage.
  if (root === 'expenses' && query.queryKey.length === 1) return false
  // Activity's first page only. Every other page, search and filter is its own
  // key, and saving them all would grow the snapshot with every browse.
  if (root === 'expenses' && query.queryKey[1] === 'page') {
    const params = query.queryKey[2] as { page?: number; q?: string; category?: string }
    if (params.page !== 1 || params.q || params.category) return false
  }
  return typeof root === 'string' && PERSISTED.has(root) && defaultShouldDehydrateQuery(query)
}

// Expenses, budgets and holdings are financial data: sealed like the other
// offline caches (see encryptedStorage). An unreadable snapshot reads as none.
export const queryPersister = createAsyncStoragePersister({
  key: 'rq-cache',
  storage: {
    getItem: (key) => readEncrypted<string>(key).catch(() => null),
    setItem: (key, value) => writeEncrypted(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
  },
})

export const persistOptions = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE,
  // A new build or OTA update may change response shapes; start clean rather than render an old one.
  buster: [Application.nativeApplicationVersion, Application.nativeBuildVersion, Updates.updateId].join(':'),
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
}
