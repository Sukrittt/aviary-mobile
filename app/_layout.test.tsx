import { render, waitFor, act } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import RootLayout from './_layout'
import { signalOnboarded } from '@/src/api/onboardingSignal'
import { accessMode, initAccessMode } from '@/src/api/accessMode'
import { getUser, type UserProfile } from '@/src/api/account'
import * as SplashScreen from 'expo-splash-screen'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'

// Capture the layout's module-level client for cleanup. Disable GC timers too:
// an in-flight fetch can schedule GC again after the client has been cleared.
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    QueryClient: jest.fn((options: ConstructorParameters<typeof actual.QueryClient>[0]) => new actual.QueryClient({
      ...options,
      defaultOptions: {
        ...options?.defaultOptions,
        queries: { ...options?.defaultOptions?.queries, gcTime: Infinity },
        mutations: { ...options?.defaultOptions?.mutations, gcTime: Infinity },
      },
    })),
  }
})

const testClients: QueryClient[] = jest.mocked(QueryClient).mock.results.map(({ value }) => value)
function clearTestClients() {
  for (const client of testClients) client.clear()
}
afterEach(async () => {
  await act(async () => {})
  clearTestClients()
})

// The bug this file guards against: the root layout used to render `null`
// (fonts loading) and then a splash component (auth resolving) *instead of* the
// Stack. expo-router drops any navigation dispatched in that window and React
// logs "Can't perform a React state update on a component that hasn't mounted
// yet" against ContextNavigator. The navigator must exist on the very first
// render, with route availability driven by Stack.Protected guards instead.

// `mock`-prefixed so Jest's out-of-scope guard allows the factories to close over them.
let mockFontsLoaded = false
jest.mock('@/src/theme/fonts', () => ({
  ...jest.requireActual('@/src/theme/fonts'),
  useAppFonts: () => [mockFontsLoaded],
}))

let mockSegments: string[] = []
let mockPathname = '/'
let mockGlobalParams: Record<string, string> = {}
const mockReplace = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View: RNView } = require('react-native')
  function Stack({ children }: { children: ReactNode }) {
    return <RNView testID="stack">{children}</RNView>
  }
  Stack.Screen = function Screen({ name }: { name: string }) {
    return <RNView testID={`screen:${name}`} />
  }
  Stack.Protected = function Protected({ guard, children }: { guard: boolean; children: ReactNode }) {
    return guard ? <>{children}</> : null
  }
  return {
    Stack,
    useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn(), navigate: jest.fn(), canDismiss: () => false, dismissAll: jest.fn() }),
    useSegments: () => mockSegments,
    usePathname: () => mockPathname,
    useGlobalSearchParams: () => mockGlobalParams,
  }
})

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}))
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(() => Promise.resolve()) }))
jest.mock('@/src/sync/flush', () => ({ startAutoFlush: jest.fn(() => jest.fn()) }))
jest.mock('@/src/lib/notifications', () => ({
  configureNotificationHandler: jest.fn(),
  registerForPushNotificationsAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
  addNotificationResponseListener: jest.fn(),
  checkColdStartNotification: jest.fn(() => Promise.resolve()),
  unregisterDevicePushToken: jest.fn(() => Promise.resolve()),
}))
// Pulls in reanimated + the user/expenses queries; irrelevant to route gating.
jest.mock('@/src/components/nav/TabBar', () => ({ TabBar: () => null }))

jest.mock('@/src/api/accessMode', () => ({
  accessMode: {
    subscribe: jest.fn(() => () => {}),
    subscribeLogout: jest.fn(() => () => {}),
  },
  initAccessMode: jest.fn(),
  clearAccess: jest.fn(),
  // Read by src/lib/analytics.ts, which this layout calls from inside the
  // getUser() chain that decides onboarding routing.
  currentUserId: jest.fn(() => 'user_test'),
}))
jest.mock('@/src/api/account', () => ({ getUser: jest.fn(), syncTimezone: jest.fn() }))

const mockInitAccessMode = initAccessMode as jest.MockedFunction<typeof initAccessMode>
const mockGetUser = getUser as jest.MockedFunction<typeof getUser>
beforeEach(() => {
  jest.clearAllMocks()
  mockFontsLoaded = false
  mockSegments = []
  mockPathname = '/'
  mockGlobalParams = {}
})

it('does not retain cache timers after the layout is cleaned up', async () => {
  jest.useFakeTimers()
  mockFontsLoaded = true
  mockInitAccessMode.mockResolvedValue('real')
  mockGetUser.mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: '2026-01-01T00:00:00.000Z' })
  const { getByTestId, unmount } = render(<RootLayout />)
  try {
    await waitFor(() => expect(getByTestId('screen:(tabs)')).toBeTruthy())
    unmount()
    await act(async () => { jest.advanceTimersByTime(1000) })
    clearTestClients()
    jest.runAllTicks()
    expect(jest.getTimerCount()).toBe(0)
  } finally {
    unmount()
    jest.clearAllTimers()
    jest.useRealTimers()
  }
})

