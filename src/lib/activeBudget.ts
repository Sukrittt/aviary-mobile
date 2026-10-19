/**
 * The budget this device is working in. Null is the personal budget, which
 * the API serves to any request that names no budget, so a device with one
 * budget sends exactly what it sent before budgets existed.
 */
export const BUDGET_HEADER = 'x-aviary-budget'

let active: string | null = null

export function activeBudgetId(): string | null {
  return active
}

export function setActiveBudget(id: string | null): void {
  active = id
}

/** Headers that pin one request to `spaceId`, whatever is active when it's sent. */
export function budgetHeaders(spaceId: string | null | undefined): Record<string, string> {
  return spaceId ? { [BUDGET_HEADER]: spaceId } : {}
}
