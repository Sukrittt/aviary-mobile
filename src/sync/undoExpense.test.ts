import AsyncStorage from '@react-native-async-storage/async-storage'
import { waitFor } from '@testing-library/react-native'
import { currentUserId, sessionGeneration, SessionChangedError } from '@/src/api/accessMode'
import { apiFetch } from '@/src/api/client'
import { postExpensePayload, type ExpensePayload } from '@/src/api/expenses'
import { ExpenseWriteError } from '@/src/lib/expenseConflict'
import * as pending from '@/src/lib/pendingExpenses'
import { flush } from './flush'
import { undoPendingExpense } from './undoExpense'

jest.mock('@/src/api/accessMode', () => ({
  ...jest.requireActual('@/src/api/accessMode'),
  getValidToken: jest.fn(async () => 'token'),
  currentUserId: jest.fn(() => 'user-a'),
  sessionGeneration: jest.fn(() => 1),
}))
jest.mock('@/src/api/client', () => ({
  ...jest.requireActual('@/src/api/client'),
  apiFetch: jest.fn(),
}))

const payload = (clientId = 'c1'): ExpensePayload => ({
  client_id: clientId, item: 'Milk', amount_inr: '450', category: 'Groceries',
  date: '2026-10-08', timestamp: '2026-10-08T22:00:00', payment_method: 'bank',
})
const rows = new Map<string, { id: string; version: number; timestamp: string }>()
const storageWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!
let creations = 0
let postGate: Promise<void> | undefined
let losePostResponse = false
let loseDeleteResponse = false
let deleteStatus = 200

function response(status: number, data: object): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response
}

beforeEach(async () => {
  jest.mocked(AsyncStorage.setItem).mockImplementation(storageWrite)
  await AsyncStorage.clear()
  jest.clearAllMocks()
  jest.mocked(currentUserId).mockReturnValue('user-a')
  jest.mocked(sessionGeneration).mockReturnValue(1)
  rows.clear()
  creations = 0
  postGate = undefined
  losePostResponse = false
  loseDeleteResponse = false
  deleteStatus = 200
  jest.mocked(apiFetch).mockImplementation(async (_path, init) => {
    const body = JSON.parse(String(init?.body))
    if (init?.method === 'POST') {
      if (!rows.has(body.client_id)) {
        creations++
        rows.set(body.client_id, { id: `row-${creations}`, version: 7, timestamp: body.timestamp })
      }
      const saved = rows.get(body.client_id)!
      await postGate
      if (losePostResponse) throw new TypeError('Network request failed')
      return response(200, saved)
    }
    if (init?.method === 'DELETE') {
      if (deleteStatus !== 200) return response(deleteStatus, { error: 'Delete failed' })
      const entry = [...rows].find(([, row]) => row.id === body.id)
      if (!entry) return response(404, { error: 'Not found' })
      if (body.version !== entry[1].version) return response(409, { error: 'Changed on another device' })
      rows.delete(entry[0])
      if (loseDeleteResponse) throw new TypeError('Network request failed')
      return response(200, { ok: true })
    }
    throw new Error(`Unexpected ${init?.method}`)
  })
})

const deletes = () => jest.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'DELETE')
const posts = () => jest.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST')

it('cancels a known-unsent expense locally without needing a request', async () => {
  await pending.enqueue(payload())
  await undoPendingExpense('c1', 'user-a', 1)
  await flush()
  expect(await pending.list()).toEqual([])
  expect(apiFetch).not.toHaveBeenCalled()
  expect(rows.size).toBe(0)
})

it('does not submit an undone entry held in the drain’s batch snapshot', async () => {
  await pending.enqueue(payload('first'))
  await pending.enqueue(payload('second'))
  let release!: () => void
  postGate = new Promise(resolve => { release = resolve })
  const draining = flush()
  await waitFor(() => expect(posts()).toHaveLength(1))
  await undoPendingExpense('second', 'user-a', 1)
  release()
  await draining
  expect(posts()).toHaveLength(1)
  expect([...rows.keys()]).toEqual(['first'])
  expect(await pending.list()).toEqual([])
})

it('waits for an in-flight POST and deletes its committed row before confirming Undo', async () => {
  await pending.enqueue(payload())
  let release!: () => void
  postGate = new Promise(resolve => { release = resolve })
  const draining = flush()
  await waitFor(() => expect(posts()).toHaveLength(1))
  let finished = false
  const undoing = undoPendingExpense('c1', 'user-a', 1).then(() => { finished = true })
  await pending.list()
  expect(finished).toBe(false)
  expect(deletes()).toHaveLength(0)
  release()
  await Promise.all([draining, undoing])
  expect(rows.size).toBe(0)
  expect(creations).toBe(1)
  expect(await pending.list()).toEqual([])
})

it('uses the encrypted receipt after sync removed the queue entry', async () => {
  await pending.enqueue(payload())
  await flush()
  expect(await pending.list()).toEqual([])
  const raw = await AsyncStorage.getItem('mc-expense-sync-receipts:user-a')
  expect(raw).toMatch(/^aes-gcm-v1:/)
  expect(raw).not.toContain('Milk')
  expect(await pending.syncReceipt('c1', 'user-a')).toMatchObject({ id: 'row-1', version: 7 })
  await undoPendingExpense('c1', 'user-a', 1)
  expect(rows.size).toBe(0)
  expect(JSON.parse(String(deletes()[0][1]?.body))).toMatchObject({ id: 'row-1', version: 7 })
  expect(deletes()[0][2]).toBe(1)
})

