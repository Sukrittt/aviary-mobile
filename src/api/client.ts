// Ported from Web/src/services/api.ts's apiFetch, aimed at the deployed API
// instead of Next.js's own relative-path routes.
import { clearAccess, currentAccessToken, getValidToken, sessionGeneration, SessionChangedError } from './accessMode'
import { setOnline, markSynced } from '@/src/lib/netStatus'
import { markAccessBlocked, SUBSCRIPTION_REQUIRED_STATUS } from '@/src/lib/accessGate'
import { track } from '@/src/lib/analytics'

// A dev build with no API URL set would otherwise silently point at
// production data (see the fallback below) with no warning — fail loudly
// instead. Release builds keep the fallback: it's the intended default when
// EXPO_PUBLIC_API_URL isn't baked in.
if (__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  throw new Error('EXPO_PUBLIC_API_URL is not set. Set it in Mobile/.env for local development.')
}

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://useaviary.com'
export const WEB_URL = 'https://useaviary.com'

const REQUEST_TIMEOUT_MS = 15_000

/**
 * The token is fetched (and refreshed if stale) per request, so this must be
 * awaited — the old synchronous password lookup had nothing to refresh.
 * Signed-out callers send no header and the API answers as the demo user.
 */
export async function apiFetch(path: string, init?: RequestInit, expectedGeneration = sessionGeneration()): Promise<Response> {
  if (expectedGeneration !== sessionGeneration()) throw new SessionChangedError()
  const startedAt = Date.now()
  let token: string | null
  try {
    token = await getValidToken()
  } catch (err) {
    if (!(err instanceof SessionChangedError)) reportRequestFailure('token_refresh', path, err, startedAt)
    throw err
  }
  if (expectedGeneration !== sessionGeneration()) throw new SessionChangedError()
  const tokenMs = Date.now() - startedAt
  let resp: Response
  try {
    resp = await fetch(`${BASE_URL}${path}`, {
      ...init,
      // RN's fetch has no default timeout — without this, a hung connection
      // pins a screen's loading state forever. Callers already surface a
      // thrown error as a generic "check your connection" state, so a timeout
      // (which throws an AbortError, same as any other network failure) needs
      // no special handling here.
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch (err) {
    // fetch() itself threw (TypeError, or AbortError from the timeout above)
    // — no response at all, so this is a transport failure, not a rejection.
    reportRequestFailure('fetch', path, err, startedAt)
    // A timeout or abort means the server was slow (or the caller gave up, like
    // the 5s AI category suggestion), not that the device lost its connection.
    // Counting those flipped the whole app to the offline screen while online.
    if (!isAbort(err)) setOnline(false)
    throw err
  }
  // Every answered request, for latency percentiles and error rates per
  // endpoint. Timed to the response headers, not the body download.
  track('api_request', {
    path: metricPath(path),
    method: init?.method ?? 'GET',
    status: resp.status,
    ok: resp.ok,
    duration_ms: Date.now() - startedAt,
    token_ms: tokenMs,
  })

  if (expectedGeneration !== sessionGeneration()) throw new SessionChangedError()

  // A response of any status means the request reached the server and came
  // back — the network is up, whatever the status says.
  setOnline(true)
  void markSynced()
  await handleUnauthorized(resp, token)
  // A 402 is the subscription gate. Flipping it here, rather than waiting for
  // a screen to notice, is what makes the app react the moment the API stops
  // answering — the same contract as the 401 handling above, except this one
  // must never end the session: the sign-in is fine, the subscription is not.
  if (resp.status === SUBSCRIPTION_REQUIRED_STATUS) markAccessBlocked()
  return resp
}

/**
 * Diagnostics for requests that never got an answer: did the token refresh
 * stall, or the request itself? Error name only, never the message, and ids
 * stripped from the path. Sent before setOnline(false), so the first failure
 * of a run still goes out even though track() skips while offline.
 */
function reportRequestFailure(phase: 'token_refresh' | 'fetch', path: string, err: unknown, startedAt: number): void {
  track('request_failed', {
    phase,
    path: metricPath(path),
    error: err instanceof Error ? err.name : 'unknown',
    elapsed_ms: Date.now() - startedAt,
  })
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

/** Query string dropped and ids collapsed, so one endpoint groups as one path. */
function metricPath(path: string): string {
  return path.split('?')[0].replace(/[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id')
}

/** Thrown by an API wrapper on a non-ok response, carrying the HTTP status so
 * a caller can tell "the server rejected this" apart from a transport failure
 * (which apiFetch above lets propagate as the original thrown error). */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/**
 * True when a rejection never made it to the server — offline, DNS, or the
 * timeout above — as opposed to the API answering and being refused. The API
 * wrappers put the status in their message (`...: 401`), so its absence is the
 * tell. Callers with a disk cache (categories, groups) serve it on a transport
 * failure and still surface everything else: a 401 has to reach _layout's
 * query-cache listener, a 402 the subscription gate.
 */
export function isTransportFailure(err: unknown): boolean {
  if (err instanceof HttpError) return false
  return !/: \d{3}\b/.test(err instanceof Error ? err.message : '')
}

/**
 * On a 401, drops the session if the token that drew it is still the live
 * session's. Shared by apiFetch above and streamChat (src/api/ai.ts), which
 * bypasses apiFetch (it needs expo/fetch for streaming) but must not skip
 * this — a revoked session on that endpoint used to never log the user out.
 *
 * A 401 means the token was rejected server-side despite still looking
 * locally valid (clock skew, a session revoked elsewhere) — getValidToken()
 * only refreshes against the locally cached expiry, so retrying would just
 * resend the same dead token. Drop the session instead and hand the 401 back:
 * app/_layout.tsx's query-cache listener turns it into a sign-in bounce.
 *
 * Deliberately NOT retried without the header. The API answers a
 * credential-less request with the demo account's data at 200, so a retry
 * renders the demo account on screen while the logout bounce is still in
 * flight — the "why am I seeing demo data" flash.
 *
 * Only clear when the token that drew the 401 is still the live session's: a
 * request fired just before a sign-in or refresh can land its stale 401 after
 * a fresher session took over, and clearing then would log the user straight
 * back out of the session that just replaced it.
 */
export async function handleUnauthorized(resp: Response, token: string | null): Promise<void> {
  if (resp.status === 401 && token && token === currentAccessToken()) {
    await clearAccess()
  }
}

/** Reads a `{error}` JSON body if present, falling back to a generic message. */
export async function apiErrorMessage(resp: Response, fallback: string): Promise<string> {
  try {
    const body = await resp.json()
    if (body && typeof body.error === 'string') return body.error
  } catch {
    // non-JSON body, fall through
  }
  return `${fallback}: ${resp.status}`
}

/** Confirms the stored session is still accepted by the API. */
export async function verifySession(): Promise<boolean> {
  const token = await getValidToken()
  if (!token) return false
  const resp = await fetch(`${BASE_URL}/api/auth/verify`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return resp.ok
}
