import { AppState } from 'react-native'
import { apiFetch, startAppOpen, startAppOpenOnForeground } from './client'
import { appOpenPaths, forgetAppOpen } from './appOpen'
import { currentUserId, sessionGeneration } from './accessMode'
import { setActiveBudget } from '@/src/lib/activeBudget'
jest.mock('./accessMode', () => ({
  getValidToken: jest.fn(async () => 't'), sessionGeneration: jest.fn(() => 1), currentUserId: jest.fn(() => 'user_a'),
  SessionChangedError: class extends Error {}, currentAccessToken: jest.fn(), clearAccess: jest.fn(),
}))
jest.mock('@/src/lib/netStatus', () => ({ setOnline: jest.fn(), markSynced: jest.fn() }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const bundle = (slices: Record<string, { status: number; body: unknown }>) => json(slices)
let fetchMock: jest.SpyInstance
const urls = () => fetchMock.mock.calls.map(([u]) => String(u).replace(/^https?:\/\/[^/]+/, ''))

beforeEach(() => {
  forgetAppOpen('/api/expenses')
  ;(sessionGeneration as jest.Mock).mockReturnValue(1)
  ;(currentUserId as jest.Mock).mockReturnValue('user_a')
  fetchMock = jest.spyOn(global, 'fetch')
})
afterEach(() => jest.restoreAllMocks())

it('answers every bundled read from one request, and the rest for real', async () => {
  fetchMock.mockResolvedValueOnce(bundle({ '/api/budgets': { status: 200, body: { rows: ['b'] } }, '/api/groups?icons=1': { status: 200, body: [{ name: 'G' }] } }))
  startAppOpen()
  const [budgets, icons] = await Promise.all([apiFetch('/api/budgets'), apiFetch('/api/groups?icons=1')])
  expect(await budgets.json()).toEqual({ rows: ['b'] })
  expect(await icons.json()).toEqual([{ name: 'G' }])
  expect(urls()).toHaveLength(1)
  const sent = new URL(String(fetchMock.mock.calls[0][0]))
  expect(sent.pathname).toBe('/api/app-open')
  expect(sent.searchParams.getAll('p')).toEqual(appOpenPaths())

  fetchMock.mockResolvedValueOnce(json({ rows: [] }))
  await apiFetch('/api/expenses?from=2026-11-01')
  expect(urls()[1]).toBe('/api/expenses?from=2026-11-01')
})

it('a slice that is not a 200 asks the real route, so the gate still trips there', async () => {
  fetchMock.mockResolvedValueOnce(bundle({ '/api/budgets': { status: 402, body: { error: 'SUBSCRIPTION_REQUIRED' } } }))
  startAppOpen()
  fetchMock.mockResolvedValueOnce(json({ error: 'SUBSCRIPTION_REQUIRED' }, 402))
  expect((await apiFetch('/api/budgets')).status).toBe(402)
  expect(urls()[1]).toBe('/api/budgets')
})

it('a write ends the bundle: nothing after it is answered from data read before it', async () => {
  let rows = ['old']
  fetchMock.mockImplementation(async (url, init) => {
    if (String(url).includes('/api/app-open')) return bundle({ '/api/budgets': { status: 200, body: { rows: ['old'] } } })
    if (init?.method === 'PUT') rows = ['new']
    return init?.method ? json({ ok: true }) : json({ rows })
  })
  startAppOpen()
  // Registering the push token at launch touches nothing it read.
  await apiFetch('/api/notifications/register', { method: 'POST', body: '{}' })
  expect(await (await apiFetch('/api/budgets')).json()).toEqual({ rows: ['old'] })
  await apiFetch('/api/budgets', { method: 'PUT', body: '{}' })
  expect(await (await apiFetch('/api/budgets')).json()).toEqual({ rows: ['new'] })
})

it('never answers for another budget, another session, or a request with its own headers', async () => {
  fetchMock.mockImplementation(async (url) =>
    String(url).includes('/api/app-open') ? bundle({ '/api/categories': { status: 200, body: ['bundled'] } }) : json(['real']))
  startAppOpen()
  // Copying categories from another budget names it in its own header.
  expect(await (await apiFetch('/api/categories', { headers: { 'x-aviary-budget': 'sp_2' } })).json()).toEqual(['real'])
  setActiveBudget('sp_2')
  expect(await (await apiFetch('/api/categories')).json()).toEqual(['real'])
  setActiveBudget(null)
  ;(sessionGeneration as jest.Mock).mockReturnValue(2)
  expect(await (await apiFetch('/api/categories', undefined, 2)).json()).toEqual(['real'])
})

it('answers until 30s after it lands, however long it took, then stops', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
  let land: (r: Response) => void = () => {}
  fetchMock.mockImplementationOnce(() => new Promise((r) => { land = r }))
  startAppOpen()
  while (fetchMock.mock.calls.length === 0) await new Promise((r) => setTimeout(r, 0))
  // A slow first answer: Home mounts and asks well after it was sent.
  now.mockReturnValue(1_000_000 + 12_000)
  const early = apiFetch('/api/user')
  land(bundle({ '/api/user': { status: 200, body: { id: 'old' } } }))
  expect(await (await early).json()).toEqual({ id: 'old' })
  now.mockReturnValue(1_000_000 + 12_000 + 29_000)
  expect(await (await apiFetch('/api/user')).json()).toEqual({ id: 'old' })
  now.mockReturnValue(1_000_000 + 12_000 + 31_000)
  fetchMock.mockResolvedValueOnce(json({ id: 'new' }))
  expect(await (await apiFetch('/api/user')).json()).toEqual({ id: 'new' })
})

it('fires on a return from a background long enough for the data to go stale', async () => {
  const flush = () => new Promise((r) => setImmediate(r))
  let emit: (state: string) => void = () => {}
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, cb) => {
    emit = cb as (state: string) => void
    return { remove: jest.fn() } as never
  })
  const now = jest.spyOn(Date, 'now').mockReturnValue(0)
  fetchMock.mockImplementation(async () => bundle({}))
  const stop = startAppOpenOnForeground()
  emit('background')
  now.mockReturnValue(10_000)
  emit('active')
  await flush()
  expect(fetchMock).not.toHaveBeenCalled()
  emit('background')
  now.mockReturnValue(50_000)
  emit('active')
  await flush()
  expect(urls()).toHaveLength(1)
  expect(urls()[0]).toMatch(/^\/api\/app-open\?/)
  stop()
})

