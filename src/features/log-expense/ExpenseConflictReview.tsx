import { ConflictReview } from '@/src/components/shared/ConflictReview'
import { useCurrency } from '@/src/context/CurrencyContext'
import { paymentMethodOf, rebaseExpenseDraft, type ExpenseDraft, type PaymentMethod } from '@/src/lib/expenseConflict'
import type { ExpenseRow } from '@/src/types'

interface Props {
  latest: ExpenseRow
  original: ExpenseDraft
  draft: ExpenseDraft
  onChoose: (keepDraft: boolean) => void
  onClose: () => void
}

const paymentLabel = (m: PaymentMethod) => (m === 'bank' ? 'Bank/UPI' : 'Credit Card')

/** Full-screen native presentation keeps the editor mounted and its draft intact. */
export function ExpenseConflictReview({ latest, original, draft, onChoose, onClose }: Props) {
  const { formatCurrency } = useCurrency()
  const merged = rebaseExpenseDraft(original, draft, latest)
  const rows = [
    { label: 'Description', saved: latest.item, next: merged.item, changed: latest.item !== original.item || draft.item.trim() !== original.item },
    { label: 'Amount', saved: formatCurrency(Number(latest.amount_inr)), next: formatCurrency(Number(merged.amount)), changed: Number(latest.amount_inr) !== Number(original.amount) || Number(draft.amount) !== Number(original.amount) },
    { label: 'Date', saved: latest.date.slice(0, 10), next: merged.date, changed: latest.date.slice(0, 10) !== original.date || draft.date !== original.date },
    { label: 'Category', saved: latest.category, next: merged.category, changed: latest.category !== original.category || draft.category !== original.category },
    { label: 'Payment method', saved: paymentLabel(paymentMethodOf(latest.payment_method)), next: paymentLabel(merged.paymentMethod), changed: paymentMethodOf(latest.payment_method) !== original.paymentMethod || draft.paymentMethod !== original.paymentMethod },
    { label: 'Notes', saved: latest.notes || '—', next: merged.notes || '—', changed: (latest.notes ?? '') !== original.notes || draft.notes.trim() !== original.notes.trim() },
  ].filter((row) => row.changed)

  return (
    <ConflictReview
      title="Edit transaction"
      heading="This transaction was updated"
      description="A newer version was saved elsewhere. Your edits are still here."
      rows={rows}
      guidance="Continue with your edits and keep other updates. You can review everything before saving."
      announcement="This transaction was updated. Your edits are still here."
      testID="expense-conflict-scroll"
      onChoose={onChoose}
      onClose={onClose}
    />
  )
}
