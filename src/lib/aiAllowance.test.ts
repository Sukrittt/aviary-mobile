import {
  AI_ALLOWANCE_EXCEEDED,
  isAiAllowanceError,
  nextAllowanceReset,
  onAiAllowanceExceeded,
  rejectIfAllowanceExceeded,
} from './aiAllowance'

jest.mock('./analytics', () => ({ track: jest.fn() }))

const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('rejectIfAllowanceExceeded', () => {
  it('throws the allowance error and notifies listeners for a user-initiated request', async () => {
    const heard = jest.fn()
    const off = onAiAllowanceExceeded(heard)
    await expect(rejectIfAllowanceExceeded(resp(429, { code: AI_ALLOWANCE_EXCEEDED, error: 'Used up.' }), true)).rejects.toMatchObject({
      message: 'Used up.',
    })
    expect(heard).toHaveBeenCalledTimes(1)
    off()
  })

  it('throws but stays quiet for the automatic brief', async () => {
    const heard = jest.fn()
    const off = onAiAllowanceExceeded(heard)
    const err = await rejectIfAllowanceExceeded(resp(429, { code: AI_ALLOWANCE_EXCEEDED }), false).catch((e) => e)
    expect(isAiAllowanceError(err)).toBe(true)
    expect(heard).not.toHaveBeenCalled()
    off()
  })

  it('ignores the burst rate limiter, which is also a 429', async () => {
    const heard = jest.fn()
    const off = onAiAllowanceExceeded(heard)
    await expect(rejectIfAllowanceExceeded(resp(429, { error: 'too many requests' }), true)).resolves.toBeUndefined()
    expect(heard).not.toHaveBeenCalled()
    off()
  })

  it('ignores other statuses and non-JSON bodies, and leaves the body readable for the caller', async () => {
    await expect(rejectIfAllowanceExceeded(resp(200, { ok: true }), true)).resolves.toBeUndefined()
    const garbled = new Response('<html>', { status: 429 })
    await expect(rejectIfAllowanceExceeded(garbled, true)).resolves.toBeUndefined()
    const okResp = resp(500, { error: 'boom' })
    await rejectIfAllowanceExceeded(okResp, true)
    expect(await okResp.json()).toEqual({ error: 'boom' })
  })

  it('stops notifying once unsubscribed', async () => {
    const heard = jest.fn()
    onAiAllowanceExceeded(heard)()
    await rejectIfAllowanceExceeded(resp(429, { code: AI_ALLOWANCE_EXCEEDED }), true).catch(() => {})
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('nextAllowanceReset', () => {
  it('is the first of next month, UTC, matching the server', () => {
    expect(nextAllowanceReset(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(nextAllowanceReset(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('ai_allowance_hit', () => {
  it('reports which feature ran into the cap', async () => {
    const { track } = jest.requireMock('./analytics') as { track: jest.Mock }
    await expect(rejectIfAllowanceExceeded(resp(429, { code: AI_ALLOWANCE_EXCEEDED }), false, 'scan')).rejects.toBeTruthy()
    expect(track).toHaveBeenCalledWith('ai_allowance_hit', { feature: 'scan' })
  })

  it('stays quiet for an ordinary rate limit', async () => {
    const { track } = jest.requireMock('./analytics') as { track: jest.Mock }
    track.mockClear()
    await rejectIfAllowanceExceeded(resp(429, { error: 'slow down' }), false, 'chat')
    expect(track).not.toHaveBeenCalled()
  })
})