it('a write while a read waits on the bundle sends that read for real', async () => {
  let land: (r: Response) => void = () => {}
  fetchMock.mockImplementation((url) =>
    String(url).includes('/api/app-open') ? new Promise((r) => { land = r }) : Promise.resolve(json({ rows: ['new'] })))
  startAppOpen()
  while (fetchMock.mock.calls.length === 0) await new Promise((r) => setTimeout(r, 0))
  const waiting = apiFetch('/api/budgets')
  // A read that writes (a schedule posting a pay) ends it mid-flight.
  forgetAppOpen()
  land(bundle({ '/api/budgets': { status: 200, body: { rows: ['old'] } } }))
  expect(await (await waiting).json()).toEqual({ rows: ['new'] })
})

it('a bundle whose answer is not JSON lets every read fall through', async () => {
  fetchMock.mockImplementation(async (url) =>
    String(url).includes('/api/app-open') ? new Response('<html>oops</html>', { status: 200 }) : json({ id: 'u' }))
  startAppOpen()
  expect(await (await apiFetch('/api/user')).json()).toEqual({ id: 'u' })
})

it('falls through when the bundle fails, and never asks an older server again', async () => {
  fetchMock.mockResolvedValueOnce(json({ error: 'not found' }, 404))
  startAppOpen()
  fetchMock.mockResolvedValueOnce(json({ id: 'u' }))
  expect(await (await apiFetch('/api/user')).json()).toEqual({ id: 'u' })
  const before = fetchMock.mock.calls.length
  startAppOpen()
  expect(fetchMock.mock.calls.length).toBe(before)
})

it('skips signed out', () => {
  ;(currentUserId as jest.Mock).mockReturnValue(null)
  startAppOpen()
  expect(fetchMock).not.toHaveBeenCalled()
})
