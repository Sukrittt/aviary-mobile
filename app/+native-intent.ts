// The WorkOS OAuth redirect (envelope://callback?code=…) is meant for
// expo-auth-session, which reads it off its own Linking listener. On Android
// the same URL also reaches expo-router, which has no `callback` route and
// shows "Unmatched Route". Drop it here: null skips navigation for a live link;
// on a cold start (Android killed the app while the browser was open) route to
// the root so the normal launch flow runs.
import { joinCodeFromPath, setPendingJoinCode } from '@/src/lib/pendingJoin'

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (/^[\w.+-]+:\/\/callback\b/.test(path) || path.startsWith('/callback')) {
    return initial ? '/' : null
  }
  // An invite: BudgetAccessWatcher opens the join sheet once there's a signed-in app to open it in.
  const code = joinCodeFromPath(path)
  if (code) {
    setPendingJoinCode(code)
    return initial ? '/' : null
  }
  return path
}
