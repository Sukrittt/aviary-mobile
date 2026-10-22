import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addGroup, deleteGroup, getGroupColors, getGroupIcons, getGroups, moveGroup, updateGroup } from '@/src/api/groups'
import { readGroupCache, writeGroupCache } from '@/src/lib/groupCache'
import { isTransportFailure } from '@/src/api/client'

const key = ['groups'] as const
const categoriesKey = ['categories'] as const
const moveKey = ['groups', 'move'] as const

/** Write-through cache point for the group list, mirroring useCategories's getCategoriesAndCache. */
async function getGroupsAndCache(): Promise<string[]> {
  try {
    const groups = await getGroups()
    // Best effort, as in useCategories's getCategoriesAndCache.
    try {
      await writeGroupCache(groups)
    } catch (err) {
      if (__DEV__) console.log('[offline-cache] group WRITE FAILED', err)
    }
    return groups
  } catch (err) {
    // Same offline fallback as useCategories's getCategoriesAndCache — the
    // picker groups its categories by this list, so losing it hides them.
    if (!isTransportFailure(err)) throw err
    const cached = await readGroupCache()
    if (!cached) throw err
    return cached
  }
}

export function useGroups() {
  return useQuery({ queryKey: key, queryFn: getGroupsAndCache, staleTime: 30_000 })
}

/** Picked group icons by name; a group missing here falls back to its emoji or name. */
// ponytail: no offline cache, so offline a picked group icon falls back to its
// emoji/name icon; add a groupIconCache beside groupCache if that matters.
export function useGroupIcons(): Map<string, string> {
  const { data } = useQuery({ queryKey: [...key, 'icons'], queryFn: getGroupIcons, select: toIconMap, staleTime: 30_000 })
  return data ?? EMPTY_ICONS
}
// Module-level so select only reruns when the data changes.
const toIconMap = (pairs: [string, string][]) => new Map(pairs)
const EMPTY_ICONS = new Map<string, string>()

/** Picked group colours by name; a group missing here wears groupColor's default. */
export function useGroupColors(): Map<string, string> {
  const { data } = useQuery({ queryKey: [...key, 'colors'], queryFn: getGroupColors, select: toIconMap, staleTime: 30_000 })
  return data ?? EMPTY_ICONS
}

export function useAddGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; icon?: string; color?: string }) =>
      addGroup(params.name, { icon: params.icon, color: params.color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: categoriesKey })
    },
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; newName?: string; icon?: string; color?: string }) =>
      updateGroup(params.name, { newName: params.newName, icon: params.icon, color: params.color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: categoriesKey })
    },
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => deleteGroup(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: categoriesKey })
    },
  })
}

export function useMoveGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: moveKey,
    // Keep API writes in gesture order, including across hook instances. Optimistic
    // onMutate still runs immediately for queued moves, so the next drag needn't wait.
    scope: { id: 'group-reorder' },
    mutationFn: (params: { name: string; toIndex: number }) => moveGroup(params.name, params.toIndex),
    onMutate: (params) => {
      qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<string[]>(key)
      if (previous) {
        const idx = previous.indexOf(params.name)
        if (idx !== -1) {
          const next = [...previous]
          next.splice(idx, 1)
          next.splice(params.toIndex, 0, params.name)
          qc.setQueryData<string[]>(key, next)
        }
      }
      return { previous }
    },
    onError: (_err, _params, context) => {
      if (context?.previous && qc.isMutating({ mutationKey: moveKey }) === 1) {
        qc.setQueryData(key, context.previous)
      }
    },
    onSettled: () => {
      // An intermediate refetch would overwrite later optimistic moves with an
      // older server order. Reconcile only once the queue has drained.
      if (qc.isMutating({ mutationKey: moveKey }) === 1) {
        return Promise.all([
          qc.invalidateQueries({ queryKey: key }),
          qc.invalidateQueries({ queryKey: categoriesKey }),
        ])
      }
    },
  })
}
