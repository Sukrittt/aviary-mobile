import { apiFetch } from './client'
import type { Habit } from '@/src/lib/habits'

export type NudgeCopy = { title: string; bodies: string[] }

/** AI-written title and body lines for one habit's nudges. Null on any failure: the caller has fixed copy to fall back on. */
export async function fetchNudgeCopy(habit: Pick<Habit, 'item' | 'category' | 'weekdays' | 'minute'>): Promise<NudgeCopy | null> {
  try {
    const resp = await apiFetch('/api/habit-nudges/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: habit.item, category: habit.category, weekdays: habit.weekdays, minute: habit.minute }),
    })
    if (!resp.ok) return null
    const data: Partial<NudgeCopy> = await resp.json()
    return typeof data.title === 'string' && Array.isArray(data.bodies) && data.bodies.length ? { title: data.title, bodies: data.bodies } : null
  } catch {
    return null
  }
}
