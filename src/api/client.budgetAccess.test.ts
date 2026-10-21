import { apiFetch, BudgetReadOnlyError, NotAMemberError } from './client'
import { getValidToken } from './accessMode'
import { isAccessBlocked, markAccessAllowed } from '@/src/lib/accessGate'
import { onBudgetAccess } from '@/src/lib/budgetAccess'
jest.mock('./accessMode', () => ({
  getValidToken: jest.fn(async () => 't'), sessionGeneration: jest.fn(() => 1),
  SessionChangedError: class extends Error {}, currentAccessToken: jest.fn(), clearAccess: jest.fn(),
}))
jest.mock('@/src/lib/netStatus', () => ({ setOnline: jest.fn(), markSynced: jest.fn() }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

const answer = (status: number, body: unknown) => jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))
let events: unknown[]
let off: () => void
beforeEach(() => {
  ;(getValidToken as jest.Mock).mockResolvedValue('t')
  markAccessAllowed()
  events = []
  off = onBudgetAccess((e) => events.push(e))
})
afterEach(() => {
  off()
  jest.restoreAllMocks()
})

it("a read-only shared budget is not the paywall: the gate stays open", async () => {
  answer(402, { error: 'BUDGET_READ_ONLY', mode: 'expired' })
  await expect(apiFetch('/api/expenses', { method: 'POST' })).rejects.toBeInstanceOf(BudgetReadOnlyError)
  expect(isAccessBlocked()).toBe(false)
  expect(events).toEqual([{ kind: 'read_only' }])
})

it('still closes the gate on the subscription 402', async () => {
  answer(402, { error: 'SUBSCRIPTION_REQUIRED' })
  const resp = await apiFetch('/api/expenses', { method: 'POST' })
  expect(resp.status).toBe(402)
  expect(isAccessBlocked()).toBe(true)
  // The caller can still read the body.
  expect(await resp.json()).toEqual({ error: 'SUBSCRIPTION_REQUIRED' })
})

it('turns NOT_A_MEMBER into its own error, without a status the layout would sign you out over', async () => {
  answer(403, { error: 'NOT_A_MEMBER', spaceId: 'sp_home' })
  const err = await apiFetch('/api/budgets').catch((e) => e)
  expect(err).toBeInstanceOf(NotAMemberError)
  expect(err.message).not.toMatch(/: 403/)
  expect(events).toEqual([{ kind: 'not_a_member', spaceId: 'sp_home' }])
})

it('leaves any other 403 alone', async () => {
  answer(403, { error: 'NOT_OWNER' })
  expect((await apiFetch('/api/spaces/x', { method: 'DELETE' })).status).toBe(403)
  expect(events).toEqual([])
})
