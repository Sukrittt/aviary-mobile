import { notifyManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addCategory,
  deleteCategory,
  getCategories,
  moveCategory,
  updateCategory,
} from '@/src/api/categories'
import type { CategoryRow } from '@/src/types'
import { track } from '@/src/lib/analytics'
import { readCategoryCache, writeCategoryCache } from '@/src/lib/categoryCache'
import { isTransportFailure } from '@/src/api/client'

const key = ['categories'] as const

/**
 * Write-through cache point for the category list. Every fetch that lands
 * here — the initial mount, and the refetch `invalidateQueries` triggers
 * after any category mutation's `onSuccess` below — persists the fresh list,
 * so log-expense's offline picker is never more than one successful fetch
 * stale. One write site instead of one per mutation, since invalidate already
 * routes every write back through this queryFn.
 */
async function getCategoriesAndCache(): Promise<CategoryRow[]> {
  try {
    const categories = await getCategories()
    // Best effort: the list is already in hand and belongs on screen. A cache
    // write that throws (no keystore, no AES) must not turn a successful fetch
    // into an error state — it only costs the next boot its offline picker.
    try {
      await writeCategoryCache(categories)
    } catch (err) {
      if (__DEV__) console.log('[offline-cache] WRITE FAILED', err)
    }
    return categories
  } catch (err) {
    // Offline: answer with the last list from disk instead of an error, which
    // is what leaves log-expense with an empty picker and no way to file the
    // expense. The boot hydration in app/_layout.tsx only covers a cold start
    // — every refetch after it (a stale query, a mutation's invalidate) lands
    // here, so this is the durable half of the same guarantee.
    if (!isTransportFailure(err)) throw err
    const cached = await readCategoryCache()
    if (!cached) throw err
    return cached
  }
}

// Categories sharing a group are stored contiguously; toIndex is the target position
// within that group's slice, matching how moveCategory/the backend interpret it.
function reorderWithinGroup(categories: CategoryRow[], name: string, toIndex: number): CategoryRow[] {
  const moved = categories.find((c) => c.name === name)
  if (!moved) return categories
  const group = moved.group || ''
  const groupItems = categories.filter((c) => (c.group || '') === group)
  const fromIndex = groupItems.findIndex((c) => c.name === name)
  if (fromIndex === -1) return categories
  const reordered = [...groupItems]
  const [item] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, item)

  const result: CategoryRow[] = []
  let inserted = false
  for (const c of categories) {
    if ((c.group || '') === group) {
      if (!inserted) {
        result.push(...reordered)
        inserted = true
      }
    } else {
      result.push(c)
    }
  }
  return result
}

export function useCategories() {
  return useQuery({ queryKey: key, queryFn: getCategoriesAndCache, staleTime: 30_000 })
}

export function useAddCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; group?: string }) => addCategory(params.name, params.group),
    onSuccess: (_data, params) => {
      // Envelopes get created from two places: the setup wizard and the
      // inline "new category" row inside log-expense. $screen_name tells them
      // apart, and `grouped` says whether people use groups at all.
      track('envelope_created', { grouped: !!params.group })
      qc.invalidateQueries({ queryKey: key })
    },
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; updates: { newName?: string; group?: string; alertPcts?: number[] | null } }) =>
      updateCategory(params.name, params.updates),
    onSuccess: async (_data, { name, updates }) => {
      const newName = updates.newName?.trim()
      if (!newName || newName === name) {
        await qc.invalidateQueries({ queryKey: key })
        return
      }

      // The server cascades a rename. Reconcile the cached joins together before
      // refetching, so Home and widgets retain the same amounts even offline.
      const prefixes = [key, ['budgets'], ['expenses'], ['recurring-expenses'],
        ['bill-scans'], ['category-map'], ['recurring-suggestions'], ['ai-brief']]
      await Promise.all(prefixes.map((queryKey) => qc.cancelQueries({ queryKey })))
      notifyManager.batch(() => {
        qc.setQueriesData<CategoryRow[]>({ queryKey: key }, (rows) =>
          rows?.map((row) => row.name === name ? { ...row, name: newName } : row),
        )
        for (const queryKey of prefixes.slice(1, -1)) {
          qc.setQueriesData({ queryKey }, (data: unknown) => renameCategoryReferences(data, name, newName))
        }
      })
      const categories = qc.getQueryData<CategoryRow[]>(key)
      if (categories) {
        // A transport failure during revalidation falls back to this disk list.
        // Persist the rename first so that fallback cannot restore the old join.
        try { await writeCategoryCache(categories) } catch (err) {
          if (__DEV__) console.log('[offline-cache] WRITE FAILED', err)
        }
      }
      await Promise.all(prefixes.map((queryKey) => qc.invalidateQueries({ queryKey })))
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => deleteCategory(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useMoveCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; toIndex: number }) => moveCategory(params.name, params.toIndex),
    onMutate: (params) => {
      // Don't await cancelQueries — the optimistic write must land in the same tick as the
      // drop, or the list flashes back to the old order for a frame before this applies.
      qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CategoryRow[]>(key)
      if (previous) {
        qc.setQueryData<CategoryRow[]>(key, reorderWithinGroup(previous, params.name, params.toIndex))
      }
      return { previous }
    },
    onError: (_err, _params, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

/** Rows, recent/page wrappers, duplicate pairs, and suggestion inputs share category fields. */
function renameCategoryReferences(data: unknown, name: string, newName: string): unknown {
  if (Array.isArray(data)) return data.map((row) => renameCategoryReferences(row, name, newName))
  if (!data || typeof data !== 'object') return data
  return Object.fromEntries(Object.entries(data).map(([field, value]) => {
    if (field === 'category' && value === name) return [field, newName]
    if (field === 'lastSpent' && value && typeof value === 'object') {
      return [field, Object.fromEntries(Object.entries(value).map(([category, date]) =>
        [category === name ? newName : category, date],
      ))]
    }
    if (field === 'words' && value && typeof value === 'object') {
      return [field, Object.fromEntries(Object.entries(value).map(([word, category]) =>
        [word, category === name ? newName : category],
      ))]
    }
    return [field, renameCategoryReferences(value, name, newName)]
  }))
}
