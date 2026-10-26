import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as SecureStore from 'expo-secure-store'
import { accessMode } from '@/src/api/accessMode'
import { activeBudgetId } from '@/src/lib/activeBudget'
import { track } from '@/src/lib/analytics'
import { todayLocal } from '@/src/lib/date'

// ponytail: kept on this device, like collapsed groups. Move to the category
// row (Web's /api/categories) when Web gets weekly pacing, so it syncs.
const storeKey = (budget: string) => `mc-weekly-${budget}`

/**
 * Categories tracked week by week, with the day each was switched on (so
 * Monday's recap only judges weeks you were tracking), remembered on this
 * device per budget. A query rather than local state, so the row's switch and
 * Home's bars share one value without prop drilling.
 */
export function useWeeklyCategories() {
  const qc = useQueryClient()
  const budget = activeBudgetId() ?? 'personal'
  const queryKey = ['weekly-categories', budget] as const
  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const raw = await SecureStore.getItemAsync(storeKey(budget)).catch(() => null)
      return new Map<string, string>(raw ? Object.entries(JSON.parse(raw) as Record<string, string>) : [])
    },
    staleTime: Infinity,
  })

  // The next account signed into on this device starts with none.
  useEffect(
    () =>
      accessMode.subscribeLogout(() => {
        SecureStore.deleteItemAsync(storeKey(budget)).catch(() => {})
        qc.removeQueries({ queryKey: ['weekly-categories'] })
      }),
    [budget, qc],
  )

  function setWeekly(category: string, on: boolean) {
    const next = new Map(qc.getQueryData<Map<string, string>>(queryKey) ?? data ?? [])
    if (on) next.set(category, todayLocal())
    else next.delete(category)
    qc.setQueryData(queryKey, next)
    SecureStore.setItemAsync(storeKey(budget), JSON.stringify(Object.fromEntries(next))).catch(() => {})
    track('weekly_pacing_toggled', { on })
  }

  return { weekly: data, setWeekly }
}
