import { apiFetch, HttpError } from './client'
import { budgetHeaders } from '@/src/lib/activeBudget'
import type { CategoryRow } from '@/src/types'

// "Spaces" on the wire, "budgets" on screen: `budgets` already means the
// monthly assignment rows. Mirrors Web's lib/spaces.ts BudgetSummary.
/** `lapsed`, owner's view only: their plan isn't active, so the budget would lock if handed to them. */
export type BudgetMember = { userId: string; name: string | null; avatarUrl: string | null; role: 'owner' | 'member'; joinedAt: string | null; lapsed?: boolean }
export type Budget = {
  id: string
  name: string
  emoji: string
  /** Category icon catalog key; budgetIconKey falls back to `emoji` without it. */
  icon?: string
  role: 'owner' | 'member'
  ownerId: string
  currencyCode: string
  personal: boolean
  members: BudgetMember[]
  /** A shared budget whose owner's plan lapsed: reads work, writes answer 402 BUDGET_READ_ONLY. */
  readOnly?: boolean
}
export type DeletedBudget = { id: string; name: string; emoji: string; icon?: string; deletedAt: string; deletedBy: string | null; canRestore: boolean }
export type BudgetList = { budgets: Budget[]; deleted?: DeletedBudget[]; count: number; limit: number; activeId: string | null }

export async function getBudgets(): Promise<BudgetList> {
  const resp = await apiFetch('/api/spaces')
  // An API from before budgets: everyone has exactly the one.
  if (resp.status === 404) return { budgets: [], count: 1, limit: 5, activeId: null }
  if (!resp.ok) throw new HttpError(resp.status, `Failed to load budgets: ${resp.status}`)
  return resp.json()
}

export class BudgetLimitError extends Error {}

/** `import`: an empty budget, not set up, for the history import to fill. */
export async function createBudget(input: { name: string; icon: string; currencyCode: string; copyCategories: boolean; import?: boolean }): Promise<Budget> {
  const resp = await apiFetch('/api/spaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (resp.status === 409) throw new BudgetLimitError('budget limit reached')
  if (!resp.ok) throw new HttpError(resp.status, `Failed to create budget: ${resp.status}`)
  return resp.json()
}

export async function updateBudget(id: string, patch: { name?: string; icon?: string }): Promise<Budget> {
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

export type BudgetInvite = { code: string; url: string; expiresAt: string }
export type BudgetMembers = { members: BudgetMember[]; role: 'owner' | 'member'; notifyOthers: boolean; invites?: BudgetInvite[] }

const spacePath = (id: string) => `/api/spaces/${encodeURIComponent(id)}`
const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** `{error}` off a refused response, for the cases that have their own copy. */
async function errorCode(resp: Response): Promise<string | null> {
  try {
    const body = await resp.json()
    return typeof body?.error === 'string' ? body.error : null
  } catch {
    return null
  }
}

/**
 * A refusal with a known reason (FULL, LIMIT_REACHED, EXPIRED, NOT_FOUND).
 * No ": 403" in the message: the root layout signs out on that, and NOT_OWNER isn't a dead session.
 */
export class BudgetRefusedError extends HttpError {
  constructor(status: number, public code: string | null) {
    super(status, `Budget request refused (${code ?? status})`)
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const resp = await apiFetch(path, init)
  if (!resp.ok) throw new BudgetRefusedError(resp.status, await errorCode(resp))
  return resp
}

export async function getBudgetMembers(id: string): Promise<BudgetMembers> {
  return (await send(`${spacePath(id)}/members`, {})).json()
}

export async function createInvite(id: string): Promise<BudgetInvite> {
  return (await send(`${spacePath(id)}/invites`, { method: 'POST' })).json()
}

export async function cancelInvite(id: string, code: string): Promise<void> {
  await send(`${spacePath(id)}/invites/${encodeURIComponent(code)}`, { method: 'DELETE' })
}

/** `me` leaves. */
export async function removeMember(id: string, userId: string | 'me'): Promise<void> {
  await send(`${spacePath(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export async function setNotifyOthers(id: string, notifyOthers: boolean): Promise<void> {
  await send(`${spacePath(id)}/members/me`, { method: 'PATCH', ...json({ notifyOthers }) })
}

export async function deleteBudget(id: string, confirmName: string): Promise<void> {
  await send(spacePath(id), { method: 'DELETE', ...json({ confirmName }) })
}

/** Hands the budget (and paying for it) to a member. The old owner stays in it as a member. */
export async function transferBudget(id: string, to: string): Promise<void> {
  await send(`${spacePath(id)}/transfer`, { method: 'POST', ...json({ to }) })
}

export async function restoreBudget(id: string): Promise<void> {
  await send(`${spacePath(id)}/restore`, { method: 'POST' })
}

export type JoinPreview = {
  status: 'ok' | 'expired' | 'cancelled' | 'accepted' | 'not_found'
  budget?: { id: string; name: string; emoji: string; icon?: string }
  /** First name. */
  inviter?: string | null
  members?: number
}

export async function previewJoin(code: string): Promise<JoinPreview> {
  const resp = await apiFetch(`/api/join/${encodeURIComponent(code)}`)
  if (resp.status === 404) return { status: 'not_found' }
  if (!resp.ok) throw new HttpError(resp.status, `Failed to load invite: ${resp.status}`)
  return resp.json()
}

export async function joinBudget(code: string): Promise<{ spaceId: string; already: boolean }> {
  return (await send(`/api/join/${encodeURIComponent(code)}`, { method: 'POST' })).json()
}
