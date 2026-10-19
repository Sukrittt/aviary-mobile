import { File } from 'expo-file-system'
import { apiFetch } from './client'
import type { PickedFile } from './imports'
import { AiAllowanceError, rejectIfAllowanceExceeded } from '@/src/lib/aiAllowance'

/** Twin of Web's src/api/statement.ts. */
export interface StatementItem {
  /** The row's client_id: a hash of its date, amount and payee. */
  id: string
  item: string
  amount: number
  date: string
  /** '' when neither history nor Jev was sure. */
  category: string
  /** Why it starts unchecked, if it does. */
  suggestSkip: 'logged' | 'before_last' | null
}

export interface StatementProposal {
  id: string
  items: StatementItem[]
  credits: number
  dropped: number
}

/** What went wrong, already worded for the user. */
export class StatementFailure extends Error {}

const COPY: Record<string, string> = {
  pdf_locked: 'That PDF has a password. Download the statement as Excel or CSV from net banking and upload that instead.',
  unreadable: "Couldn't read that one. Try a CSV or Excel statement, or a screenshot of your payments.",
  empty: "Couldn't find any payments from the last month in that.",
  too_big: "That's too big to upload. Try fewer screenshots or a shorter date range.",
}
const RATE_LIMITED = "That's a lot of uploads in a row. Give it a minute and try again."
const ALLOWANCE = "You've used this month's AI reads. Add these by hand for now."
const GENERIC = 'Check your connection and try again.'

/** Up to five screenshots as base64, or one csv, xlsx or pdf file. 60s, like the server. */
export async function readStatement(input: { images: { data: string; mimeType: string }[] } | { file: PickedFile }): Promise<StatementProposal> {
  let init: RequestInit
  try {
    if ('file' in input) {
      const form = new FormData()
      // Expo's fetch takes a part with bytes(), like the import upload (src/api/imports.ts).
      form.append('file', new File(input.file.uri) as unknown as Blob, input.file.name)
      init = { method: 'POST', body: form }
    } else {
      init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
    }
  } catch {
    throw new StatementFailure(COPY.unreadable)
  }
  let resp: Response
  try {
    resp = await apiFetch('/api/expenses/statement', { ...init, signal: AbortSignal.timeout(60_000) })
  } catch {
    throw new StatementFailure(GENERIC)
  }
  if (resp.ok) return resp.json()
  try {
    await rejectIfAllowanceExceeded(resp, false, 'statement')
  } catch (err) {
    if (err instanceof AiAllowanceError) throw new StatementFailure(ALLOWANCE)
    throw err
  }
  if (resp.status === 429) throw new StatementFailure(RATE_LIMITED)
  const code = ((await resp.json().catch(() => null)) as { error?: unknown } | null)?.error
  throw new StatementFailure((typeof code === 'string' && COPY[code]) || GENERIC)
}
