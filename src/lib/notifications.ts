import { currentAccessToken } from '@/src/api/accessMode'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { router } from 'expo-router'
import { registerPushToken } from '@/src/api/notifications'
import { track } from '@/src/lib/analytics'
import type * as NotificationsType from 'expo-notifications'

// expo-notifications throws on Android *just from being imported* inside Expo Go
// (remote notifications were removed from Expo Go as of SDK 53) — a static `import`
// at the top of this file would crash the app before any guard could run. So the
// module is required lazily, only once we know we're not running under Expo Go.
const PUSH_SUPPORTED = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient

export function getNotifications(): typeof NotificationsType | null {
  if (!PUSH_SUPPORTED) return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as typeof NotificationsType
}

/** Show alert + sound for notifications received while the app is foregrounded. */
export function configureNotificationHandler(): void {
  const Notifications = getNotifications()
  if (!Notifications) return
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

let devicePushToken: string | null = null

async function registerToken(token: string): Promise<void> {
  devicePushToken = token
  await registerPushToken(token, Platform.OS === 'android' ? 'android' : 'ios')
}

/**
 * Request permission and register this device's Expo push token with the
 * backend. Bails out cleanly (no throw) on simulators, permission denial, or
 * any error — a push registration failure must never block app usage.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  // Which step failed goes to PostHog: a swallowed console.warn is invisible
  // in a Play Store build, and that hid a week of no pushes at all.
  let stage = 'permission'
  try {
    const Notifications = getNotifications()
    if (!Notifications || !Device.isDevice) return

    let { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') {
      ;({ status } = await Notifications.requestPermissionsAsync())
      // Only when the prompt was actually shown, so this is the opt-in rate
      // rather than one event per launch.
      track('push_permission_result', { granted: status === 'granted' })
    }
    if (status !== 'granted') {
      track('push_registration_failed', { stage, error: `permission ${status}` })
      return
    }

    stage = 'token'
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    stage = 'register'
    await registerToken(token)
  } catch (err) {
    console.warn('Push registration failed', err)
    track('push_registration_failed', { stage, error: String(err).slice(0, 300) })
  }
}

/**
 * Re-register whenever Expo rotates the push token (rare, but happens).
 * Returns the subscription so callers can `.remove()` it on unmount.
 */
export function addPushTokenListener(): NotificationsType.Subscription | undefined {
  const Notifications = getNotifications()
  if (!Notifications) return undefined
  return Notifications.addPushTokenListener((token) => {
    registerToken(token.data).catch((err) => console.warn('Push token re-registration failed', err))
  })
}

/**
 * Deep-link on notification tap. A `data.route` wins if present (server picks
 * the destination); otherwise falls back to the Activity tab for a `data.date`
 * payload, reusing the existing `?date=` param the tab already reads. Shared
 * by the warm-tap listener below and `checkColdStartNotification` — a tap
 * that launches the app from killed goes through `getLastNotificationResponseAsync`
 * instead of the listener, but should land in the same place.
 */
function routeFromNotificationResponse(response: NotificationsType.NotificationResponse): void {
  const data = response.notification.request.content.data
  // Habit nudges carry their own tap, action-button and analytics handling.
  // Required lazily: it pulls in the expense queue and sync, which nothing else here needs.
  if (typeof data?.nudgeId === 'string') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    void (require('./habitNudges') as typeof import('./habitNudges')).handleHabitResponse(response)
    return
  }
  const route = data?.route
  // Which kind of notification brings people back. The route, not the text:
  // notification bodies carry category names and amounts.
  track('notification_opened', {
    target: typeof route === 'string' && route ? route : typeof data?.date === 'string' ? 'activity_date' : 'none',
  })
  if (typeof route === 'string' && route) {
    if (route === '/wrapped' || route === '/recap' || route === '/activity' || route === '/investments' || route === '/modals/log-expense') router.push(route)
    // Pace nudge: `category` is the hot envelope, which move-money calls `fromCategory` (it's the recipient).
    else if (route === '/modals/move-money' && typeof data.category === 'string' && data.category) {
      router.push({ pathname: '/modals/move-money', params: { fromCategory: data.category } })
    }
    return
  }
  const date = data?.date
  if (typeof date === 'string' && date) {
    router.push(`/(tabs)/activity?date=${encodeURIComponent(date)}`)
  }
}

/** Deep-link when the user taps a notification while the app is running (foreground or backgrounded). */
export function addNotificationResponseListener(): NotificationsType.Subscription | undefined {
  const Notifications = getNotifications()
  if (!Notifications) return undefined
  return Notifications.addNotificationResponseReceivedListener(routeFromNotificationResponse)
}

/**
 * Deep-link when a notification tap *launched* the app from killed —
 * `addNotificationResponseListener` only fires for a tap while the app is
 * already running, so a cold start otherwise drops the tap silently. Call
 * once on startup, after the router is mounted.
 */
export async function checkColdStartNotification(): Promise<void> {
  const Notifications = getNotifications()
  if (!Notifications) return
  const response = await Notifications.getLastNotificationResponseAsync()
  if (!response) return
  routeFromNotificationResponse(response)
  await Notifications.clearLastNotificationResponseAsync()
}

/** Best effort, using the captured credential without refreshing a revoked session. */
export async function unregisterDevicePushToken(accessToken = currentAccessToken()): Promise<void> {
  const token = devicePushToken
  if (!token || !accessToken) return
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/notifications/register`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok && devicePushToken === token) devicePushToken = null
  } catch { /* Offline sign-out must still clear local data. */ }
}
