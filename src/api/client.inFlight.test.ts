import { apiFetch } from './client'
import { track } from '@/src/lib/analytics'
jest.mock('./accessMode', () => ({
  getValidToken: jest.fn(async () => 't'), sessionGeneration: jest.fn(() => 1),
  SessionChangedError: class extends Error {}, currentAccessToken: jest.fn(), clearAccess: jest.fn(),
}))
jest.mock('@/src/lib/netStatus', () => ({ setOnline: jest.fn(), markSynced: jest.fn() }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

afterEach(() => jest.restoreAllMocks())

it('api_request reports how many requests were in flight when it started', async () => {
  const pending: ((r: Response) => void)[] = []
  jest.spyOn(global, 'fetch').mockImplementation(() => new Promise((resolve) => { pending.push(resolve) }))
  const first = apiFetch('/api/budgets')
  const second = apiFetch('/api/categories')
  while (pending.length < 2) await new Promise((r) => setTimeout(r, 0))
  pending.forEach((resolve) => resolve(new Response('{}', { status: 200 })))
  await Promise.all([first, second])
  const sent = (track as jest.Mock).mock.calls.filter(([e]) => e === 'api_request').map(([, p]) => [p.path, p.in_flight])
  expect(sent).toEqual([['/api/budgets', 1], ['/api/categories', 2]])

  // Once the burst is over, a lone request is back to 1.
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(new Response('{}', { status: 200 }))
  await apiFetch('/api/user')
  expect((track as jest.Mock).mock.calls.at(-1)?.[1]).toMatchObject({ path: '/api/user', in_flight: 1 })
})
