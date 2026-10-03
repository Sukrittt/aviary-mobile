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
