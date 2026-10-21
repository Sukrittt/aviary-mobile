import { redirectSystemPath } from './+native-intent'

describe('redirectSystemPath', () => {
  const cb = 'envelope://callback?code=abc&state=xyz'

  it('swallows the OAuth callback while the app is running', () => {
    expect(redirectSystemPath({ path: cb, initial: false })).toBeNull()
    expect(redirectSystemPath({ path: 'com.sukrit04.envelope://callback?code=a', initial: false })).toBeNull()
  })

  it('sends a cold-start callback to the root', () => {
    expect(redirectSystemPath({ path: cb, initial: true })).toBe('/')
  })

  it('passes other links through', () => {
    expect(redirectSystemPath({ path: 'envelope://insights', initial: false })).toBe('envelope://insights')
  })
})

describe('invite links', () => {
  it('holds the code for the join sheet instead of routing', () => {
    const { takePendingJoinCode } = jest.requireActual('@/src/lib/pendingJoin')
    expect(redirectSystemPath({ path: 'envelope://join/ab12cd', initial: false })).toBeNull()
    expect(takePendingJoinCode()).toBe('AB12CD')
    expect(redirectSystemPath({ path: 'https://www.useaviary.com/join/ZZ99ZZ', initial: true })).toBe('/')
    expect(takePendingJoinCode()).toBe('ZZ99ZZ')
    expect(takePendingJoinCode()).toBeNull()
  })
})

describe('https App Links', () => {
  const { takePendingJoinCode } = jest.requireActual('@/src/lib/pendingJoin')

  it('opens the join sheet for a verified useaviary.com link, full or path-only', () => {
    expect(redirectSystemPath({ path: 'https://www.useaviary.com/join/qw12er?utm=x', initial: false })).toBeNull()
    expect(takePendingJoinCode()).toBe('QW12ER')
    // expo-router hands a live App Link over as just its path.
    expect(redirectSystemPath({ path: '/join/QW12ER', initial: false })).toBeNull()
    expect(takePendingJoinCode()).toBe('QW12ER')
  })

  it('leaves other site paths alone', () => {
    expect(redirectSystemPath({ path: '/joinery', initial: false })).toBe('/joinery')
    expect(takePendingJoinCode()).toBeNull()
  })
})
