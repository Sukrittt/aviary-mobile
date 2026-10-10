import { act, renderHook, waitFor } from '@testing-library/react-native'
import { subscribeExchanging, useSignIn } from './useSignIn'
import { exchangeCode } from './workos'
import { track } from '../lib/analytics'

const mockResponse: { current: unknown } = { current: null }
const mockPromptAsync = jest.fn()
jest.mock('expo-auth-session', () => ({
  ResponseType: { Code: 'code' },
  useAuthRequest: () => [{ codeVerifier: 'verifier' }, mockResponse.current, mockPromptAsync],
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

describe('useSignIn prompt', () => {
  it('unlocks the button when the auth prompt throws', async () => {
    // expo-auth-session throws if tapped before the PKCE request has loaded.
    mockPromptAsync.mockRejectedValue(new Error('Cannot prompt to authenticate until the request has finished loading.'))
    mockResponse.current = null
    const { result } = renderHook(() => useSignIn())
    act(() => result.current.signIn())
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.error).toBe("Google sign-in didn't work. Try again.")
    expect(track).toHaveBeenCalledWith('sign_in_failed', { method: 'google', reason: 'prompt_failed' })
  })
})
