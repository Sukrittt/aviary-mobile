import { apiFetch } from './client'
import { getValidToken, sessionGeneration } from './accessMode'
import { track } from '@/src/lib/analytics'
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
