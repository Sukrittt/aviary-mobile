import { addNotificationResponseListener, addPushTokenListener, checkColdStartNotification, registerForPushNotificationsAsync, unregisterDevicePushToken } from './notifications'
import { track } from '@/src/lib/analytics'
import { registerPushToken } from '@/src/api/notifications'
import { SessionChangedError } from '@/src/api/accessMode'

const mockPush = jest.fn()
const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args), dismissTo: (...args: unknown[]) => mockDismissTo(...args) } }))
jest.mock('@/src/api/notifications', () => ({ registerPushToken: jest.fn() }))
// Release builds may have no EXPO_PUBLIC_API_URL and lean on client.ts's fallback.
jest.mock('@/src/api/client', () => ({ BASE_URL: 'https://base.test' }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('expo-device', () => ({ isDevice: true }))

let responseListener: ((response: unknown) => void) | undefined
const mockAddNotificationResponseReceivedListener = jest.fn((cb: (response: unknown) => void) => {
  responseListener = cb
  return { remove: jest.fn() }
})
const mockGetLastNotificationResponseAsync = jest.fn()
const mockClearLastNotificationResponseAsync = jest.fn()

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: mockAddNotificationResponseReceivedListener,
  addPushTokenListener: jest.fn(),
  getLastNotificationResponseAsync: mockGetLastNotificationResponseAsync,
  clearLastNotificationResponseAsync: mockClearLastNotificationResponseAsync,
  getPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
  getExpoPushTokenAsync: () => Promise.reject(new Error('FIS_AUTH_ERROR')),
}))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone', expoConfig: { extra: { eas: { projectId: 'p' } } } },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}))

describe('notification tap routing', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockGetLastNotificationResponseAsync.mockClear()
    mockClearLastNotificationResponseAsync.mockClear()
  })

  it('deep-links to the activity tab for a warm tap with a date', () => {
    addNotificationResponseListener()
    expect(responseListener).toBeDefined()

    responseListener!({ notification: { request: { content: { data: { date: '2026-08-20' } } } } })

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/activity?date=2026-08-20')
  })

  it('does nothing for a warm tap with no date', () => {
    addNotificationResponseListener()
    responseListener!({ notification: { request: { content: { data: {} } } } })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('deep-links to an explicit route for a warm tap with data.route', () => {
    addNotificationResponseListener()
    responseListener!({ notification: { request: { content: { data: { route: '/wrapped' } } } } })
    expect(mockPush).toHaveBeenCalledWith('/wrapped')
  })

  it('prefers data.route over data.date when both are present', () => {
    addNotificationResponseListener()
    responseListener!({ notification: { request: { content: { data: { route: '/wrapped', date: '2026-08-20' } } } } })
    expect(mockPush).toHaveBeenCalledWith('/wrapped')
    expect(mockPush).not.toHaveBeenCalledWith('/(tabs)/activity?date=2026-08-20')
  })

  it('deep-links from a cold-start tap and clears the response so it does not re-fire', async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValueOnce({
      notification: { request: { content: { data: { date: '2026-08-21' } } } },
    })

    await checkColdStartNotification()

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/activity?date=2026-08-21')
    expect(mockClearLastNotificationResponseAsync).toHaveBeenCalled()
  })

  it('deep-links to an explicit route from a cold-start tap', async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValueOnce({
      notification: { request: { content: { data: { route: '/wrapped' } } } },
    })

    await checkColdStartNotification()

    expect(mockPush).toHaveBeenCalledWith('/wrapped')
  })

  it('does nothing when there is no queued cold-start response', async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValueOnce(null)

    await checkColdStartNotification()

    expect(mockPush).not.toHaveBeenCalled()
    expect(mockClearLastNotificationResponseAsync).not.toHaveBeenCalled()
  })
})

it.each(['/account/security', 'https://evil.example', '/wrapped?redirect=evil'])('drops untrusted route %s', route => {
 mockPush.mockClear()
 addNotificationResponseListener()
 responseListener!({notification:{request:{content:{data:{route}}}}})
 expect(mockPush).not.toHaveBeenCalled()
})
it('encodes notification dates as a single parameter', () => {
 mockPush.mockClear()
 addNotificationResponseListener()
 responseListener!({notification:{request:{content:{data:{date:'2026-01-01&evil=yes'}}}}})
 expect(mockPush).toHaveBeenCalledWith('/(tabs)/activity?date=2026-01-01%26evil%3Dyes')
})

it('reports a failed push token fetch to analytics instead of only swallowing it', async () => {
  await registerForPushNotificationsAsync()
  expect(track).toHaveBeenCalledWith('push_registration_failed', { stage: 'token', error: 'Error: FIS_AUTH_ERROR' })
})
// The listener hands over the raw FCM token, which the API rejects with a 400
// (it only takes Expo tokens). It fires on every launch, too.
it('never sends the raw device token to the API', async () => {
  const Notifications = jest.requireMock('expo-notifications')
  const original = Notifications.getExpoPushTokenAsync
  Notifications.getExpoPushTokenAsync = () => Promise.resolve({ data: 'ExponentPushToken[rotated]' })
  try {
    jest.mocked(registerPushToken).mockClear()
    addPushTokenListener()
    const onToken = jest.mocked(Notifications.addPushTokenListener).mock.calls.at(-1)![0]
    onToken({ type: 'android', data: 'fcm-token-1' })
    onToken({ type: 'android', data: 'fcm-token-1' })
    await new Promise(setImmediate)
    expect(registerPushToken).not.toHaveBeenCalled()

    onToken({ type: 'android', data: 'fcm-token-2' })
    await new Promise(setImmediate)
    expect(registerPushToken).toHaveBeenCalledTimes(1)
    expect(registerPushToken).toHaveBeenCalledWith('ExponentPushToken[rotated]', expect.any(String))
  } finally {
    Notifications.getExpoPushTokenAsync = original
  }
})

