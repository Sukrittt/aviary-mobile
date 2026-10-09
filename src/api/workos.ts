// WorkOS AuthKit over raw HTTP.
//
// No WorkOS SDK: @workos-inc/node needs `crypto.subtle`, which React Native
// doesn't have, and polyfilling it (react-native-quick-crypto) pulls in a
// native module for what amounts to three fetch calls. expo-auth-session
// already generates the PKCE verifier/challenge and validates `state`, so a
// public PKCE client needs nothing else — and, importantly, no client secret
// baked into the app bundle.
import * as AuthSession from 'expo-auth-session'
import * as Device from 'expo-device'

const API = 'https://api.workos.com/user_management'

/** Device label sent as `user_agent` at token exchange, so the security screen's
 * active-sessions list can show "iPhone 15 Pro" instead of a blank row. */
export function deviceLabel(): string {
  const model = Device.modelName ?? 'Unknown device'
  const os = Device.osName && Device.osVersion ? ` · ${Device.osName} ${Device.osVersion}` : ''
  return `${model}${os}`
}

export const CLIENT_ID = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID ?? ''

/** Must exactly match a redirect URI registered in the WorkOS dashboard. */
export const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'com.sukrit04.envelope',
  path: 'callback',
})

export const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `${API}/authorize`,
  tokenEndpoint: `${API}/authenticate`,
}

export interface WorkOSTokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms, read from the access token's own `exp` claim. */
  expiresAt: number
}

/** `exp` from a JWT payload, in epoch ms. Zero when it can't be read. */
export function tokenExpiry(accessToken: string): number {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return 0
    // base64url → base64, then decode. atob exists in Hermes.
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = JSON.parse(json).exp
    return typeof exp === 'number' ? exp * 1000 : 0
  } catch {
    return 0
  }
}

/** The WorkOS user id (`sub`) carried by an access token, or null. */
export function tokenUserId(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json).sub ?? null
  } catch {
    return null
  }
}

/** Thrown on a real WorkOS HTTP response (as opposed to a transport failure),
 * so callers can tell "token rejected" apart from "no network". */
export class WorkOSHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function post(body: Record<string, string>): Promise<WorkOSTokens> {
  const resp = await fetch(DISCOVERY.tokenEndpoint as string, {
    // Every apiFetch waits on a refresh before its own timeout starts, so a
    // hung one would stall every API call until the app is relaunched.
    signal: AbortSignal.timeout(15_000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, user_agent: deviceLabel(), ...body }),
  })
  if (!resp.ok) {
    throw new WorkOSHttpError(
      resp.status,
      `WorkOS ${body.grant_type} failed: ${resp.status} ${await resp.text()}`,
    )
  }
  const data = (await resp.json()) as { access_token: string; refresh_token: string }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: tokenExpiry(data.access_token),
  }
}

/** Trade an authorization code + PKCE verifier for a token pair. */
export function exchangeCode(code: string, codeVerifier: string): Promise<WorkOSTokens> {
  return post({ grant_type: 'authorization_code', code, code_verifier: codeVerifier })
}

/**
 * Trade a refresh token for a fresh pair. WorkOS rotates refresh tokens, so the
 * caller must store the returned `refreshToken` — reusing the old one fails.
 */
export function refreshTokens(refreshToken: string): Promise<WorkOSTokens> {
  return post({ grant_type: 'refresh_token', refresh_token: refreshToken })
}
