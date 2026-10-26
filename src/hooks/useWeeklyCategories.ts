import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateCategory } from '@/src/api/categories'
import type { CategoryRow } from '@/src/types'
import { track } from '@/src/lib/analytics'
import { todayLocal } from '@/src/lib/date'
import { categoriesKey, useCategories } from '@/src/hooks/useCategories'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'

/**
 * Categories tracked week by week, with the day each was switched on (so
 * Monday's recap only judges weeks you were tracking). Stored on the category
 * itself (`weeklySince`, Web's /api/categories), so the phone, web and everyone
 * sharing the budget see the same switch. Twin of Web/src/hooks/useWeeklyCategories.ts.
 */
export function useWeeklyCategories() {
  const qc = useQueryClient()
  const { data } = useCategories()
  // Read-only members can't change a budget setting; the server refuses too.
  const readOnly = !!useBudgetSpaces().active?.readOnly
  const weekly = useMemo(
    () => new Map((data ?? []).flatMap((c) => (c.weeklySince ? [[c.name, c.weeklySince] as const] : []))),
    [data],
  )

  // Optimistic: the switch and the row change on tap, and roll back if the
  // save fails, since the switch flipping back is the error the user sees.
  const mutation = useMutation({
    // One queue for every flip: a quick on-then-off saves in tap order, so the
    // last tap is what the server keeps.
    scope: { id: 'weekly-categories' },
    mutationFn: ({ category, since }: { category: string; since: string | null }) => updateCategory(category, { weeklySince: since }),
    onMutate: async ({ category, since }) => {
      await qc.cancelQueries({ queryKey: categoriesKey })
      const previous = qc.getQueryData<CategoryRow[]>(categoriesKey)
      qc.setQueryData<CategoryRow[]>(categoriesKey, (rows) =>
        rows?.map((c) => {
          if (c.name !== category) return c
          const { weeklySince: _, ...rest } = c
          return since ? { ...rest, weeklySince: since } : rest
        }),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(categoriesKey, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: categoriesKey }),
  })

  function setWeekly(category: string, on: boolean) {
    mutation.mutate({ category, since: on ? todayLocal() : null })
    track('weekly_pacing_toggled', { on })
  }

  return { weekly: data ? weekly : undefined, setWeekly, readOnly }
}
