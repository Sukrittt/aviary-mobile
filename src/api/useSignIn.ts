// Shared WorkOS sign-in hook, used by the unlock screen and the More tab's
// guest → signed-in upgrade.
import { useCallback, useEffect, useState } from 'react'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { CLIENT_ID, DISCOVERY, REDIRECT_URI, exchangeCode } from './workos'
import { persistSession } from './accessMode'
import { track } from '../lib/analytics'

// Closes the auth browser tab once the redirect lands (no-op on native, needed
// for web builds).
WebBrowser.maybeCompleteAuthSession()

const SIGN_IN_FAILED = "Google sign-in didn't work. Try again."

// True while the code-for-token exchange runs after the browser closes. The
// root layout keeps the bird splash up through it, so the welcome screen
// doesn't flash back between Google and Home.
const exchangingSubs = new Set<(on: boolean) => void>()
export function subscribeExchanging(fn: (on: boolean) => void): () => void {
  exchangingSubs.add(fn)
  return () => exchangingSubs.delete(fn)
}
const setExchanging = (on: boolean) => exchangingSubs.forEach((fn) => fn(on))

export interface SignInState {
  /** Opens Google's consent screen directly (no AuthKit picker page). */
  signIn: () => void
  /** True from tapping sign-in until the token exchange settles. */
  pending: boolean
  /** True once tokens are stored — let the caller animate before navigating. */
  done: boolean
  error: string | null
}

export function useSignIn(): SignInState {
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      // PKCE: expo-auth-session generates the verifier and S256 challenge and
      // checks `state` on the way back, so the app ships no client secret.
      usePKCE: true,
      scopes: [],
      // GoogleOAuth skips the AuthKit picker — straight to Google's consent screen.
      extraParams: { provider: 'GoogleOAuth' },
    },
    DISCOVERY,
  )

  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!response) return

    if (response.type === 'error') {
      track('sign_in_failed', { method: 'google', reason: 'provider_error' })
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to the OAuth browser flow's async result, an external system
      setPending(false)
      // Never surface WorkOS/Google's raw error_description to the user.
      setError(SIGN_IN_FAILED)
      return
    }
    if (response.type !== 'success') {
      // 'cancel' / 'dismiss' — the user backed out; not an error, but still a
      // drop-off the funnel should see.
      track('sign_in_failed', { method: 'google', reason: 'cancelled' })
      setPending(false)
      return
    }

    const verifier = request?.codeVerifier
    if (!verifier) {
      track('sign_in_failed', { method: 'google', reason: 'missing_verifier' })
      setPending(false)
      setError(SIGN_IN_FAILED)
      return
    }

    let cancelled = false
    setExchanging(true)
    exchangeCode(response.params.code, verifier)
      .then(async (tokens) => {
        if (cancelled) return
        await persistSession(tokens)
        // After persistSession, so the event lands on the identified person.
        track('sign_in_completed', { method: 'google' })
        setDone(true)
      })
      .catch(() => {
        if (!cancelled) track('sign_in_failed', { method: 'google', reason: 'token_exchange_failed' })
        if (!cancelled) setError("Couldn't finish signing you in. Check your connection and try again.")
      })
      .finally(() => {
        setExchanging(false)
        if (!cancelled) setPending(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response])

  const signIn = useCallback(() => {
    if (!CLIENT_ID) {
      // Build misconfiguration (EXPO_PUBLIC_WORKOS_CLIENT_ID unset); don't show the env var name.
      setError("Google sign-in isn't available right now. Try email instead.")
      return
    }
    track('sign_in_started', { method: 'google' })
    setError(null)
    setPending(true)
    // Throws if tapped before the PKCE request has loaded.
    promptAsync().catch(() => {
      setPending(false)
      setError(SIGN_IN_FAILED)
    })
  }, [promptAsync])

  return { signIn, pending, done, error }
}
