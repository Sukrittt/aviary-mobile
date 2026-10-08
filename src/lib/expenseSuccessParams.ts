import type { AddExpenseResult } from '@/src/hooks/useExpenses'

type ExpenseDetails = {
  item: string
  amount: string
  category: string
  date: string
  notes: string
  paymentMethod: string
}

/** Every create entry point must preserve the identity used by online/offline Undo. */
export function expenseSuccessParams(result: AddExpenseResult, details: ExpenseDetails) {
  return {
    ...details,
    id: result.id ?? '',
    version: result.version === undefined ? '' : String(result.version),
    clientId: result.clientId,
    pending: result.pending ? '1' : '',
    timestamp: result.timestamp ?? '',
    loggedAt: new Date().toISOString(),
    category: result.category ?? details.category,
  }
}
