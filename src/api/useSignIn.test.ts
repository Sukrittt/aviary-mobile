import { renderHook, waitFor } from '@testing-library/react-native'
import { subscribeExchanging, useSignIn } from './useSignIn'
import { exchangeCode } from './workos'

const mockResponse: { current: unknown } = { current: null }
jest.mock('expo-auth-session', () => ({
  ResponseType: { Code: 'code' },
  useAuthRequest: () => [{ codeVerifier: 'verifier' }, mockResponse.current, jest.fn()],
}))
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }))
jest.mock('./workos', () => ({ CLIENT_ID: 'client', DISCOVERY: {}, REDIRECT_URI: 'envelope://callback', exchangeCode: jest.fn() }))
jest.mock('./accessMode', () => ({ persistSession: jest.fn(() => Promise.resolve()) }))
jest.mock('../lib/analytics', () => ({ track: jest.fn() }))

describe('useSignIn exchanging signal', () => {
  it('is on while the code exchange runs, then off', async () => {
    let finish!: (v: unknown) => void
    ;(exchangeCode as jest.Mock).mockReturnValue(new Promise((r) => (finish = r)))
    const seen: boolean[] = []
    const unsubscribe = subscribeExchanging((on) => seen.push(on))

    mockResponse.current = { type: 'success', params: { code: 'abc' } }
    const { result } = renderHook(() => useSignIn())
    expect(seen).toEqual([true])

    finish({ accessToken: 'a', refreshToken: 'r', expiresAt: 0 })
    await waitFor(() => expect(result.current.done).toBe(true))
    expect(seen).toEqual([true, false])
    unsubscribe()
  })

  it('turns off when the exchange fails', async () => {
    ;(exchangeCode as jest.Mock).mockRejectedValue(new Error('503'))
    const seen: boolean[] = []
    const unsubscribe = subscribeExchanging((on) => seen.push(on))

    mockResponse.current = { type: 'success', params: { code: 'abc' } }
    const { result } = renderHook(() => useSignIn())
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(seen).toEqual([true, false])
    unsubscribe()
  })
})
