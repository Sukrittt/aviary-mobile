import { addNotificationResponseListener, checkColdStartNotification, registerForPushNotificationsAsync } from './notifications'
import { track } from '@/src/lib/analytics'
import { registerPushToken } from '@/src/api/notifications'
import { SessionChangedError } from '@/src/api/accessMode'

const mockPush = jest.fn()
const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args), dismissTo: (...args: unknown[]) => mockDismissTo(...args) } }))
jest.mock('@/src/api/notifications', () => ({ registerPushToken: jest.fn() }))
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
