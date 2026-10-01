import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { refreshHabitNudges } from '@/src/lib/habitNudges'

/**
 * Keeps the habit nudges in step with the user's expenses: every add, edit or
 * delete refetches the recent rows and lands here, and coming back to the app
 * rolls the 7-day plan forward even when nothing changed.
 */
export function useHabitNudges(): void {
  const { data } = useRecentExpenses()
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
