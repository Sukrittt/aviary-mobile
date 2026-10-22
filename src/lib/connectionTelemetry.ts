import { AppState } from 'react-native'
import * as Network from 'expo-network'

// What the app and the network were doing when a request died, for
// request_failed. Telemetry only: netStatus still decides offline from the
// request path, never from this. It answered what was killing requests on
// Android (PostHog 2026-10-21: every burst on cellular, mid-session, the one
// shared HTTP/2 socket stalled; see plugins/withOkHttpClient.js) and stays so
// a regression shows up with the same context.
const launchedAt = Date.now()
let activeSince = launchedAt
let network = { type: 'unknown', changedAt: launchedAt }

function onNetwork(type: string | undefined): void {
  const next = type ?? 'unknown'
  if (next !== network.type) network = { type: next, changedAt: Date.now() }
}

AppState.addEventListener('change', (state) => {
  if (state === 'active') activeSince = Date.now()
})
// The first read only fills in a type the listener hasn't reported yet, so a
// late answer can't overwrite a newer change.
let heard = false
try {
  Network.addNetworkStateListener(({ type }) => {
    heard = true
    onNetwork(type)
  })
  void Network.getNetworkStateAsync().then((state) => { if (!heard) onNetwork(state?.type) }, () => {})
} catch {
  // No native module (tests, a stale dev client): report 'unknown'.
}

export function connectionContext() {
  const now = Date.now()
  return {
    app_state: AppState.currentState ?? 'unknown',
    since_active_ms: now - activeSince,
    since_launch_ms: now - launchedAt,
    network: network.type,
    since_network_change_ms: now - network.changedAt,
  }
}
