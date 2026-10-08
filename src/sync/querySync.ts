import type { QueryClient } from '@tanstack/react-query'
import { currentUserId, sessionGeneration } from '@/src/api/accessMode'
import { invalidateExpenseCreateQueries } from '@/src/lib/expenseQueries'
import { onExpenseSynced } from './events'

export function subscribeExpenseQuerySync(qc: QueryClient): () => void {
  return onExpenseSynced(({ owner, generation }) => {
    if (owner !== currentUserId() || generation !== sessionGeneration()) return
    void invalidateExpenseCreateQueries(qc).catch(() => {})
  })
}
