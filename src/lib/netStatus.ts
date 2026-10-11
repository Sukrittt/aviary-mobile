import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { currentUserId } from '@/src/api/accessMode'

// Module-level online flag, flipped by apiFetch (client.ts) itself: true on
// any response at all (even a 4xx — that means the network is up, the server
// just said no). No NetInfo/expo-network: the request path already produces
// this signal, and a background dependency would only ever confirm the same
// thing apiFetch already knows moments later. Same idiom as
// useLogExpenseSubmit.ts's external store.
//
// A single failed/timed-out request is a weak signal on its own — a cold
// backend or one slow parallel call among several isn't a real outage — so
// going offline requires FAILURE_THRESHOLD consecutive failures with no
// success in between. Going back online stays immediate on any success.
//
// Even two failures in a row aren't proof: one dropped socket (resuming from
// the background, a wifi/cellular handover) fails every parallel request at
// once. So before flipping, apiFetch's confirmOffline asks the server once
// more after a short pause, and only a probe that also can't reach it counts.
let online = true
let consecutiveFailures = 0
let confirming = false
const FAILURE_THRESHOLD = 2
const listeners = new Set<() => void>()
const onlineTransitionListeners = new Set<() => void>()

export function setOnline(next: boolean, confirmOffline?: () => Promise<boolean>): void {
  if (next) {
    consecutiveFailures = 0
    if (online) return
    online = true
    listeners.forEach((l) => l())
    onlineTransitionListeners.forEach((l) => l())
    return
  }

  consecutiveFailures += 1
  if (consecutiveFailures < FAILURE_THRESHOLD || !online || confirming) return
  if (!confirmOffline) return goOffline()
  confirming = true
  void confirmOffline()
    .catch(() => true)
    .then((offline) => {
      confirming = false
      // A request that got answered meanwhile already reset the streak.
      if (consecutiveFailures < FAILURE_THRESHOLD) return
      if (offline) goOffline()
      else consecutiveFailures = 0
    })
}

function goOffline(): void {
  if (!online) return
  online = false
  listeners.forEach((l) => l())
}

/** Fires only on a false -> true transition — "we were offline, and now the network answered". */
export function onOnlineTransition(fn: () => void): () => void {
  onlineTransitionListeners.add(fn)
  return () => onlineTransitionListeners.delete(fn)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): boolean {
  return online
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function isOnline(): boolean {
  return online
}

// Namespaced per user (like categoryCache/pendingExpenses) so signing out and
// back in as someone else doesn't show their predecessor's sync time.
const SYNC_PREFIX = 'mc-last-synced'

function syncedKey(): string | null {
  const uid = currentUserId()
  return uid ? `${SYNC_PREFIX}:${uid}` : null
}

/** Called by apiFetch on every successful response, so OfflineScreen can show
 * "last synced" from the most recent moment the app actually reached the server. */
export async function markSynced(): Promise<void> {
  const key = syncedKey()
  if (!key) return
  await AsyncStorage.setItem(key, String(Date.now()))
}

export async function readLastSynced(): Promise<number | null> {
  const key = syncedKey()
  if (!key) return null
  const raw = await AsyncStorage.getItem(key)
  return raw ? Number(raw) : null
}
