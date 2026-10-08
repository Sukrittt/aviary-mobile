import { readEncrypted, writeEncrypted } from './encryptedStorage'
import { currentUserId } from '@/src/api/accessMode'
import type { ExpensePayload } from '@/src/api/expenses'

const PREFIX = 'mc-pending-expenses'
const FAILED_PREFIX = 'mc-failed-expenses'
const RECEIPT_PREFIX = 'mc-expense-sync-receipts'

// Missing on legacy entries: conservatively assume a POST may have committed.
export type PendingExpense = { payload: ExpensePayload; attempts: number; submitted?: boolean }
export type SyncReceipt = {
  clientId: string
  id?: string
  version?: number
  timestamp: string
  item: string
  amountInr: number
  undone?: boolean
}

function key(uid: string | null): string | null {
  return uid ? `${PREFIX}:${uid}` : null
}

function failedKey(uid: string | null): string | null {
  return uid ? `${FAILED_PREFIX}:${uid}` : null
}

async function read(k: string): Promise<PendingExpense[]> {
  return (await readEncrypted<PendingExpense[]>(k)) ?? []
}

async function write(k: string, entries: PendingExpense[]): Promise<void> {
  await writeEncrypted(k, entries)
}

// Every mutation is serialized through one promise chain — an enqueue racing
// a concurrent drain over AsyncStorage's read-modify-write is a real bug
// otherwise (the loser's write clobbers the winner's). Same single-flight
// idiom as accessMode.ts's `refreshing`.
let chain: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  chain = result.catch(() => {})
  return result
}

/** Queues a create for later sync. No-op when signed out as guest (nothing to namespace it by). */
export function enqueue(payload: ExpensePayload, owner = currentUserId(), submitted = false): Promise<void> {
  return serialize(async () => {
    const k = key(owner)
    if (!k) return
    const entries = await read(k)
    entries.push({ payload, attempts: 0, submitted })
    await write(k, entries)
  })
}

/** Persist before POST: a lost response must never turn into a local-only Undo. */
export function markSubmitted(clientId: string, owner: string): Promise<void> {
  return serialize(async () => {
    const k = key(owner)!
    const entries = await read(k)
    const entry = entries.find(e => e.payload.client_id === clientId)
    if (!entry) throw new Error('This queued expense is no longer available.')
    entry.submitted = true
    await write(k, entries)
  })
}

export function syncReceipt(clientId: string, owner: string): Promise<SyncReceipt | undefined> {
  return serialize(async () => {
    const receipts = (await readEncrypted<SyncReceipt[]>(`${RECEIPT_PREFIX}:${owner}`)) ?? []
    return receipts.find(r => r.clientId === clientId)
  })
}

/** Journal identity before removing the queue entry. Retain a bounded encrypted history. */
export function saveSyncReceipt(receipt: SyncReceipt, owner: string): Promise<void> {
  return serialize(async () => {
    const k = `${RECEIPT_PREFIX}:${owner}`
    const receipts = (await readEncrypted<SyncReceipt[]>(k)) ?? []
    await writeEncrypted(k, [...receipts.filter(r => r.clientId !== receipt.clientId), receipt].slice(-100))
  })
}

/** All queued expenses, oldest first. */
export function list(owner = currentUserId()): Promise<PendingExpense[]> {
  return serialize(async () => {
    const k = key(owner)
    return k ? read(k) : []
  })
}

export function count(): Promise<number> {
  return list().then((entries) => entries.length)
}

/** Removes one entry by its client_id — a successful sync, or a manual Undo. */
export function remove(clientId: string, owner = currentUserId()): Promise<void> {
  return serialize(async () => {
    const k = key(owner)
    if (!k) return
    const entries = await read(k)
    await write(
      k,
      entries.filter((e) => e.payload.client_id !== clientId),
    )
    // A move to the failed list can stop after saving the copy but before
    // removing the pending entry. Drop that copy too once the server has it.
    const fk = failedKey(owner)!
    const failed = await read(fk)
    if (failed.some((e) => e.payload.client_id === clientId)) {
      await write(fk, failed.filter((e) => e.payload.client_id !== clientId))
    }
  })
}

/** Bumps an entry's attempt count; moves it to the failed list once it hits the cap. */
export function bumpAttempts(clientId: string, cap: number, owner = currentUserId()): Promise<void> {
  return serialize(async () => {
    const k = key(owner)
    if (!k) return
    const entries = await read(k)
    const entry = entries.find((e) => e.payload.client_id === clientId)
    if (!entry) return
    entry.attempts += 1
    if (entry.attempts >= cap) {
      const fk = failedKey(owner)
      if (!fk) return
      // Save the destination first; a disk/key failure must leave a copy.
      // Deduplicate so retrying after the source write fails is safe too.
      const failed = await read(fk)
      await write(fk, [...failed.filter(e => e.payload.client_id !== clientId), entry])
      await write(k, entries.filter(e => e.payload.client_id !== clientId))
    } else {
      await write(k, entries)
    }
  })
}

export function listFailed(owner = currentUserId()): Promise<PendingExpense[]> {
  return serialize(async () => {
    const fk = failedKey(owner)
    return fk ? read(fk) : []
  })
}

const CSV_COLUMNS = ['date', 'item', 'amount_inr', 'category', 'payment_method', 'notes'] as const

/**
 * Expenses logged on this device that the server has never seen — queued, or
 * given up on — as CSV. The server-built export cannot include them, and a
 * user leaving after their trial ends should not lose the last few days of
 * spending they logged offline.
 */
export function toCsv(entries: PendingExpense[]): string {
  const cell = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
  const rows = entries.map((e) => CSV_COLUMNS.map((c) => cell(e.payload[c])).join(','))
  return [CSV_COLUMNS.join(','), ...rows].join('\n')
}

/** Every unsynced expense on this device, pending and failed alike. */
export async function listUnsynced(): Promise<PendingExpense[]> {
  const [pending, failed] = await Promise.all([list(), listFailed()])
  return [...pending, ...failed]
}
