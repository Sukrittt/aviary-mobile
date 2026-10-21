import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getBudgets, type Budget, type BudgetList } from '@/src/api/spaces'
import { activeBudgetId, subscribeActiveBudget } from '@/src/lib/activeBudget'
import { currentUserId } from '@/src/api/accessMode'

export const budgetsKey = ['spaces'] as const

export function useBudgetList() {
  return useQuery<BudgetList>({ queryKey: budgetsKey, queryFn: getBudgets, staleTime: 60_000 })
}

/**
 * The budgets this person can open, and the one open now. `multi` is the
 * switch for every budget-aware bit of UI: with one budget, nothing about
 * budgets shows anywhere.
 */
export function useBudgetSpaces(): { budgets: Budget[]; active: Budget | null; multi: boolean; count: number; limit: number; atLimit: boolean } {
  const { data } = useBudgetList()
  const budgets = data?.budgets ?? []
  const activeId = useSyncExternalStore(subscribeActiveBudget, activeBudgetId) ?? currentUserId()
  const active = budgets.find((b) => b.id === activeId) ?? budgets.find((b) => b.personal) ?? null
  const count = data?.count ?? 1
  const limit = data?.limit ?? 5
  return { budgets, active, multi: budgets.length >= 2, count, limit, atLimit: count >= limit }
}
