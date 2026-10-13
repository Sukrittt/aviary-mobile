import { hiddenFeatures, isHidden, OPT_IN_FEATURES, OPT_IN_SINCE } from './features'

describe('hiddenFeatures', () => {
  it('keeps everything on for an account from before opt-in shipped', () => {
    expect(hiddenFeatures({ createdAt: '2026-03-01T10:00:00.000Z' })).toEqual([])
  })

  it('starts a new account with the extras off and the core on', () => {
    const user = { createdAt: OPT_IN_SINCE }
    expect(hiddenFeatures(user)).toEqual(OPT_IN_FEATURES)
    expect(isHidden(user, 'insights')).toBe(true)
    expect(isHidden(user, 'income')).toBe(false)
    expect(isHidden(user, 'recurring')).toBe(false)
  })

  it('treats a missing createdAt as an old account', () => {
    expect(hiddenFeatures({})).toEqual([])
  })

  it('always prefers a saved choice, even an empty one', () => {
    expect(hiddenFeatures({ createdAt: OPT_IN_SINCE, hiddenFeatures: [] })).toEqual([])
    expect(hiddenFeatures({ createdAt: '2025-01-01T00:00:00.000Z', hiddenFeatures: ['wrapped'] })).toEqual(['wrapped'])
  })

  it('keeps the opt-in extras hidden until the profile loads, so a hidden one never flashes in', () => {
    expect(hiddenFeatures(undefined)).toEqual(OPT_IN_FEATURES)
  })
})