describe('RootLayout', () => {
  it('keeps the cache restored from disk when the saved session is restored, and clears it on a new sign-in', async () => {
    const notifySignIn = () => (accessMode.subscribe as jest.Mock).mock.calls.forEach(([fn]) => fn('real'))
    mockInitAccessMode.mockImplementation(async () => {
      await Promise.resolve()
      notifySignIn() // the boot-time restore's notification
      return 'real'
    })
    mockGetUser.mockReturnValue(new Promise(() => {}))
    const client = testClients[0]
    client.setQueryData(['budgets'], ['saved'])

    render(<RootLayout />)
    await act(async () => {})
    expect(client.getQueryData(['budgets'])).toEqual(['saved'])

    act(() => notifySignIn())
    expect(client.getQueryData(['budgets'])).toBeUndefined()
  })

  it('keeps queued offline expenses on sign-out so the same account can sync them later', async () => {
    mockInitAccessMode.mockReturnValue(new Promise(() => {}))
    mockGetUser.mockReturnValue(new Promise(() => {}))
    await AsyncStorage.setItem('mc-pending-expenses:user_test', 'queued')
    await AsyncStorage.setItem('mc-failed-expenses:user_test', 'failed')
    render(<RootLayout />)

    const subs = (accessMode.subscribeLogout as jest.Mock).mock.calls.map(([fn]) => fn as (token: string) => Promise<void>)
    expect(subs.length).toBeGreaterThan(0)
    await act(async () => { await Promise.all(subs.map(fn => fn('token'))) })

    expect(await AsyncStorage.getItem('mc-pending-expenses:user_test')).toBe('queued')
    expect(await AsyncStorage.getItem('mc-failed-expenses:user_test')).toBe('failed')
  })

  it('renders the navigator on the first render, before fonts or auth resolve', () => {
    // Never settles: the first render is all this assertion is about.
    mockInitAccessMode.mockReturnValue(new Promise(() => {}))
    mockGetUser.mockReturnValue(new Promise(() => {}))

    const { getByTestId } = render(<RootLayout />)

    expect(getByTestId('stack')).toBeTruthy()
    expect(getByTestId('screen:loading')).toBeTruthy()
  })

  it('swaps loading for the sign-in screen once auth resolves signed out', async () => {
    mockFontsLoaded = true
    mockInitAccessMode.mockResolvedValue(null)
    mockGetUser.mockReturnValue(new Promise(() => {}))

    const { getByTestId, queryByTestId } = render(<RootLayout />)

    await waitFor(() => expect(getByTestId('screen:(auth)/welcome')).toBeTruthy())
    expect(queryByTestId('screen:loading')).toBeNull()
    expect(queryByTestId('screen:(tabs)')).toBeNull()
  })

  it('holds on loading while the onboarding flag is still unknown, then opens the tabs', async () => {
    mockFontsLoaded = true
    mockInitAccessMode.mockResolvedValue('real')
    let resolveUser: (u: UserProfile) => void = () => {}
    mockGetUser.mockReturnValue(new Promise<UserProfile>((resolve) => { resolveUser = resolve }))

    const { getByTestId, queryByTestId } = render(<RootLayout />)

    await waitFor(() => expect(getByTestId('screen:loading')).toBeTruthy())
    expect(queryByTestId('screen:(tabs)')).toBeNull()

    await act(async () => {
      resolveUser({ email: 'a@b.com', emailVerified: true, onboardedAt: '2026-01-01T00:00:00.000Z' })
    })

    // Default waitFor timeout (1000ms) protects against accidentally adding a
    // fixed minimum duration to the splash lifecycle.
    await waitFor(() => expect(getByTestId('screen:(tabs)')).toBeTruthy())
    expect(queryByTestId('screen:loading')).toBeNull()
    expect(queryByTestId('screen:setup')).toBeNull()
  })

  it('hides the native splash once fonts are ready, without waiting on auth or onboarding', async () => {
    // Neither ever resolves in this test — proves hideAsync doesn't wait on them.
    mockFontsLoaded = true
    mockInitAccessMode.mockReturnValue(new Promise(() => {}))
    mockGetUser.mockReturnValue(new Promise(() => {}))

    render(<RootLayout />)

    // The /loading route (BirdLandingSplash) is what's left covering the
    // still-pending resolve underneath — not the native splash. See the
    // splash-hide effect's comment in app/_layout.tsx.
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalled())
  })

  it('does not hide the native splash before fonts are ready', () => {
    mockFontsLoaded = false
    mockInitAccessMode.mockResolvedValue(null)

    render(<RootLayout />)

    expect(SplashScreen.hideAsync).not.toHaveBeenCalled()
  })

  it('routes a signed-in user who has not onboarded to setup', async () => {
    mockFontsLoaded = true
    mockInitAccessMode.mockResolvedValue('real')
    mockGetUser.mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: null })

    const { getByTestId, queryByTestId, getAllByTestId } = render(<RootLayout />)

    await waitFor(() => expect(getByTestId('screen:setup')).toBeTruthy())
    expect(queryByTestId('screen:(tabs)')).toBeNull()
    // Setup must be the first registered screen in this state too — a fallback
    // to (auth)/email here would bounce through it the same way log-expense used to.
    expect(getAllByTestId(/^screen:/)[0].props.testID).toBe('screen:setup')
  })

  // (auth)/email and (auth)/code stay registered while signed in for the
  // change-email flow, so signing in from them removes no screen — the root
  // layout has to move the user off explicitly.
  it('moves a user who just signed in on an auth screen to log expense', async () => {
    mockFontsLoaded = true
    mockSegments = ['(auth)', 'code']
    mockInitAccessMode.mockResolvedValue('real')
    mockGetUser.mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: '2026-01-01T00:00:00.000Z' })

    render(<RootLayout />)

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/modals/log-expense'))
  })

  it('sends a signed-in user who has not onboarded from an auth screen to setup', async () => {
    mockFontsLoaded = true
    mockSegments = ['(auth)', 'code']
    mockInitAccessMode.mockResolvedValue('real')
    mockGetUser.mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: null })

    render(<RootLayout />)

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/setup'))
  })

  it('leaves a change-email flow alone', async () => {
    mockFontsLoaded = true
    mockSegments = ['(auth)', 'code']
    mockGlobalParams = { mode: 'change-email' }
    mockInitAccessMode.mockResolvedValue('real')
    mockGetUser.mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: '2026-01-01T00:00:00.000Z' })

    const { getByTestId } = render(<RootLayout />)

    await waitFor(() => expect(getByTestId('screen:(tabs)')).toBeTruthy())
    expect(mockReplace).not.toHaveBeenCalled()
  })

  // Log-expense is declared first inside the signed-in guard, so it's the
  // route React Navigation rebuilds the (just-emptied) stack from when
  // /loading unregisters — no push, no intermediate Home frame. This also
  // covers the widget deep link (envelope://modals/log-expense?category=X):
  // the layout no longer pushes anything at all, so it can't stomp it.
  it('registers log-expense first so launch lands there, and pushes nothing', async () => {
    mockFontsLoaded = true
    mockInitAccessMode.mockResolvedValue('real')
    mockGetUser.mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: '2026-01-01T00:00:00.000Z' })

    const { getByTestId, getAllByTestId } = render(<RootLayout />)

    await waitFor(() => expect(getByTestId('screen:(tabs)')).toBeTruthy())
    expect(getAllByTestId(/^screen:/)[0].props.testID).toBe('screen:modals/log-expense')
    expect(mockPush).not.toHaveBeenCalled()
  })
})