it('does not report a registration that lost a race with an account switch', async () => {
  const Notifications = jest.requireMock('expo-notifications')
  const original = Notifications.getExpoPushTokenAsync
  Notifications.getExpoPushTokenAsync = () => Promise.resolve({ data: 'ExponentPushToken[x]' })
  try {
    jest.mocked(registerPushToken).mockRejectedValueOnce(new SessionChangedError())
    jest.mocked(track).mockClear()
    await registerForPushNotificationsAsync()
    expect(track).not.toHaveBeenCalledWith('push_registration_failed', expect.anything())
  } finally {
    Notifications.getExpoPushTokenAsync = original
  }
})
it('opens Move money for the hot category from a pace nudge', () => {
 mockPush.mockClear()
 addNotificationResponseListener()
 responseListener!({notification:{request:{content:{data:{route:'/modals/move-money', category:'Food & Drink'}}}}})
 expect(mockPush).toHaveBeenCalledWith({ pathname: '/modals/move-money', params: { fromCategory: 'Food & Drink' } })
})
it('drops a Move money route with no category', () => {
 mockPush.mockClear()
 addNotificationResponseListener()
 responseListener!({notification:{request:{content:{data:{route:'/modals/move-money'}}}}})
 expect(mockPush).not.toHaveBeenCalled()
})
it('goes back to log expense from the evening check instead of stacking a second one', () => {
 mockPush.mockClear()
 addNotificationResponseListener()
 responseListener!({notification:{request:{content:{data:{route:'/modals/log-expense'}}}}})
 expect(mockDismissTo).toHaveBeenCalledWith('/modals/log-expense')
 expect(mockPush).not.toHaveBeenCalled()
})
it('tags a come-back nudge tap with its kind and step', () => {
 jest.mocked(track).mockClear()
 addNotificationResponseListener()
 responseListener!({notification:{request:{content:{data:{route:'/modals/log-expense', kind:'reengage', step:7}}}}})
 expect(track).toHaveBeenCalledWith('notification_opened', { target: '/modals/log-expense', kind: 'reengage', step: 7 })
})

// After a denial Android 13 shows the prompt again every launch, and the opt-in
// metric fired once per cold start.
it('does not re-request permission the user already denied for good', async () => {
  const Notifications = jest.requireMock('expo-notifications')
  const original = Notifications.getPermissionsAsync
  Notifications.getPermissionsAsync = () => Promise.resolve({ status: 'denied', canAskAgain: false })
  Notifications.requestPermissionsAsync = jest.fn()
  try {
    jest.mocked(track).mockClear()
    await registerForPushNotificationsAsync()
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalledWith('push_permission_result', expect.anything())
  } finally {
    Notifications.getPermissionsAsync = original
  }
})
it('unregisters the device token against BASE_URL', async () => {
  const Notifications = jest.requireMock('expo-notifications')
  const original = Notifications.getExpoPushTokenAsync
  Notifications.getExpoPushTokenAsync = () => Promise.resolve({ data: 'ExponentPushToken[u]' })
  const fetchMock = jest.fn().mockResolvedValue({ ok: true })
  const originalFetch = global.fetch
  global.fetch = fetchMock
  try {
    jest.mocked(registerPushToken).mockResolvedValueOnce()
    await registerForPushNotificationsAsync()
    await unregisterDevicePushToken('access')
    expect(fetchMock).toHaveBeenCalledWith('https://base.test/api/notifications/register', expect.objectContaining({ method: 'DELETE' }))
  } finally {
    Notifications.getExpoPushTokenAsync = original
    global.fetch = originalFetch
  }
})

// Two users sent 39 'permission denied' events in a day: every launch re-ran
// registration and reported the same denial again.
it('handles a denial once, then waits for the permission to change', async () => {
  const Notifications = jest.requireMock('expo-notifications')
  const original = Notifications.getPermissionsAsync
  const originalToken = Notifications.getExpoPushTokenAsync
  Notifications.getPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'denied', canAskAgain: true }))
  Notifications.requestPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'denied' }))
  Notifications.getExpoPushTokenAsync = () => Promise.resolve({ data: 'ExponentPushToken[back]' })
  try {
    jest.mocked(track).mockClear()
    jest.mocked(registerPushToken).mockClear()
    await registerForPushNotificationsAsync()
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('push_registration_failed', { stage: 'permission', error: 'permission denied' })

    // Next launches: still denied, so no prompt and no event.
    jest.mocked(track).mockClear()
    await registerForPushNotificationsAsync()
    await registerForPushNotificationsAsync()
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(track).not.toHaveBeenCalled()

    // Turned on in system settings: the next launch registers.
    Notifications.getPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true }))
    await registerForPushNotificationsAsync()
    expect(registerPushToken).toHaveBeenCalledWith('ExponentPushToken[back]', expect.any(String))
  } finally {
    Notifications.getPermissionsAsync = original
    Notifications.getExpoPushTokenAsync = originalToken
  }
})

it('opens Recurring from a paused recurring expense push', () => {
  mockPush.mockClear()
  addNotificationResponseListener()
  responseListener!({ notification: { request: { content: { data: { route: '/account/recurring' } } } } })
  expect(mockPush).toHaveBeenCalledWith('/account/recurring')
})
