export type ExpenseField = 'amount' | 'category'

/**
 * Required log-expense fields still empty, in the order they sit on screen.
 * "What was it for?" isn't one: a blank item saves under the category's name.
 */
export function missingFields(form: { amount: string; category: string }): ExpenseField[] {
  const missing: ExpenseField[] = []
  if (!(Number(form.amount) > 0)) missing.push('amount')
  if (!form.category) missing.push('category')
  return missing
}
