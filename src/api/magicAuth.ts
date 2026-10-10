// Email sign-in. Unlike Google, WorkOS magic-auth codes require the secret
// API key to issue (createMagicAuth), so this can't hit WorkOS directly from
// the app — it goes through our own backend, which already holds that key.
import { BASE_URL } from './client'
import { deviceLabel, tokenExpiry } from './workos'
import { persistSession } from './accessMode'

// Same 15s ceiling apiFetch gives every other request. These can't use apiFetch
// (no session yet), so without it a hung connection pins the screen forever.
const TIMEOUT_MS = 15_000

/** Resolves false on any failure, transport included; never throws. */
export async function sendMagicAuthCode(email: string): Promise<boolean> {
  try {
    const resp = await fetch(`${BASE_URL}/api/auth/magic-auth/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return resp.ok
  } catch {
    return false
  }
}

/** Verifies the code and, on success, stores the resulting session. */
export async function verifyMagicAuthCode(email: string, code: string): Promise<boolean> {
  let resp: Response
  try {
    resp = await fetch(`${BASE_URL}/api/auth/magic-auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, device: deviceLabel() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return false
  }
  if (!resp.ok) return false

  const { accessToken, refreshToken } = (await resp.json()) as {
    accessToken: string
    refreshToken: string
  }
  await persistSession({ accessToken, refreshToken, expiresAt: tokenExpiry(accessToken) })
  return true
}
