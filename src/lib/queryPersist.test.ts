import { QueryClient } from '@tanstack/react-query'
import { queryPersister, shouldPersistQuery } from './queryPersist'
import { readEncrypted, writeEncrypted } from './encryptedStorage'
import { setActiveBudget } from './activeBudget'

jest.mock('./encryptedStorage', () => ({ readEncrypted: jest.fn(async () => null), writeEncrypted: jest.fn(async () => {}) }))

function persisted(queryKey: unknown[], data: unknown = { ok: true }): boolean {
  const qc = new QueryClient()
  qc.setQueryData(queryKey, data)
  const result = shouldPersistQuery(qc.getQueryCache().find({ queryKey, exact: true })!)
  qc.clear() // drops the query's gc timer so Jest can exit
  return result
}

it('saves the data the main screens paint from', () => {
  expect(persisted(['budgets'])).toBe(true)
  expect(persisted(['expenses', 'recent', '2026-07-01'])).toBe(true)
  expect(persisted(['expenses', 'page', { page: 1, limit: 20 }])).toBe(true)
  expect(persisted(['categories'])).toBe(true)
})

it('leaves out all-time expense history, billing and system status', () => {
  expect(persisted(['expenses'])).toBe(false)
  expect(persisted(['billing-status'])).toBe(false)
  expect(persisted(['system-status'])).toBe(false)
  expect(persisted(['ai-brief'])).toBe(false)
})

it('leaves out the photo feed, whose signed URLs expire within the hour', () => {
  expect(persisted(['expenses', 'feed', { limit: 20 }])).toBe(false)
})

it('saves only the first unfiltered Activity page', () => {
  expect(persisted(['expenses', 'page', { page: 2, limit: 20 }])).toBe(false)
  expect(persisted(['expenses', 'page', { page: 1, limit: 20, q: 'milk' }])).toBe(false)
  expect(persisted(['expenses', 'page', { page: 1, limit: 20, category: 'Food' }])).toBe(false)
})

it('stores the snapshot through the encrypted store', async () => {
  jest.useFakeTimers()
  const client = { timestamp: 1, buster: 'b', clientState: { mutations: [], queries: [] } }
  await queryPersister.persistClient(client as never)
  await jest.advanceTimersByTimeAsync(1100) // the persister throttles writes by 1s
  expect(writeEncrypted).toHaveBeenCalledWith('rq-cache', expect.stringContaining('"buster":"b"'))
  await queryPersister.restoreClient()
  expect(readEncrypted).toHaveBeenCalledWith('rq-cache')
  jest.useRealTimers()
})

it('a throttled save lands under the budget it was requested for, not the one switched to since', async () => {
  jest.useFakeTimers()
  const client = (buster: string) => ({ timestamp: 1, buster, clientState: { mutations: [], queries: [] } }) as never
  void queryPersister.persistClient(client('a1'))
  // Within the throttle window: queued, and runs after the switch below.
  void queryPersister.persistClient(client('a2'))
  setActiveBudget('sp_home')
  await jest.advanceTimersByTimeAsync(2100)
  expect(writeEncrypted).toHaveBeenCalledWith('rq-cache', expect.stringContaining('"buster":"a2"'))
  expect(writeEncrypted).not.toHaveBeenCalledWith('rq-cache:sp_home', expect.anything())
  await queryPersister.restoreClient()
  expect(readEncrypted).toHaveBeenCalledWith('rq-cache:sp_home')
  setActiveBudget(null)
  jest.useRealTimers()
})
