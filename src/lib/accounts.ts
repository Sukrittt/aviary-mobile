import { AccountWriteError } from '@/src/api/accounts'
import type { AccountType } from '@/src/types'

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
]

export const ACCOUNT_TYPE_LABEL: Record<string, string> = { bank: 'Bank account', cash: 'Cash', credit_card: 'Credit card' }

/** The server's limit and duplicate-name messages are written for people; anything else gets the generic line. */
export function accountErrorMessage(err: unknown): string {
  if (err instanceof AccountWriteError && err.status === 409) return err.message
  return 'Check your connection and try again.'
}