it('opens the trial notice directly when the setup completion button signals onboarding', async () => {
  mockFontsLoaded = true
  mockPathname = '/setup'
  mockInitAccessMode.mockResolvedValue('real')
  mockGetUser.mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: null })
  const { getByTestId, getAllByTestId, queryByTestId } = render(<RootLayout />)
  await waitFor(() => expect(getByTestId('screen:setup')).toBeTruthy())
  act(() => signalOnboarded())
  expect(queryByTestId('screen:setup')).toBeNull()
  expect(getAllByTestId(/^screen:/)[0].props.testID).toBe('screen:account/trial-notice')
  expect(getAllByTestId('screen:account/trial-notice')).toHaveLength(1)
  expect(mockPush).not.toHaveBeenCalled()
})

// A fresh sign-in leaves the ungated (auth)/email screen under /setup, so when
// setup unregisters the stack isn't empty and never rebuilds onto the tour —
// it falls back to (auth)/email, and the auth-screen redirect has to pick the trial notice.
it('sends a just-onboarded user who surfaces on an auth screen to the trial notice, not log expense', async () => {
  mockFontsLoaded = true
  mockSegments = ['(auth)', 'email']
  mockInitAccessMode.mockResolvedValue('real')
  mockGetUser.mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: null })
  render(<RootLayout />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/setup'))
  act(() => signalOnboarded())
  await waitFor(() => expect(mockReplace).toHaveBeenLastCalledWith('/account/trial-notice'))
  expect(mockReplace).not.toHaveBeenCalledWith('/modals/log-expense')
})
