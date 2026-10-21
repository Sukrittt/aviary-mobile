import { useEffect, useMemo } from 'react'
import { AppState } from 'react-native'
import { currentUserId } from '@/src/api/accessMode'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { onlyMine } from '@/src/lib/budgetMembership'
import { refreshHabitNudges } from '@/src/lib/habitNudges'
import type { ExpenseRow } from '@/src/types'

/**
 * The rows habits are read from: the open budget's, but only what this person
 * logged. A partner's daily coffee in a shared budget is their habit, not yours.
 */
export function useOwnRecentExpenses(): ExpenseRow[] | undefined {
  const { data } = useRecentExpenses()
  const { active } = useBudgetSpaces()
  return useMemo(() => (data ? onlyMine(data, active, currentUserId()) : data), [data, active])
}

/**
 * Keeps the habit nudges in step with the user's expenses: every add, edit or
 * delete refetches the recent rows and lands here, and coming back to the app
 * rolls the 7-day plan forward even when nothing changed.
 */
export function useHabitNudges(): void {
  const data = useOwnRecentExpenses()
  useEffect(() => {
    if (!data) return
    const refresh = () => refreshHabitNudges(data).catch((err) => console.warn('Habit nudge refresh failed', err))
    void refresh()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh()
    })
    return () => sub.remove()
  }, [data])
}
