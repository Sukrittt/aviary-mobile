import { apiFetch, metricPath } from './client'
import { getValidToken, sessionGeneration } from './accessMode'
import { track } from '@/src/lib/analytics'
import { setOnline } from '@/src/lib/netStatus'
import { setActiveBudget } from '@/src/lib/activeBudget'
jest.mock('./accessMode', () => ({
  getValidToken: jest.fn(), sessionGeneration: jest.fn(() => 1),
  SessionChangedError: class extends Error {}, currentAccessToken: jest.fn(), clearAccess: jest.fn(),
}))
jest.mock('@/src/lib/netStatus', () => ({ setOnline: jest.fn(), markSynced: jest.fn() }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
beforeEach(() => jest.clearAllMocks())
it('never sends a guest request when refreshing a real session fails', async () => {
  const fetch = jest.spyOn(global, 'fetch')
  ;(getValidToken as jest.Mock).mockRejectedValueOnce(new Error('refresh unavailable'))
  await expect(apiFetch('/api/expenses')).rejects.toThrow('refresh unavailable')
  expect(fetch).not.toHaveBeenCalled()
  fetch.mockRestore()
})
it('does not send a request after identity changes while resolving credentials', async () => {
  const fetch = jest.spyOn(global, 'fetch')
  ;(sessionGeneration as jest.Mock).mockReturnValueOnce(1).mockReturnValueOnce(1).mockReturnValue(2)
  ;(getValidToken as jest.Mock).mockResolvedValue('old')
  await expect(apiFetch('/api/expenses')).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
  fetch.mockRestore()
})
it('reports a failed token refresh as its own phase', async () => {
  ;(getValidToken as jest.Mock).mockRejectedValueOnce(new Error('refresh unavailable'))
  await expect(apiFetch('/api/ai/chat/sessions/6ac79f588f42153bdc36f9b8?x=1')).rejects.toThrow()
  expect(track).toHaveBeenCalledWith('request_failed', expect.objectContaining({
    phase: 'token_refresh', path: '/api/ai/chat/sessions/:id', error: 'Error',
  }))
})
it('reports a request that got no response', async () => {
  ;(getValidToken as jest.Mock).mockResolvedValue('t')
  const fetch = jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))
  await expect(apiFetch('/api/archive')).rejects.toThrow()
  expect(track).toHaveBeenCalledWith('request_failed', expect.objectContaining({ phase: 'fetch', path: '/api/archive', error: 'TypeError' }))
  fetch.mockRestore()
})
it('records the timing and status of every answered request', async () => {
  ;(getValidToken as jest.Mock).mockResolvedValue('t')
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 503 }))
  await apiFetch('/api/expenses/6ac79f588f42153bdc36f9b8?x=1', { method: 'PATCH' })
  expect(track).toHaveBeenCalledWith('api_request', expect.objectContaining({
    path: '/api/expenses/:id', method: 'PATCH', status: 503, ok: false,
    duration_ms: expect.any(Number), token_ms: expect.any(Number),
  }))
  fetch.mockRestore()
})
it('does not call a timed-out request a lost connection', async () => {
  ;(getValidToken as jest.Mock).mockResolvedValue('t')
  const controller = new AbortController()
  controller.abort()
  const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
  const fetch = jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('fetch failed: Canceled'))
  await expect(apiFetch('/api/category-map/suggest')).rejects.toThrow()
  expect(setOnline).not.toHaveBeenCalledWith(false, expect.any(Function))
  expect(track).toHaveBeenCalledWith('request_failed', expect.objectContaining({ aborted: true }))
  fetch.mockRestore()
  timeout.mockRestore()
})
it('treats a request that could not reach the network as offline', async () => {
  ;(getValidToken as jest.Mock).mockResolvedValue('t')
  const fetch = jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))
  await expect(apiFetch('/api/expenses')).rejects.toThrow()
  expect(setOnline).toHaveBeenCalledWith(false, expect.any(Function))
  fetch.mockRestore()
})

