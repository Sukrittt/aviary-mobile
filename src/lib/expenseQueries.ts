import type { QueryClient } from '@tanstack/react-query'
import type { UserProfile } from '@/src/api/account'

/** Online creation and successful offline replay must refresh the same consumers. */
export function invalidateExpenseCreateQueries(qc: QueryClient): Promise<unknown[]> {
  const prefixes = ['expenses', 'budgets', 'ai-brief', 'category-map']
  const tasks = prefixes.map((prefix) => qc.invalidateQueries({ queryKey: [prefix] }))
  // The profile only changes on the first hand-logged expense, which stamps
  // manualTransactionCompletedAt for the Get started card. Refetching it after
  // every later expense was a wasted request.
  if (!qc.getQueryData<UserProfile>(['user'])?.manualTransactionCompletedAt) {
    tasks.push(qc.invalidateQueries({ queryKey: ['user'], exact: true }))
  }
  return Promise.all(tasks)
}
