import { currentAccessToken, currentUserId, SessionChangedError } from '@/src/api/accessMode'
import { activeBudgetId } from '@/src/lib/activeBudget'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Device from 'expo-device'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { router } from 'expo-router'
import { registerPushToken } from '@/src/api/notifications'
import { BASE_URL } from '@/src/api/client'
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

/**
 * The permission status this device last settled on. A denial is handled
 * once: a launch that finds it still denied neither prompts again nor reports
 * another failure (two users sent 39 'permission denied' events in a day, one
 * per launch). Reading the status costs nothing, so turning notifications on
 * in system settings still registers on the next launch.
 */
const PERMISSION_KEY = 'push-permission'

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

    let { status, canAskAgain } = await Notifications.getPermissionsAsync()
    const last = await AsyncStorage.getItem(PERMISSION_KEY)
    if (status === 'denied' && last === 'denied') return
    // A permanent denial: asking again would re-prompt (Android 13) or no-op,
    // and log a fresh opt-in result on every launch either way.
    if (status !== 'granted' && canAskAgain) {
      ;({ status } = await Notifications.requestPermissionsAsync())
      // Only when the prompt was actually shown, so this is the opt-in rate
      // rather than one event per launch.
      track('push_permission_result', { granted: status === 'granted' })
    }
    if (status !== last) await AsyncStorage.setItem(PERMISSION_KEY, status)
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
    // The account changed mid-flight. Not a failure: the new account's sign-in
    // runs its own registration.
    if (err instanceof SessionChangedError) return
    console.warn('Push registration failed', err)
    track('push_registration_failed', { stage, error: String(err).slice(0, 300) })
  }
}

let lastDeviceToken: string | null = null

/**
 * Re-register whenever the device's push token rotates (rare, but happens).
 * Returns the subscription so callers can `.remove()` it on unmount.
 *
 * The listener hands over the raw FCM/APNs token, not the Expo token the API
 * takes, so posting it got a 400 every time. It also fires on every launch,
 * when sign-in's registration fetches that token. So the first one is only
 * remembered, and a token that actually changed reruns the full registration,
 * which turns it into the matching Expo token.
 */
export function addPushTokenListener(): NotificationsType.Subscription | undefined {
  const Notifications = getNotifications()
  if (!Notifications) return undefined
  return Notifications.addPushTokenListener(({ data }) => {
    const rotated = lastDeviceToken !== null && data !== lastDeviceToken
    lastDeviceToken = data
    if (rotated) void registerForPushNotificationsAsync()
  })
}

// Registered by BudgetAccessWatcher, which has the query client a switch needs.
let budgetSwitch: ((spaceId: string) => Promise<void>) | null = null
export function setNotificationBudgetSwitch(fn: typeof budgetSwitch): void {
  budgetSwitch = fn
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
    // Come-back nudges: which step of the quiet-spell ladder brought them back.
    ...(typeof data?.kind === 'string' && { kind: data.kind }),
    ...(typeof data?.step === 'number' && { step: data.step }),
  })
  // A push about a shared budget opens that budget before its screen.
  const spaceId = typeof data?.spaceId === 'string' && data.spaceId ? data.spaceId : null
  if (spaceId && budgetSwitch && spaceId !== (activeBudgetId() ?? currentUserId())) {
    void budgetSwitch(spaceId).catch(() => {}).finally(() => routeTo(data))
    return
  }
  routeTo(data)
}

function routeTo(data: Record<string, unknown> | undefined): void {
  const route = data?.route
  if (typeof route === 'string' && route) {
    if (route === '/budget-members') {
      router.push({ pathname: '/budget-members' as never, params: typeof data?.spaceId === 'string' ? { id: data.spaceId } : {} })
      return
    }
    if (route === '/wrapped' || route === '/recap' || route === '/activity' || route === '/(tabs)/activity' || route === '/investments' || route === '/account/recurring') router.push(route)
    // Evening check. log-expense is the launch screen, so it's usually already
    // at the bottom of the stack: go back to it rather than stack a second one.
    else if (route === '/modals/log-expense') router.dismissTo(route)
    // Pace nudge: `category` is the hot envelope, which move-money calls `fromCategory` (it's the recipient).
    else if (route === '/modals/move-money' && typeof data?.category === 'string' && data.category) {
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
    const response = await fetch(`${BASE_URL}/api/notifications/register`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok && devicePushToken === token) devicePushToken = null
  } catch { /* Offline sign-out must still clear local data. */ }
}