it('only confirms offline when a follow-up probe also cannot reach the server', async () => {
  jest.useFakeTimers()
  ;(getValidToken as jest.Mock).mockResolvedValue('t')
  const fetch = jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))
  await expect(apiFetch('/api/expenses')).rejects.toThrow()
  const confirmOffline = (setOnline as jest.Mock).mock.calls.find(([v]) => v === false)[1] as () => Promise<boolean>

  fetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
  const reachable = confirmOffline()
  await jest.advanceTimersByTimeAsync(2_000)
  await expect(reachable).resolves.toBe(false)

  fetch.mockRejectedValueOnce(new TypeError('Network request failed'))
  const unreachable = confirmOffline()
  await jest.advanceTimersByTimeAsync(2_000)
  await expect(unreachable).resolves.toBe(true)

  fetch.mockRestore()
  jest.useRealTimers()
})
it('sends a public request without a token, so it never waits on a refresh', async () => {
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }))
  await apiFetch('/api/system/status', { anonymous: true })
  expect(getValidToken).not.toHaveBeenCalled()
  const [, init] = fetch.mock.calls[0] as [string, RequestInit & { anonymous?: boolean }]
  expect(init.headers).toEqual({})
  expect(init.anonymous).toBeUndefined()
  fetch.mockRestore()
})
describe('the active budget header', () => {
  afterEach(() => setActiveBudget(null))
  const sent = (fetch: jest.SpyInstance) => (fetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>

  it('sends no budget header for the personal budget, exactly like before budgets', async () => {
    ;(getValidToken as jest.Mock).mockResolvedValue('t')
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}'))
    await apiFetch('/api/expenses')
    expect(sent(fetch)).not.toHaveProperty('x-aviary-budget')
    fetch.mockRestore()
  })

  it('names the active budget on every request', async () => {
    setActiveBudget('sp_home')
    ;(getValidToken as jest.Mock).mockResolvedValue('t')
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}'))
    await apiFetch('/api/expenses')
    expect(sent(fetch)['x-aviary-budget']).toBe('sp_home')
    fetch.mockRestore()
  })

  it('lets a caller pin a different budget, as the offline queue does', async () => {
    setActiveBudget('sp_trip')
    ;(getValidToken as jest.Mock).mockResolvedValue('t')
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}'))
    await apiFetch('/api/expenses', { headers: { 'x-aviary-budget': 'sp_home' } })
    expect(sent(fetch)['x-aviary-budget']).toBe('sp_home')
    fetch.mockRestore()
  })
})

// expo/fetch (Expo's global fetch since SDK 57) rejects an aborted request
// with a plain Error, name "Error". Its name can't tell a timeout apart, so
// apiFetch reads its own signal instead (PostHog 2026-10-21: every 15s
// timeout reported as "Error" and flipped the app toward the offline screen).
it('does not call an aborted expo/fetch request a lost connection', async () => {
  ;(getValidToken as jest.Mock).mockResolvedValue('t')
  const controller = new AbortController()
  const fetch = jest.spyOn(global, 'fetch').mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
    const fail = () => reject(new Error('fetch failed: Canceled'))
    if (init?.signal?.aborted) fail()
    else init?.signal?.addEventListener('abort', fail)
  }))
  controller.abort()
  await expect(apiFetch('/api/expenses', { signal: controller.signal })).rejects.toThrow()
  expect(setOnline).not.toHaveBeenCalledWith(false, expect.any(Function))
  expect(track).toHaveBeenCalledWith('request_failed', expect.objectContaining({ aborted: true, message: 'fetch failed: Canceled' }))
  fetch.mockRestore()
})

it('reports what the app and network were doing when a request died', async () => {
  ;(getValidToken as jest.Mock).mockResolvedValue('t')
  const fetch = jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'))
  await expect(apiFetch('/api/expenses')).rejects.toThrow()
  expect(track).toHaveBeenCalledWith('request_failed', expect.objectContaining({
    aborted: false, in_flight: 1, app_state: expect.anything(), network: expect.any(String),
    since_active_ms: expect.any(Number), since_launch_ms: expect.any(Number), since_network_change_ms: expect.any(Number),
  }))
  fetch.mockRestore()
})
it('keeps a budget invite code out of analytics', () => {
  expect(metricPath('/api/join/ABC123')).toBe('/api/join/:code')
  expect(metricPath('/api/join/ABC123/preview?x=1')).toBe('/api/join/:code/preview')
  expect(metricPath('/api/ai/chat/sessions/6ac79f588f42153bdc36f9b8?x=1')).toBe('/api/ai/chat/sessions/:id')
})
