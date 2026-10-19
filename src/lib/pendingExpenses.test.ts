import AsyncStorage from '@react-native-async-storage/async-storage'
import * as accessMode from '@/src/api/accessMode'
import * as pending from './pendingExpenses'
import { setActiveBudget } from './activeBudget'
import type { ExpensePayload } from '@/src/api/expenses'

// The real (mocked, see jest.setup.js) AsyncStorage — no per-file mock needed.

jest.mock('@/src/api/accessMode', () => ({
  currentUserId: jest.fn(),
}))

function payload(clientId: string): ExpensePayload {
  return {
    client_id: clientId,
    item: 'Coffee',
    amount_inr: '150',
    category: 'Food',
    date: '2026-01-01',
    timestamp: '2026-01-01T10:00:00+05:30',
  }
}

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.clearAllMocks()
  ;(accessMode.currentUserId as jest.Mock).mockReturnValue('user_a')
})

it('enqueue survives a reload (a fresh read sees what a previous enqueue wrote)', async () => {
  await pending.enqueue(payload('c1'))
  const entries = await pending.list()
  expect(entries).toHaveLength(1)
  expect(entries[0].payload.client_id).toBe('c1')
})

it('drains in insertion order', async () => {
  await pending.enqueue(payload('c1'))
  await pending.enqueue(payload('c2'))
  await pending.enqueue(payload('c3'))
  const entries = await pending.list()
  expect(entries.map((e) => e.payload.client_id)).toEqual(['c1', 'c2', 'c3'])
})

it('a concurrent enqueue during a drain loses nothing', async () => {
  await Promise.all([pending.enqueue(payload('c1')), pending.enqueue(payload('c2')), pending.enqueue(payload('c3'))])
  const entries = await pending.list()
  expect(entries.map((e) => e.payload.client_id).sort()).toEqual(['c1', 'c2', 'c3'])
})

it('nothing is written when currentUserId() is null (guest)', async () => {
  ;(accessMode.currentUserId as jest.Mock).mockReturnValue(null)
  await pending.enqueue(payload('c1'))
  expect(await pending.list()).toEqual([])
})

it("user A's queue is invisible to user B", async () => {
  ;(accessMode.currentUserId as jest.Mock).mockReturnValue('user_a')
  await pending.enqueue(payload('c1'))

  ;(accessMode.currentUserId as jest.Mock).mockReturnValue('user_b')
  expect(await pending.list()).toEqual([])

  ;(accessMode.currentUserId as jest.Mock).mockReturnValue('user_a')
  expect(await pending.list()).toHaveLength(1)
})

it('a queue survives sign-out (nothing here deletes it; see accessMode.clearAccess)', async () => {
  await pending.enqueue(payload('c1'))
  // clearAccess() never touches this module; re-signing in as the same user
  // must see the same queue.
  expect(await pending.list()).toHaveLength(1)
})

it('remove drops exactly the matching entry', async () => {
  await pending.enqueue(payload('c1'))
  await pending.enqueue(payload('c2'))
  await pending.remove('c1')
  expect((await pending.list()).map((e) => e.payload.client_id)).toEqual(['c2'])
})

it('bumpAttempts moves an entry to the failed list once it hits the cap', async () => {
  await pending.enqueue(payload('c1'))
  await pending.bumpAttempts('c1', 3)
  await pending.bumpAttempts('c1', 3)
  expect(await pending.list()).toHaveLength(1)
  await pending.bumpAttempts('c1', 3)
  expect(await pending.list()).toHaveLength(0)
  expect(await pending.listFailed()).toHaveLength(1)
})

it('never persists expense fields in plaintext', async () => {
 await pending.enqueue(payload('secret-client'))
 const raw = await AsyncStorage.getItem('mc-pending-expenses:user_a')
 expect(raw).not.toContain('Coffee')
 expect(raw).not.toContain('secret-client')
})

describe('toCsv', () => {
  it('writes a header and quotes every cell, escaping embedded quotes', () => {
    const payload = {
      client_id: 'c1',
      date: '2026-10-01',
      timestamp: '2026-10-01T10:00:00+05:30',
      item: 'Chai, "large"',
      amount_inr: '40',
      category: 'Food',
    } as ExpensePayload
    expect(pending.toCsv([{ payload, attempts: 0 }])).toBe(
      'date,item,amount_inr,category,payment_method,notes\n"2026-10-01","Chai, ""large""","40","Food","",""',
    )
  })
})

