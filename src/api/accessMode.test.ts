import * as SecureStore from 'expo-secure-store'
import {
  accessMode,
  clearAccess,
  currentAccessToken,
  currentUserId,
  getValidToken,
  initAccessMode,
  persistSession,
} from './accessMode'
import { WorkOSHttpError, refreshTokens } from './workos'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))

jest.mock('./workos', () => ({
  ...jest.requireActual('./workos'),
  refreshTokens: jest.fn(),
}))

/** A JWT-shaped token whose payload carries a `sid`, so sessionId() resolves. */
function fakeToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user_1', sid: 'session_1', exp: 9_999_999_999 }),
  ).toString('base64')
  return `header.${payload}.signature`
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('clearAccess drops the session locally without any network call', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch')
  await persistSession({ accessToken: fakeToken(), refreshToken: 'r1', expiresAt: Date.now() + 3_600_000 })
  expect(currentAccessToken()).not.toBeNull()

  await clearAccess()

  expect(currentAccessToken()).toBeNull()
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('mc-session')
  // Regression guard: ending the WorkOS session is the caller's job (revokeSession).
  // The hosted-logout ping that used to live here is a browser redirect endpoint —
  // RN's fetch throws following it, which reported every sign-out as a failure.
  expect(fetchSpy).not.toHaveBeenCalled()
  fetchSpy.mockRestore()
})

it('clearAccess notifies logout subscribers', async () => {
  const onLogout = jest.fn()
  const unsubscribe = accessMode.subscribeLogout(onLogout)

  await persistSession({ accessToken: fakeToken(), refreshToken: 'r1', expiresAt: Date.now() + 3_600_000 })
  await clearAccess()

  expect(onLogout).toHaveBeenCalledTimes(1)
  unsubscribe()
})

/** An expired, JWT-shaped token so getValidToken() always attempts a refresh. */
function expiredToken(sub = 'user_1'): string {
  const payload = Buffer.from(JSON.stringify({ sub, sid: 'session_1', exp: 1 })).toString('base64')
  return `header.${payload}.signature`
}

describe('subscribe notifications', () => {
  it('fire on an identity change, not on a same-user token refresh', async () => {
    await clearAccess()
    const onChange = jest.fn()
    const unsubscribe = accessMode.subscribe(onChange)

    await persistSession({ accessToken: expiredToken('user_1'), refreshToken: 'r1', expiresAt: 1 })
    expect(onChange).toHaveBeenCalledTimes(1)

    // The root layout clears the whole query cache on this notification, so a
    // routine refresh firing it wiped in-progress screens (scan-bill's splits).
    ;(refreshTokens as jest.Mock).mockResolvedValue({ accessToken: fakeToken(), refreshToken: 'r2', expiresAt: Date.now() + 3_600_000 })
    await getValidToken()
    expect(onChange).toHaveBeenCalledTimes(1)

    await persistSession({ accessToken: expiredToken('user_2'), refreshToken: 'r3', expiresAt: 1 })
    expect(onChange).toHaveBeenCalledTimes(2)

    await clearAccess()
    expect(onChange).toHaveBeenLastCalledWith('guest')
    unsubscribe()
  })
})

describe('offline session survival (§1)', () => {
  it('a refresh failing with a network error keeps the session in SecureStore and throws', async () => {
    ;(refreshTokens as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))
    await persistSession({ accessToken: expiredToken(), refreshToken: 'r1', expiresAt: 1 })

    await expect(getValidToken()).rejects.toThrow()
    expect(currentAccessToken()).not.toBeNull()
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
  })

  it('a refresh failing with a 4xx clears the session', async () => {
    ;(refreshTokens as jest.Mock).mockRejectedValue(new WorkOSHttpError(400, 'invalid_grant'))
    await persistSession({ accessToken: expiredToken(), refreshToken: 'r1', expiresAt: 1 })

    await expect(getValidToken()).rejects.toThrow()
    expect(currentAccessToken()).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('mc-session')
  })

  it('initAccessMode() returns real from a stored blob whose access token is expired and whose refresh fails on the network', async () => {
    ;(refreshTokens as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ accessToken: expiredToken(), refreshToken: 'r1', expiresAt: 1 }),
    )

    const result = await initAccessMode()

    expect(result).toBe('real')
  })

  it('currentUserId() still resolves from an expired access token', async () => {
    await persistSession({ accessToken: expiredToken('user_offline'), refreshToken: 'r1', expiresAt: 1 })
    expect(currentUserId()).toBe('user_offline')
  })
})

describe('refresh ownership', () => {
  it('does not restore a session after logout while refresh is pending', async () => {
    let finish!: (v: unknown) => void
    ;(refreshTokens as jest.Mock).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await persistSession({ accessToken: expiredToken(), refreshToken: 'old', expiresAt: 1 })
    const refresh = getValidToken().catch(() => null)
    await clearAccess()
    finish({ accessToken: fakeToken(), refreshToken: 'new', expiresAt: Date.now() + 3600000 })
    await refresh
    expect(currentAccessToken()).toBeNull()
  })

  it('does not clear a new login when an older refresh is rejected', async () => {
    let reject!: (e: unknown) => void
    ;(refreshTokens as jest.Mock).mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    await persistSession({ accessToken: expiredToken(), refreshToken: 'old', expiresAt: 1 })
    const refresh = getValidToken().catch(() => null)
    await persistSession({ accessToken: expiredToken('user_2'), refreshToken: 'new-login', expiresAt: Date.now() + 3600000 })
    reject(new WorkOSHttpError(400, 'invalid_grant'))
    await refresh
    expect(currentUserId()).toBe('user_2')
  })

  it('surfaces a temporary refresh failure instead of returning a guest token', async () => {
    ;(refreshTokens as jest.Mock).mockRejectedValueOnce(new TypeError('offline'))
    await persistSession({ accessToken: expiredToken(), refreshToken: 'old', expiresAt: 1 })
    await expect(getValidToken()).rejects.toThrow()
    expect(currentUserId()).toBe('user_1')
  })
})

it('refreshes ahead of expiry so a mid-session request never waits on WorkOS', async () => {
  jest.useFakeTimers()
  try {
    jest.mocked(refreshTokens).mockResolvedValue({ accessToken: fakeToken(), refreshToken: 'r2', expiresAt: Date.now() + 3_600_000 })
    await persistSession({ accessToken: fakeToken(), refreshToken: 'r1', expiresAt: Date.now() + 5 * 60_000 })

    jest.advanceTimersByTime(3 * 60_000)
    expect(refreshTokens).not.toHaveBeenCalled()

    jest.advanceTimersByTime(60_000 + 1000)
    expect(refreshTokens).toHaveBeenCalledWith('r1')
  } finally {
    await clearAccess()
    jest.useRealTimers()
  }
})
