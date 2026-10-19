import { apiFetch, HttpError } from './client'
import { budgetHeaders } from '@/src/lib/activeBudget'
import type { CategoryRow } from '@/src/types'

// "Spaces" on the wire, "budgets" on screen: `budgets` already means the
// monthly assignment rows. Mirrors Web's lib/spaces.ts BudgetSummary.
export type BudgetMember = { userId: string; name: string | null; avatarUrl: string | null; role: 'owner' | 'member'; joinedAt: string | null }
export type Budget = {
  id: string
  name: string
  emoji: string
  role: 'owner' | 'member'
  ownerId: string
  currencyCode: string
  personal: boolean
  members: BudgetMember[]
}
export type BudgetList = { budgets: Budget[]; count: number; limit: number; activeId: string | null }

export async function getBudgets(): Promise<BudgetList> {
  const resp = await apiFetch('/api/spaces')
  // An API from before budgets: everyone has exactly the one.
  if (resp.status === 404) return { budgets: [], count: 1, limit: 5, activeId: null }
  if (!resp.ok) throw new HttpError(resp.status, `Failed to load budgets: ${resp.status}`)
  return resp.json()
}

export class BudgetLimitError extends Error {}

export async function createBudget(input: { name: string; emoji: string; currencyCode: string; copyCategories: boolean }): Promise<Budget> {
  const resp = await apiFetch('/api/spaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (resp.status === 409) throw new BudgetLimitError('budget limit reached')
  if (!resp.ok) throw new HttpError(resp.status, `Failed to create budget: ${resp.status}`)
  return resp.json()
}

export async function updateBudget(id: string, patch: { name?: string; emoji?: string }): Promise<Budget> {
  const resp = await apiFetch(`/api/spaces/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!resp.ok) throw new HttpError(resp.status, `Failed to update budget: ${resp.status}`)
  return resp.json()
}

/** Another budget's categories, for "Move to another budget", without opening it. */
export async function getBudgetCategories(spaceId: string): Promise<CategoryRow[]> {
  const resp = await apiFetch('/api/categories', { headers: budgetHeaders(spaceId) })
  if (!resp.ok) throw new HttpError(resp.status, `Failed to load categories: ${resp.status}`)
  return resp.json()
}

/** Moves an expense logged in the wrong budget. 409: it changed since it was loaded. */
export async function moveExpense(input: { id: string; version: number; to: string; category: string }): Promise<{ version: number }> {
  const resp = await apiFetch('/api/expenses/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) throw new HttpError(resp.status, `Failed to move expense: ${resp.status}`)
  return resp.json()
}
