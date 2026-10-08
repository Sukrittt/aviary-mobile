import type { QueryClient } from '@tanstack/react-query'

/** Online creation and successful offline replay must refresh the same consumers. */
export function invalidateExpenseCreateQueries(qc: QueryClient): Promise<unknown[]> {
  return Promise.all(['expenses', 'budgets', 'ai-brief', 'category-map', 'user'].map((prefix) =>
    qc.invalidateQueries({ queryKey: [prefix] }),
  ))
}
