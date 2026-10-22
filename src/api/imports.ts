// Ported from Web/src/api/imports.ts. The shapes are Web's lib/import types,
// copied here since Mobile can't import server code.
import { File } from 'expo-file-system'
import { apiFetch } from './client'

type Direction = 'negative_spend' | 'positive_spend'
export type ImportAccountType = 'bank' | 'cash' | 'credit_card'
export type SkipReason = 'transfer' | 'opening_balance' | 'fill' | 'other_currency' | 'unparseable' | 'zero' | 'future' | 'after_start'

export interface ImportReview {
  importId: string
  app: string
  filename: string
  direction: Direction
  directionSource: 'column' | 'sign'
  currency: string
  hasCurrency: boolean
  /** `refund`: money back on a spending category, booked as a negative spend. Not in `expense`. */
  counts: { expense: number; refund?: number; income: number; from: string; to: string }
  skipped: Partial<Record<SkipReason, number>>
  /** The codes behind `skipped.other_currency`, most rows first. */
  otherCurrencies: string[]
  samples: { date: string; item: string; amount: number; kind: 'expense' | 'income' }[]
  groups: string[]
  categories: { source: string; name: string; group: string; monthly: number }[]
  accounts: { source: string; name: string; type: ImportAccountType }[]
  droppedAccounts: string[]
  salary: { label: string; amount: number; day: number } | null
  budgetTotal: number
  /** Set for a later import (a budget that's already set up): where the history stops, and the envelopes it can land in. */
  later?: { cutoff: string | null; categories: string[]; icons: { categories: Record<string, string>; groups: Record<string, string> } } | null
}

export interface CommitEdits {
  currency: string
  direction: Direction
  groups: string[]
  categories: { source: string; name: string; group: string }[]
  accounts: { source: string; name: string; type: ImportAccountType }[]
  salary: { amount: number; day: number } | null
}

export interface CommitResult {
  importId: string
  total: number
  income: number
  groupCount: number
  categoryCount: number
}

export type ImportStatus =
  | { status: 'none' }
  | {
      importId: string
      status: 'importing' | 'done' | 'failed'
      done: number
      total: number
      failed: number
      startedAt: string | null
      finishedAt: string | null
      leased: boolean
    }

/** A picked file, as expo-document-picker hands it over. */
export interface PickedFile {
  uri: string
  name: string
  mimeType?: string
}

/**
 * Why an import call failed, as a code the screen turns into its own copy.
 * `network` covers anything without one (a timeout, a 500, no connection):
 * the server's text never reaches the user.
 */
export class ImportFailure extends Error {
  /** What went wrong underneath, for analytics: an error's name ("TypeError") or the HTTP status. Never a message. */
  constructor(readonly code: string, readonly detail?: string) {
    super(code)
  }
}

function transportFailure(err: unknown): ImportFailure {
  const name = err instanceof Error ? err.name : 'unknown'
  if (__DEV__) console.warn('[import] request failed before an answer', err)
  return new ImportFailure('network', name)
}

// Upload plus parse, or a commit's setup writes, can outlast the default 15 s.
const SLOW_MS = 60_000

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let resp: Response
  try {
    resp = await apiFetch(path, { signal: AbortSignal.timeout(SLOW_MS), ...init })
  } catch (err) {
    throw transportFailure(err)
  }
  if (resp.ok) return resp.json() as Promise<T>
  const body = (await resp.json().catch(() => null)) as { error?: unknown } | null
  throw new ImportFailure(typeof body?.error === 'string' && resp.status < 500 ? body.error : 'network', String(resp.status))
}

const jsonInit = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function previewImport(file: PickedFile): Promise<ImportReview> {
  const form = new FormData()
  try {
    // Expo's fetch takes a part with bytes(), not React Native's { uri } object
    // ("Unsupported FormDataPart implementation"). Capped at 4 MB before this.
    form.append('file', new File(file.uri) as unknown as Blob, file.name)
  } catch (err) {
    throw transportFailure(err)
  }
  return call('/api/import/preview', { method: 'POST', body: form })
}

export function recomputeImport(importId: string, change: { direction?: string; currency?: string }): Promise<ImportReview> {
  return call('/api/import/preview', jsonInit({ importId, ...change }))
}

export function commitImport(importId: string, edits: CommitEdits): Promise<CommitResult> {
  return call('/api/import/commit', jsonInit({ importId, ...edits }))
}

export async function getImportStatus(): Promise<ImportStatus> {
  const resp = await apiFetch('/api/import/status')
  if (!resp.ok) throw new Error(`Failed to load import status: ${resp.status}`)
  return resp.json()
}

export function continueImport(importId: string, retry = false): Promise<unknown> {
  return call('/api/import/continue', jsonInit({ importId, ...(retry ? { retry: true } : {}) }))
}

/** One committed import, for Settings' history. Web's lib/import/undo.ts. */
export interface ImportHistoryItem {
  importId: string
  app: string
  status: 'importing' | 'done' | 'failed'
  total: number
  done: number
  failed: number
  committedAt: string | null
}

export async function getPastImports(): Promise<ImportHistoryItem[]> {
  const resp = await apiFetch('/api/import/history')
  if (!resp.ok) throw new Error(`Failed to load imports: ${resp.status}`)
  return ((await resp.json()) as { imports: ImportHistoryItem[] }).imports
}

export function undoImport(importId: string): Promise<unknown> {
  return call('/api/import/undo', jsonInit({ importId }))
}
