import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react-native'
import { subscribeExpenseQuerySync } from './querySync'
import { onExpenseSynced, emitExpenseSynced } from './events'
import { getValidToken, sessionGeneration, currentUserId } from '@/src/api/accessMode'
import { HttpError } from '@/src/api/client'
import { postExpensePayload } from '@/src/api/expenses'
import * as pending from '@/src/lib/pendingExpenses'
import { flush } from './flush'
import type { ExpensePayload } from '@/src/api/expenses'

jest.mock('@/src/api/accessMode', () => ({
  getValidToken: jest.fn(),
  currentUserId: jest.fn(() => 'user_1'),
  sessionGeneration: jest.fn(() => 1),
}))

jest.mock('@/src/api/client', () => ({
  HttpError: class HttpError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

jest.mock('@/src/api/expenses', () => ({
  postExpensePayload: jest.fn(),
}))

jest.mock('@/src/lib/pendingExpenses', () => ({
  list: jest.fn(),
  remove: jest.fn(),
  bumpAttempts: jest.fn(),
  setSubmitted: jest.fn(),
  syncReceipt: jest.fn(),
  saveSyncReceipt: jest.fn(),
}))

function entry(clientId: string) {
  return {
    attempts: 0,
    payload: {
      client_id: clientId,
      item: 'Coffee',
      amount_inr: '150',
      category: 'Food',
      date: '2026-01-01',
      timestamp: '2026-01-01T10:00:00+05:30',
    } as ExpensePayload,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(currentUserId as jest.Mock).mockReturnValue('user_1')
  ;(getValidToken as jest.Mock).mockResolvedValue('token')
  ;(sessionGeneration as jest.Mock).mockReturnValue(1)
})

it('a null token aborts without draining', async () => {
  ;(getValidToken as jest.Mock).mockResolvedValue(null)
  ;(pending.list as jest.Mock).mockResolvedValue([entry('c1')])

  await flush()

  expect(postExpensePayload).not.toHaveBeenCalled()
})

it('a successful drain empties the queue', async () => {
  ;(pending.list as jest.Mock).mockResolvedValue([entry('c1'), entry('c2')])
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'row-1', timestamp: 'ts' })

  await flush()

  expect(postExpensePayload).toHaveBeenCalledTimes(2)
  expect(pending.remove).toHaveBeenCalledWith('c1', 'user_1')
  expect(pending.remove).toHaveBeenCalledWith('c2', 'user_1')
})

it('a transport failure leaves the queue intact and stops the rest of the batch', async () => {
  ;(pending.list as jest.Mock).mockResolvedValue([entry('c1'), entry('c2')])
  ;(postExpensePayload as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))

  await flush()

  expect(postExpensePayload).toHaveBeenCalledTimes(1)
  expect(pending.remove).not.toHaveBeenCalled()
  expect(pending.bumpAttempts).not.toHaveBeenCalled()
})

it('a 4xx bumps attempts and moves on to the rest of the queue', async () => {
  ;(pending.list as jest.Mock).mockResolvedValue([entry('c1'), entry('c2')])
  ;(postExpensePayload as jest.Mock)
    .mockRejectedValueOnce(new HttpError(400, 'bad request'))
    .mockResolvedValueOnce({ id: 'row-2', timestamp: 'ts' })

  await flush()

  expect(pending.bumpAttempts).toHaveBeenCalledWith('c1', 3, 'user_1')
  expect(pending.remove).toHaveBeenCalledWith('c2', 'user_1')
})

it('two concurrent flush() calls make only one round of requests', async () => {
  let resolveList: (v: unknown) => void = () => {}
  ;(pending.list as jest.Mock).mockReturnValue(new Promise((resolve) => { resolveList = resolve }))
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'row-1', timestamp: 'ts' })

  const first = flush()
  const second = flush()
  resolveList([entry('c1')])
  await Promise.all([first, second])

  // One batch snapshot and one ownership check per entry, shared by both calls.
  expect(pending.list).toHaveBeenCalledTimes(2)
  expect(postExpensePayload).toHaveBeenCalledTimes(1)
})

/**
 * A 402 is the subscription gate, not a bad request. Without this, every
 * queued expense burns an attempt each time the queue drains, and three
 * rounds later — about ninety seconds after a trial quietly expires — they
 * are dead-lettered. The user renews and the expenses they logged offline
 * are gone. Losing someone's data because their card expired is the worst
 * outcome this feature has.
 */
it('a 402 leaves the queue intact and burns no attempts', async () => {
  ;(pending.list as jest.Mock).mockResolvedValue([entry('c1'), entry('c2')])
  ;(postExpensePayload as jest.Mock).mockRejectedValue(new HttpError(402, 'SUBSCRIPTION_REQUIRED'))

  await flush()

  expect(pending.bumpAttempts).not.toHaveBeenCalled()
  expect(pending.remove).not.toHaveBeenCalled()
  // Stops the whole drain: every remaining entry would hit the same gate, so
  // continuing is just noise against an API that is already saying no.
  expect(postExpensePayload).toHaveBeenCalledTimes(1)
})

it('resumes draining the same entries once access is restored', async () => {
  ;(pending.list as jest.Mock).mockResolvedValue([entry('c1'), entry('c2')])
  ;(postExpensePayload as jest.Mock).mockRejectedValue(new HttpError(402, 'SUBSCRIPTION_REQUIRED'))
  await flush()

  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'row-1', timestamp: 'ts' })
  await flush()

  expect(pending.remove).toHaveBeenCalledWith('c1', 'user_1')
  expect(pending.remove).toHaveBeenCalledWith('c2', 'user_1')
})

