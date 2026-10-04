import { evaluateAmount } from '@/src/lib/calcAmount'

/**
 * The half-filled log-expense form. Tabs swap in with router.replace, which
 * unmounts the screen, so the form lives here between visits. In memory only:
 * a cold start begins fresh. Cleared once the expense is logged.
 */
export type LogExpenseDraft = {
  amount: string
  item: string
  category: string
  categoryTouched: boolean
  autoPicked: boolean
  date: string
  notes: string
  paymentMethod: 'bank' | 'credit_card'
}

let draft: LogExpenseDraft | null = null

export const getLogExpenseDraft = () => draft
export const setLogExpenseDraft = (d: LogExpenseDraft) => { draft = d }
export const clearLogExpenseDraft = () => { draft = null }

/** Clears the draft only if it's this expense, so logging another one elsewhere leaves it be. */
export function clearLogExpenseDraftFor(e: { item: string; amount: number; category: string }) {
  if (draft && draft.item.trim() === e.item && evaluateAmount(draft.amount) === e.amount && draft.category === e.category) draft = null
}
