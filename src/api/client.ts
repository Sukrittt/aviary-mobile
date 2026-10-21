// Ported from Web/src/services/api.ts's apiFetch, aimed at the deployed API
// instead of Next.js's own relative-path routes.
import { clearAccess, currentAccessToken, getValidToken, sessionGeneration, SessionChangedError } from './accessMode'
import { setOnline, markSynced } from '@/src/lib/netStatus'
import { markAccessBlocked, SUBSCRIPTION_REQUIRED_STATUS } from '@/src/lib/accessGate'
import { track } from '@/src/lib/analytics'
import { activeBudgetId, budgetHeaders, restoreActiveBudget } from '@/src/lib/activeBudget'
import { emitBudgetAccess } from '@/src/lib/budgetAccess'
import { connectionContext } from '@/src/lib/connectionTelemetry'

// A dev build with no API URL set would otherwise silently point at
// production data (see the fallback below) with no warning — fail loudly
// instead. Release builds keep the fallback: it's the intended default when
// EXPO_PUBLIC_API_URL isn't baked in.
if (__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  throw new Error('EXPO_PUBLIC_API_URL is not set. Set it in Mobile/.env for local development.')
}

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://www.useaviary.com'
// The apex answers a 308 to www, an extra round trip on every request.
export const WEB_URL = 'https://www.useaviary.com'

const REQUEST_TIMEOUT_MS = 15_000

// Requests waiting on a response right now. A dead pooled connection fails
// them all at once, so request_failed reports how many were stuck with it.
let inFlight = 0

/**
 * The token is fetched (and refreshed if stale) per request, so this must be
 * awaited — the old synchronous password lookup had nothing to refresh.
 * Signed-out callers send no header and the API answers as the demo user.
 */
export async function apiFetch(path: string, init?: RequestInit & { anonymous?: boolean }, expectedGeneration = sessionGeneration()): Promise<Response> {
  if (expectedGeneration !== sessionGeneration()) throw new SessionChangedError()
  const startedAt = Date.now()
  // `anonymous`: a public route. No token means no wait on a refresh, and the
  // CDN only caches requests without an Authorization header.
  const { anonymous, ...requestInit } = init ?? {}
  init = requestInit
  let token: string | null
  try {
    token = anonymous ? null : await getValidToken()
  } catch (err) {
    if (!(err instanceof SessionChangedError)) reportRequestFailure('token_refresh', path, err, startedAt)
    throw err
  }
  if (expectedGeneration !== sessionGeneration()) throw new SessionChangedError()
  // A cold start's first requests must name the budget the person was last in.
  if (token) await restoreActiveBudget()
  const tokenMs = Date.now() - startedAt
  // RN's fetch has no default timeout — without this, a hung connection
  // pins a screen's loading state forever. Callers already surface a
  // thrown error as a generic "check your connection" state, so a timeout
  // needs no special handling here.
  const signal = init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  let resp: Response
  inFlight += 1
  try {
    resp = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}`, ...budgetHeaders(activeBudgetId()) } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch (err) {
    // fetch() itself threw — no response at all, so this is a transport
    // failure, not a rejection.
    reportRequestFailure('fetch', path, err, startedAt, signal.aborted)
    // A timeout or abort means the server was slow (or the caller gave up, like
    // the 5s AI category suggestion), not that the device lost its connection.
    // Counting those flipped the whole app to the offline screen while online.
    if (!signal.aborted) setOnline(false, serverUnreachable)
    throw err
  } finally {
    inFlight -= 1
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
  if (resp.status === SUBSCRIPTION_REQUIRED_STATUS || resp.status === 403) {
    const body = await peekErrorBody(resp)
    // A shared budget whose owner's plan lapsed. This person's own access is
    // fine, so it must not trip the subscription gate (and its paywall).
    if (body?.error === 'BUDGET_READ_ONLY') {
      emitBudgetAccess({ kind: 'read_only' })
      throw new BudgetReadOnlyError()
    }
    // Thrown here so no wrapper's ": 403" message reaches the root layout's
    // auth check, which would sign the person out over a lost budget.
    if (body?.error === 'NOT_A_MEMBER') {
      emitBudgetAccess({ kind: 'not_a_member', spaceId: typeof body.spaceId === 'string' ? body.spaceId : null })
      throw new NotAMemberError()
    }
    if (resp.status === SUBSCRIPTION_REQUIRED_STATUS) markAccessBlocked()
  }
  return resp
}

/** `{error, spaceId}` without consuming the body the caller still reads. */
async function peekErrorBody(resp: Response): Promise<{ error?: unknown; spaceId?: unknown } | null> {
  try {
    return await resp.clone().json()
  } catch {
    return null
  }
}

/**
 * Diagnostics for requests that never got an answer: did the token refresh
 * stall, or the request itself, and what were the app and network doing?
 * Ids stripped from the path. The message is a transport error's (expo/fetch's
 * "fetch failed: <OkHttp reason>", the only place a timeout, a reset stream
 * and a DNS failure differ), clipped. Sent before setOnline(false), so the
 * first failure of a run still goes out even though track() skips while offline.
 */
function reportRequestFailure(phase: 'token_refresh' | 'fetch', path: string, err: unknown, startedAt: number, aborted = false): void {
  // AuthRefreshError's `reason`: what failed under the refresh (a timeout, no network, a WorkOS 5xx).
  const reason = (err as { reason?: unknown } | null)?.reason
  track('request_failed', {
    phase,
    path: metricPath(path),
    error: err instanceof Error ? err.name : 'unknown',
    ...(err instanceof Error && { message: err.message.slice(0, 120) }),
    ...(typeof reason === 'string' && { reason }),
    elapsed_ms: Date.now() - startedAt,
    aborted,
    in_flight: inFlight,
    ...connectionContext(),
  })
}

const PROBE_DELAY_MS = 2_000
const PROBE_TIMEOUT_MS = 8_000

/**
 * netStatus's last check before showing the offline screen: after a short
 * pause (long enough for a resumed app's radio to come back), is the server
 * still unreachable? Any HTTP answer, even a 404, means it's reachable, and so
 * does a timeout (slow, not gone, same as apiFetch above). Only fetch's own
 * network error confirms it.
 */
async function serverUnreachable(): Promise<boolean> {
  await new Promise((r) => setTimeout(r, PROBE_DELAY_MS))
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS)
  try {
    await fetch(BASE_URL, { method: 'HEAD', signal })
    return false
  } catch {
    // Read the signal, not the error: expo/fetch rejects a timeout with a
    // plain Error, so its name can't tell one apart.
    return !signal.aborted
  }
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

/** A write into a shared budget that's read-only until its owner renews. */
export class BudgetReadOnlyError extends HttpError {
  constructor() {
    super(SUBSCRIPTION_REQUIRED_STATUS, 'Budget is read-only')
  }
}

/** A request naming a budget this person is no longer in. */
export class NotAMemberError extends HttpError {
  constructor() {
    super(403, 'Not in this budget')
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