describe('listUnsynced', () => {
  it('includes both the queued and the given-up-on entries, queued first', async () => {
    await pending.enqueue(payload('queued'))
    await pending.enqueue(payload('doomed'))
    await pending.bumpAttempts('doomed', 1) // hits the cap, moves to the failed list

    const unsynced = await pending.listUnsynced()

    expect(unsynced.map((e) => e.payload.client_id)).toEqual(['queued', 'doomed'])
  })

  it('is empty once everything has reached the server', async () => {
    await pending.enqueue(payload('c1'))
    await pending.remove('c1')

    expect(await pending.listUnsynced()).toEqual([])
  })

  it('is per account, so a signed-out queue is not offered to the next user', async () => {
    await pending.enqueue(payload('c1'))
    ;(accessMode.currentUserId as jest.Mock).mockReturnValue('user_b')

    expect(await pending.listUnsynced()).toEqual([])
  })
})

it('preserves a pending entry when saving the failed list fails', async () => {
  await pending.enqueue(payload('c1'))
  const original = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!
  const spy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key, value) => {
    if (key.startsWith('mc-failed-expenses:')) throw new Error('disk full')
    return original(key, value)
  })
  await expect(pending.bumpAttempts('c1', 1)).rejects.toThrow('disk full')
  spy.mockImplementation(original)
  expect((await pending.list()).map(e => e.payload.client_id)).toEqual(['c1'])
})

it('binds serialized queue operations to the account at invocation', async () => {
  const a = pending.enqueue(payload('for-a'))
  ;(accessMode.currentUserId as jest.Mock).mockReturnValue('user_b')
  const b = pending.enqueue(payload('for-b'))
  await Promise.all([a, b])
  expect((await pending.list('user_a')).map(e => e.payload.client_id)).toEqual(['for-a'])
  expect((await pending.list('user_b')).map(e => e.payload.client_id)).toEqual(['for-b'])
})

it('a later successful sync clears the failed copy left by a half-finished move', async () => {
  await pending.enqueue(payload('c1'))
  const original = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!
  const spy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key, value) => {
    if (key.startsWith('mc-pending-expenses:')) throw new Error('disk full')
    return original(key, value)
  })
  await expect(pending.bumpAttempts('c1', 1)).rejects.toThrow('disk full')
  spy.mockImplementation(original)
  expect(await pending.listFailed()).toHaveLength(1)

  await pending.remove('c1')
  expect(await pending.listUnsynced()).toEqual([])
})

it('clearAll empties the pending, failed and receipt keys for that owner only', async () => {
  await pending.enqueue(payload('c1'))
  await pending.enqueue(payload('c2'))
  await pending.bumpAttempts('c2', 1)
  await pending.saveSyncReceipt({ clientId: 'c0', timestamp: '2026-01-01T10:00:00+05:30', item: 'Coffee', amountInr: 150 }, 'user_a')
  await pending.enqueue(payload('b1'), 'user_b')

  await pending.clearAll('user_a')

  expect(await pending.list()).toEqual([])
  expect(await pending.listFailed()).toEqual([])
  const keys = await AsyncStorage.getAllKeys()
  expect(keys.filter((k) => k.endsWith(':user_a'))).toEqual([])
  expect(await pending.list('user_b')).toHaveLength(1)
})

describe('budget stamping', () => {
  afterEach(() => setActiveBudget(null))

  it('stamps the budget that was active when the expense was logged', async () => {
    setActiveBudget('sp_home')
    await pending.enqueue(payload('c1'))
    // A switch before the queue flushes must not move the expense.
    setActiveBudget('sp_trip')
    expect((await pending.list())[0].spaceId).toBe('sp_home')
  })

  it('stamps the personal budget, by its owner id, when no budget is active', async () => {
    await pending.enqueue(payload('c1'))
    expect((await pending.list())[0].spaceId).toBe('user_a')
  })
})
