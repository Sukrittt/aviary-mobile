import type { ExpenseRow } from '@/src/types'

export class ExpenseWriteError extends Error {
  constructor(readonly status: number, message: string, readonly current?: ExpenseRow) {
    super(message)
    this.name = 'ExpenseWriteError'
  }
}

export type PaymentMethod = 'bank' | 'credit_card'

export type ExpenseDraft = {
  item: string
  amount: string
  date: string
  category: string
  paymentMethod: PaymentMethod
  notes: string
}

/** Anything that isn't a credit card is the Bank/UPI chip, matching the editor. */
export function paymentMethodOf(value: string | undefined): PaymentMethod {
  return value === 'credit_card' ? 'credit_card' : 'bank'
}

/** Only the user's changed fields, compared with the version they opened. */
export function expenseChanges(original: ExpenseDraft, draft: ExpenseDraft) {
  return {
    ...(draft.item.trim() !== original.item ? { new_item: draft.item.trim() } : {}),
    ...(Number(draft.amount) !== Number(original.amount) ? { new_amount_inr: String(Number(draft.amount)) } : {}),
    ...(draft.date !== original.date ? { new_date: draft.date } : {}),
    ...(draft.category !== original.category ? { category: draft.category } : {}),
    ...(draft.paymentMethod !== original.paymentMethod ? { new_payment_method: draft.paymentMethod } : {}),
    ...(draft.notes.trim() !== original.notes.trim() ? { new_notes: draft.notes.trim() } : {}),
  }
}

/** Rebase only the changed fields; unrelated changes on the server survive. */
export function rebaseExpenseDraft(original: ExpenseDraft, draft: ExpenseDraft, latest: ExpenseRow): ExpenseDraft {
  const changes = expenseChanges(original, draft)
  return {
    item: changes.new_item ?? latest.item,
    amount: changes.new_amount_inr ?? latest.amount_inr,
    date: changes.new_date ?? latest.date.slice(0, 10),
    category: changes.category ?? latest.category,
    paymentMethod: changes.new_payment_method ?? paymentMethodOf(latest.payment_method),
    notes: changes.new_notes ?? latest.notes ?? '',
  }
}

export function expenseDraft(row: ExpenseRow): ExpenseDraft {
  return {
    item: row.item,
    amount: row.amount_inr,
    date: row.date.slice(0, 10),
    category: row.category,
    paymentMethod: paymentMethodOf(row.payment_method),
    notes: row.notes ?? '',
  }
}