it.each([401, 408, 429, 500, 503])('preserves attempts on a retryable/session HTTP %s', async (status) => {
  ;(pending.list as jest.Mock).mockResolvedValue([entry('c1'), entry('c2')])
  ;(postExpensePayload as jest.Mock).mockRejectedValue(new HttpError(status, 'temporary'))
  await flush()
  expect(pending.bumpAttempts).not.toHaveBeenCalled()
  expect(postExpensePayload).toHaveBeenCalledTimes(1)
})


it('stops an already-loaded batch when the account changes', async () => {
  ;(pending.list as jest.Mock).mockResolvedValue([entry('c1'), entry('c2')])
  ;(postExpensePayload as jest.Mock).mockImplementationOnce(async () => {
    ;(sessionGeneration as jest.Mock).mockReturnValue(2)
    return { id: 'row-1' }
  })
  await flush()
  expect(postExpensePayload).toHaveBeenCalledTimes(1)
  expect(pending.remove).not.toHaveBeenCalled()
})


describe('mounted-query refresh after replay', () => {
  it.each(['bank', 'credit_card'])('refreshes Activity, Home/widget budgets, and create dependents for %s', async (payment_method) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    let saved = false
    const activityKey = ['expenses', 'page', { page: 1 }]
    const recentKey = ['expenses', 'recent', '2026-07-01']
    const serverExpense = { id: 'row-1', category: 'Food', amount_inr: '150', payment_method }
    const reads = [
      { queryKey: activityKey, initialData: { rows: [] as unknown[] }, queryFn: jest.fn(async () => ({ rows: saved ? [serverExpense] : [] })) },
      { queryKey: recentKey, initialData: { rows: [] as unknown[] }, queryFn: jest.fn(async () => ({ rows: saved ? [serverExpense] : [] })) },
      { queryKey: ['budgets'], initialData: { cardAssigned: 0 }, queryFn: jest.fn(async () => ({ cardAssigned: saved && payment_method === 'credit_card' ? 150 : 0 })) },
      ...['ai-brief', 'category-map', 'user'].map((prefix) => ({ queryKey: [prefix], initialData: { saved: false }, queryFn: jest.fn(async () => ({ saved })) })),
    ]
    const stops = reads.map((options) => new QueryObserver<unknown>(qc, { ...options, staleTime: Infinity }).subscribe(() => {}))
    const unsubscribe = subscribeExpenseQuerySync(qc)
    const queued = entry('c1')
    queued.payload.payment_method = payment_method
    ;(pending.list as jest.Mock).mockResolvedValue([queued])
    ;(postExpensePayload as jest.Mock).mockImplementationOnce(async () => { saved = true; return { id: 'row-1' } })
    try {
      await flush()
      await waitFor(() => expect(qc.getQueryData(activityKey)).toEqual({ rows: [serverExpense] }))
      expect(qc.getQueryData(recentKey)).toEqual({ rows: [serverExpense] })
      expect(qc.getQueryData(['budgets'])).toEqual({ cardAssigned: payment_method === 'credit_card' ? 150 : 0 })
      for (const read of reads) expect(read.queryFn).toHaveBeenCalledTimes(1)
      for (const prefix of ['ai-brief', 'category-map', 'user']) expect(qc.getQueryData([prefix])).toEqual({ saved: true })
      expect(pending.remove).toHaveBeenCalledWith('c1', 'user_1')
    } finally {
      unsubscribe()
      stops.forEach((stop) => stop())
      qc.clear()
    }
  })

  it('refreshes a successful write even when a later entry fails', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['expenses'], [])
    const unsubscribe = subscribeExpenseQuerySync(qc)
    ;(pending.list as jest.Mock).mockResolvedValue([entry('c1'), entry('c2')])
    ;(postExpensePayload as jest.Mock).mockResolvedValueOnce({ id: 'row-1' }).mockRejectedValueOnce(new TypeError('offline again'))
    try {
      await flush()
      expect(qc.getQueryState(['expenses'])?.isInvalidated).toBe(true)
      expect(pending.remove).toHaveBeenCalledTimes(1)
      expect(pending.remove).toHaveBeenCalledWith('c1', 'user_1')
    } finally { unsubscribe(); qc.clear() }
  })

  it('does not notify queries when a pending POST belongs to an old session', async () => {
    const listener = jest.fn()
    const unsubscribe = onExpenseSynced(listener)
    ;(pending.list as jest.Mock).mockResolvedValue([entry('c1')])
    ;(postExpensePayload as jest.Mock).mockImplementationOnce(async () => {
      ;(sessionGeneration as jest.Mock).mockReturnValue(2)
      return { id: 'old-session-row' }
    })
    try { await flush(); expect(listener).not.toHaveBeenCalled() } finally { unsubscribe() }
  })

  it.each([{ owner: 'user_2', generation: 1 }, { owner: 'user_1', generation: 0 }])('ignores a completion from another account/session %j', (event) => {
    const qc = new QueryClient()
    qc.setQueryData(['expenses'], [])
    const unsubscribe = subscribeExpenseQuerySync(qc)
    emitExpenseSynced(event)
    expect(qc.getQueryState(['expenses'])?.isInvalidated).toBe(false)
    unsubscribe()
    emitExpenseSynced({ owner: 'user_1', generation: 1 })
    expect(qc.getQueryState(['expenses'])?.isInvalidated).toBe(false)
    qc.clear()
  })

  it('still removes a successful entry when a completion listener throws', async () => {
    const stop = onExpenseSynced(() => { throw new Error('observer failed') })
    ;(pending.list as jest.Mock).mockResolvedValue([entry('c1')])
    ;(postExpensePayload as jest.Mock).mockResolvedValueOnce({ id: 'row-1' })
    try { await flush(); expect(pending.remove).toHaveBeenCalledWith('c1', 'user_1') } finally { stop() }
  })
})