it('recovers a lost POST response with the original client_id and creates no duplicate', async () => {
  losePostResponse = true
  await expect(postExpensePayload(payload(), 1)).rejects.toThrow('Network request failed')
  await pending.enqueue(payload(), 'user-a', true)
  losePostResponse = false
  await undoPendingExpense('c1', 'user-a', 1)
  expect(creations).toBe(1)
  expect(rows.size).toBe(0)
  expect(posts().map(([, init]) => JSON.parse(String(init?.body)).client_id)).toEqual(['c1', 'c1'])
})

it('treats legacy queued entries as uncertain, including entries moved to failed', async () => {
  await AsyncStorage.setItem('mc-pending-expenses:user-a', JSON.stringify([{ payload: payload(), attempts: 0 }]))
  await pending.bumpAttempts('c1', 1)
  await undoPendingExpense('c1', 'user-a', 1)
  expect(posts()).toHaveLength(1)
  expect(rows.size).toBe(0)
  expect(await pending.listFailed()).toEqual([])
})

it('keeps Undo retryable after a DELETE failure without replaying the create', async () => {
  await pending.enqueue(payload())
  await flush()
  deleteStatus = 500
  await expect(undoPendingExpense('c1', 'user-a', 1)).rejects.toThrow('Delete failed')
  expect(rows.size).toBe(1)
  deleteStatus = 200
  await undoPendingExpense('c1', 'user-a', 1)
  expect(rows.size).toBe(0)
  expect(posts()).toHaveLength(1)
})

it('does not override the server version if the synced expense was edited elsewhere', async () => {
  await pending.enqueue(payload())
  await flush()
  rows.get('c1')!.version = 8
  await expect(undoPendingExpense('c1', 'user-a', 1)).rejects.toBeInstanceOf(ExpenseWriteError)
  expect(rows.size).toBe(1)
  expect(await pending.syncReceipt('c1', 'user-a')).not.toHaveProperty('undone', true)
})

it('confirms an already-deleted exact id after a lost DELETE response without recreating it', async () => {
  await pending.enqueue(payload())
  await flush()
  loseDeleteResponse = true
  await expect(undoPendingExpense('c1', 'user-a', 1)).rejects.toThrow('Network request failed')
  expect(rows.size).toBe(0)
  loseDeleteResponse = false
  await undoPendingExpense('c1', 'user-a', 1)
  expect(rows.size).toBe(0)
  expect(posts()).toHaveLength(1)
})

it('preserves an uncertain queue entry when reconciliation is offline', async () => {
  await pending.enqueue(payload(), 'user-a', true)
  jest.mocked(apiFetch).mockRejectedValue(new TypeError('Network request failed'))
  await expect(undoPendingExpense('c1', 'user-a', 1)).rejects.toThrow('Network request failed')
  expect(await pending.list()).toHaveLength(1)
  expect(deletes()).toHaveLength(0)
})

it('does not POST if it cannot persist the submission marker', async () => {
  await pending.enqueue(payload())
  const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'))
  await flush()
  spy.mockImplementation(storageWrite)
  expect(posts()).toHaveLength(0)
  expect((await pending.list())[0].submitted).toBe(false)
})

it('retains the queue if journaling a committed POST fails, so Undo can recover its identity', async () => {
  await pending.enqueue(payload())
  const original = jest.mocked(AsyncStorage.setItem).getMockImplementation()!
  const spy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key, value) => {
    if (key.startsWith('mc-expense-sync-receipts:')) throw new Error('disk full')
    return original(key, value)
  })
  await flush()
  spy.mockImplementation(original)
  expect(await pending.list()).toHaveLength(1)
  expect(rows.size).toBe(1)
  await undoPendingExpense('c1', 'user-a', 1)
  expect(creations).toBe(1)
  expect(rows.size).toBe(0)
})

it('never recreates a deleted expense when queue cleanup fails and the drain retries', async () => {
  await pending.enqueue(payload(), 'user-a', true)
  const remove = jest.spyOn(pending, 'remove').mockRejectedValueOnce(new Error('disk full'))
  await expect(undoPendingExpense('c1', 'user-a', 1)).rejects.toThrow('disk full')
  remove.mockRestore()
  expect(rows.size).toBe(0)
  expect(await pending.list()).toHaveLength(1)
  await flush()
  expect(rows.size).toBe(0)
  expect(posts()).toHaveLength(1)
  expect(await pending.list()).toEqual([])
  await undoPendingExpense('c1', 'user-a', 1)
  expect(deletes()).toHaveLength(1)
})

it('does not DELETE or touch another account when the session changes during POST', async () => {
  await pending.enqueue(payload())
  let release!: () => void
  postGate = new Promise(resolve => { release = resolve })
  const draining = flush()
  await waitFor(() => expect(posts()).toHaveLength(1))
  const undoing = undoPendingExpense('c1', 'user-a', 1)
  jest.mocked(currentUserId).mockReturnValue('user-b')
  jest.mocked(sessionGeneration).mockReturnValue(2)
  release()
  await expect(undoing).rejects.toBeInstanceOf(SessionChangedError)
  await draining
  expect(deletes()).toHaveLength(0)
  expect(await pending.list('user-a')).toHaveLength(1)
  expect(await pending.list('user-b')).toEqual([])
})

it('rejects a stale screen before touching storage or making any request', async () => {
  await pending.enqueue(payload())
  jest.mocked(currentUserId).mockReturnValue('user-b')
  await expect(undoPendingExpense('c1', 'user-a', 1)).rejects.toBeInstanceOf(SessionChangedError)
  expect(await pending.list('user-a')).toHaveLength(1)
  expect(apiFetch).not.toHaveBeenCalled()
})

it('does not confirm Undo when both its queue entry and sync receipt are unavailable', async () => {
  await expect(undoPendingExpense('missing', 'user-a', 1)).rejects.toThrow('Could not confirm')
  expect(apiFetch).not.toHaveBeenCalled()
})
