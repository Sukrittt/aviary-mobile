// Two refusals that are about a shared budget, not the account: a write into a
// budget whose owner's plan lapsed (402 BUDGET_READ_ONLY) and a request naming
// a budget this person is no longer in (403 NOT_A_MEMBER).
//
// A leaf module, like accessGate: src/api/client.ts emits, the React tree
// (BudgetAccessWatcher) listens, and neither imports the other.

export type BudgetAccessEvent = { kind: 'read_only' } | { kind: 'not_a_member'; spaceId: string | null }

const subs = new Set<(event: BudgetAccessEvent) => void>()

export function onBudgetAccess(fn: (event: BudgetAccessEvent) => void): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function emitBudgetAccess(event: BudgetAccessEvent): void {
  for (const fn of subs) fn(event)
}
