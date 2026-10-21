import { AppState } from 'react-native'
import * as Network from 'expo-network'

// What the app and the network were doing when a request died, for
// request_failed. Telemetry only: netStatus still decides offline from the
// request path, never from this. The open question it answers is what kills
// Android's pooled connection mid-session (a Wi-Fi/cellular handoff? a resume
// after a long background?), which PostHog couldn't say on 2026-10-21.
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
try {
  Network.addNetworkStateListener(({ type }) => onNetwork(type))
  void Network.getNetworkStateAsync().then((state) => onNetwork(state?.type), () => {})
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
