import type { ExpenseRow } from '@/src/types'

/** What a shared payment turned into, for the log sheet to prefill. */
export type SharedPayment = {
  amount: number
  payee: string
  /** YYYY-MM-DD, or '' for today. */
  date?: string
  category?: string
  /** The UPI reference, when the receipt had one. Saved in the notes so a second share of it is caught. */
  ref?: string
}

const AMOUNT = /(?:₹|\bRs\.?|\bINR)\s*([\d,]+(?:\.\d{1,2})?)/i
// The payee runs from "to" up to whatever UPI apps put after it: "via PhonePe", "on 21 Oct", a full stop, the amount.
const PAYEE = /\bto\s+(.+?)(?=\s+(?:on|via|using|from|at|is|was|has|for|with|successful(?:ly)?)\b|[.,!|\n(]|\s*(?:₹|\bRs\b|\bINR\b)|$)/i
const REF = /\b(?:UPI\s*(?:Ref(?:erence)?\.?\s*(?:No\.?|ID|Number)?|transaction\s*ID|Txn\.?\s*ID)|UTR)\s*(?:No\.?)?\s*[:.\-#]?\s*(\d{6,})/i

/**
 * The amount and payee out of a UPI app's text receipt ("Paid ₹250 to Ramesh",
 * "Rs. 85 paid to CHAI POINT using Paytm UPI"). Null when there's no amount.
 * Read here rather than by Ask Aviary: these receipts are a fixed shape, so no
 * AI call (or allowance) is spent and no chat is left behind for each share.
 */
export function parseUpiText(text: string): SharedPayment | null {
  const amountMatch = AMOUNT.exec(text)
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : NaN
  if (!(amount > 0)) return null
  const payee = (PAYEE.exec(text)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const ref = REF.exec(text)?.[1]
  return { amount, payee, ...(ref ? { ref } : {}) }
}

/** The note a shared payment saves with, carrying its UPI reference. */
export const refNote = (ref: string) => `UPI ref ${ref}`

const DUPLICATE_WINDOW_MS = 10 * 60_000
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * "Looks already logged": a row with the same UPI reference, or the same
 * amount and payee logged in the last few minutes (the success screen shared
 * twice, or logged by hand first).
 */
export function looksLogged(rows: ExpenseRow[], payment: SharedPayment, now = Date.now()): boolean {
  if (payment.ref && rows.some((r) => (r.notes ?? '').includes(payment.ref!))) return true
  const payee = norm(payment.payee)
  if (!payee) return false
  return rows.some(
    (r) => Number(r.amount_inr) === payment.amount && norm(r.item) === payee && Math.abs(now - Date.parse(r.timestamp)) <= DUPLICATE_WINDOW_MS,
  )
}
