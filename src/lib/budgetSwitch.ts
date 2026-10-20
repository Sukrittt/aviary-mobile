import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'
import { activeBudgetId, saveActiveBudget } from './activeBudget'
import { PERSIST_MAX_AGE, persistOptions, queryPersister } from './queryPersist'
import { readCategoryCache } from './categoryCache'
import { readGroupCache } from './groupCache'
import { onOnlineTransition } from './netStatus'

// A switch made offline can't fetch the budget it opened: try again when the network's back.
let refetchWhenOnline: (() => void) | null = null

/**
 * Opens another budget. Query keys carry no budget, so this swaps the whole
 * cache: the open budget's snapshot is saved under its own key, the target's
 * is painted from disk (instant when it was opened before), and everything
 * refetches in the background. `clear()` also orphans any request still in
 * flight for the old budget, so a late answer can't land on the new one.
 * The budget list is the same in every budget, so it rides across.
 */
export async function switchBudget(queryClient: QueryClient, uid: string, spaceId: string | null): Promise<void> {
  const next = !spaceId || spaceId === uid ? null : spaceId
  if (next === activeBudgetId()) return

  await queryClient.cancelQueries()
  // The provider saves on a throttle, so save this budget's now.
  await queryPersister.persistClient({
    timestamp: Date.now(),
    buster: persistOptions.buster,
    clientState: dehydrate(queryClient, persistOptions.dehydrateOptions),
  })
  const spaces = queryClient.getQueryData(['spaces'])

  await saveActiveBudget(uid, next)
  let snapshot: Awaited<ReturnType<typeof queryPersister.restoreClient>>
  try {
    snapshot = await queryPersister.restoreClient()
  } catch {
    snapshot = undefined
  }
  queryClient.clear()
  if (snapshot && snapshot.buster === persistOptions.buster && Date.now() - snapshot.timestamp < PERSIST_MAX_AGE) {
    hydrate(queryClient, snapshot.clientState)
  }
  if (spaces !== undefined) queryClient.setQueryData(['spaces'], spaces)
  // The offline pickers' own caches, for a budget never opened while online.
  const [categories, groups] = await Promise.all([readCategoryCache(), readGroupCache()])
  if (categories && queryClient.getQueryData(['categories']) === undefined) queryClient.setQueryData(['categories'], categories)
  if (groups && queryClient.getQueryData(['groups']) === undefined) queryClient.setQueryData(['groups'], groups)
  void queryClient.invalidateQueries()
  refetchWhenOnline?.()
  refetchWhenOnline = onOnlineTransition(() => {
    refetchWhenOnline?.()
    refetchWhenOnline = null
    void queryClient.invalidateQueries()
  })
}
