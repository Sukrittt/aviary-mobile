import type { QueryClient } from '@tanstack/react-query'
import { getBudgets, type Budget, type BudgetList, type BudgetMember } from '@/src/api/spaces'
import { Alert } from '@/src/components/ui/AlertHost'
import { activeBudgetId } from './activeBudget'
import { switchBudget } from './budgetSwitch'
import { budgetsKey } from '@/src/hooks/useBudgetSpaces'
import { toLocalDateString } from './date'
import { formatDateShort } from './format'

/** The most people a budget can have (the server enforces it too). */
export const MAX_MEMBERS = 6

/** "20 Oct 2026": the day someone joined, on this device's calendar. */
export function joinedOn(iso: string): string {
  const day = toLocalDateString(new Date(iso))
  return `${formatDateShort(day)} ${day.slice(0, 4)}`
}

export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null
}

export function ownerOf(budget: Budget | null | undefined): BudgetMember | undefined {
  return budget?.members.find((m) => m.role === 'owner' || m.userId === budget.ownerId)
}

/** Where to go when `leaving` is gone: the server's pick, then personal, then the first left. */
export function fallbackBudgetId(list: BudgetList | undefined, leaving: string | null): string | null {
  const left = (list?.budgets ?? []).filter((b) => b.id !== leaving)
  return (left.find((b) => b.id === list?.activeId) ?? left.find((b) => b.personal) ?? left[0])?.id ?? null
}

let handling: string | null = null

/**
 * The open budget answered NOT_A_MEMBER: say why (deleted, or you were taken
 * out), then move to another. Every in-flight request for it fails the same
 * way, so this runs once per budget: later calls while it runs, or for a budget
 * that's no longer open, do nothing.
 */
export async function handleLostBudget(queryClient: QueryClient, uid: string, spaceId: string | null): Promise<void> {
  const lost = spaceId ?? activeBudgetId() ?? uid
  if (lost !== (activeBudgetId() ?? uid) || handling === lost) return
  handling = lost
  try {
    const cachedName = queryClient.getQueryData<BudgetList>(budgetsKey)?.budgets.find((b) => b.id === lost)?.name
    let list: BudgetList | undefined
    try {
      list = await queryClient.fetchQuery({ queryKey: budgetsKey, queryFn: getBudgets, staleTime: 0 })
    } catch {
      list = queryClient.getQueryData<BudgetList>(budgetsKey)
    }
    // A stale refusal from before a rejoin: still in it, nothing to do.
    if (list?.budgets.some((b) => b.id === lost)) return
    const deleted = list?.deleted?.find((d) => d.id === lost)
    const name = cachedName ?? deleted?.name ?? 'that'
    const next = fallbackBudgetId(list, lost)
    await switchBudget(queryClient, uid, next)
    const landed = list?.budgets.find((b) => b.id === next)
    Alert.alert(
      deleted ? `${name} budget was deleted${deleted.deletedBy ? ` by ${deleted.deletedBy}` : ''}.` : `You're no longer in ${name} budget.`,
      landed ? `You're back in ${landed.name}.` : undefined,
      undefined,
      { sticky: true },
    )
  } finally {
    handling = null
  }
}

/** A write into a read-only shared budget. */
export function alertReadOnly(budget: Budget | null | undefined): void {
  Alert.alert(READ_ONLY_TITLE, readOnlyCopy(budget), [{ text: 'Got it' }], { sticky: true })
}

export const READ_ONLY_TITLE = 'This budget is read-only'

/** What read-only means and when it ends, under the title or on the banner. */
export function readOnlyCopy(budget: Budget | null | undefined): string {
  const owner = firstName(ownerOf(budget)?.name)
  return `${owner ? `${owner}'s` : "The owner's"} plan has lapsed. You can view and export everything; logging comes back once they renew.`
}

/** Who logged a row in `budget`. `created_by` null is the owner. */
export function loggedBy(row: { created_by?: string | null }, budget: Budget | null | undefined): BudgetMember | undefined {
  const id = row.created_by ?? budget?.ownerId
  return budget?.members.find((m) => m.userId === id)
}

/** Activity's "Mine": rows this person logged, the owner's unattributed ones included. */
export function onlyMine<T extends { created_by?: string | null }>(rows: T[], budget: Budget | null | undefined, uid: string | null): T[] {
  return rows.filter((r) => (r.created_by ?? budget?.ownerId) === uid)
}
