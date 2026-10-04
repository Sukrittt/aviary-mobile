import { Linking, Platform } from 'react-native'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { useUser } from '@/src/hooks/useUser'
import { useWrappedStatus } from '@/src/hooks/useWrapped'
import { clearAccess, sessionId } from '@/src/api/accessMode'
import { revokeSession } from '@/src/api/account'
import { getCategories } from '@/src/api/categories'
import { takePendingScanImage } from '@/src/lib/pendingScanImage'
import { getSystemStatus } from '@/src/api/systemStatus'
import { WEB_URL } from '@/src/api/client'
import appJson from '@/app.json'
import MoreScreen from './more'

jest.mock('@/src/hooks/useUser', () => ({
  useUpdateUser: () => ({ mutate: jest.fn(), isPending: false, isError: false }), useUser: jest.fn() }))
jest.mock('@/src/hooks/useWrapped', () => ({ useWrappedStatus: jest.fn() }))
jest.mock('@/src/api/systemStatus', () => ({ getSystemStatus: jest.fn() }))
// Expo Go reports its own host version. The More screen must ignore it and
// display Aviary's app.json version instead.
jest.mock('expo-application', () => ({ nativeApplicationVersion: '57.0.9', nativeBuildVersion: '57' }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useIsFocused: () => true,
  // AnimatedTabContent derives the swipe's current slot from the pathname.
  usePathname: () => '/more',
}))
jest.mock('@/src/api/accessMode', () => ({
  clearAccess: jest.fn(() => Promise.resolve()),
  sessionId: jest.fn(() => 'session_1'),
  currentUserId: jest.fn(() => 'user_test'),
  accessMode: { subscribe: () => () => {}, subscribeLogout: () => () => {} },
}))
jest.mock('@/src/api/account', () => ({ revokeSession: jest.fn(() => Promise.resolve()) }))
jest.mock('@/src/api/categories', () => ({
  getCategories: jest.fn(),
  addCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
  moveCategory: jest.fn(),
}))

const mockRequestCamera = jest.fn()
const mockRequestLibrary = jest.fn()
const mockLaunchCamera = jest.fn()
const mockLaunchLibrary = jest.fn()
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: () => mockRequestCamera(),
  requestMediaLibraryPermissionsAsync: () => mockRequestLibrary(),
  launchCameraAsync: (opts: unknown) => mockLaunchCamera(opts),
  launchImageLibraryAsync: (opts: unknown) => mockLaunchLibrary(opts),
}))

const mockUseUser = useUser as jest.Mock
const mockUseWrappedStatus = useWrappedStatus as jest.Mock
const mockGetSystemStatus = getSystemStatus as jest.Mock

/** Flushes react-query's promise chain so the categories query lands before an assertion. */
async function flushCategories() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
  ;(sessionId as jest.Mock).mockReturnValue('session_1')
  ;(clearAccess as jest.Mock).mockResolvedValue(undefined)
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Groceries', group: 'Essentials' }])
  mockUseUser.mockReturnValue({ data: { email: 'a@b.com', emailVerified: true } })
  mockUseWrappedStatus.mockReturnValue({
    data: {
      month: '2026-07',
      transactionCount: 14,
      available: true,
      minTransactions: 10,
      currentMonth: '2026-08',
      currentMonthCount: 3,
    },
  })
  // Most tests do not care about this background query; keep it pending so it
  // does not schedule unrelated React state updates after their assertions.
  mockGetSystemStatus.mockReturnValue(new Promise(() => {}))
  mockRequestLibrary.mockResolvedValue({ granted: true })
  mockRequestCamera.mockResolvedValue({ granted: true })
  mockLaunchLibrary.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://cart.png', base64: 'abc123', mimeType: 'image/png', width: 100, height: 100 }],
  })
  takePendingScanImage() // drain anything a prior test left queued
})

describe('More tab · app version', () => {
  it('offers the Play Store update when the configured version is newer', async () => {
    const storeUrl = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'
    const nextVersion = `${Number(appJson.expo.version.split('.')[0]) + 1}.0.0`
    mockGetSystemStatus.mockResolvedValue({
      aiDisabled: false,
      maintenance: { on: false, message: '' },
      appUpdate: { android: { latestVersion: nextVersion, storeUrl } },
    })
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)

    const { findByText } = renderWithProviders(<MoreScreen />)
    fireEvent.press(await findByText(`Update available · v${nextVersion} →`))

    expect(openUrl).toHaveBeenCalledWith(storeUrl)
    openUrl.mockRestore()
  })

  it('keeps the existing version footer when the installed app is current', async () => {
    mockGetSystemStatus.mockResolvedValue({
      aiDisabled: false,
      maintenance: { on: false, message: '' },
      appUpdate: { android: { latestVersion: appJson.expo.version, storeUrl: 'https://play.google.com/' } },
    })

    const { findByText, queryByText } = renderWithProviders(<MoreScreen />)
    expect(await findByText(`v${appJson.expo.version} · built in the open`)).toBeTruthy()
    await waitFor(() => expect(mockGetSystemStatus).toHaveBeenCalled())
    expect(queryByText(/Update available/)).toBeNull()
  })
})

describe('More tab · web app row', () => {
  it('opens the web app in the browser', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)

    const { findByText } = renderWithProviders(<MoreScreen />)
    fireEvent.press(await findByText('Open web app'))

    expect(openUrl).toHaveBeenCalledWith(WEB_URL)
    openUrl.mockRestore()
  })
})

describe('More tab · Expense Wrapped row', () => {
  it('cycles the loading phrase while status is unresolved', () => {
    jest.useFakeTimers()
    mockUseWrappedStatus.mockReturnValue({ data: undefined })
    const { getByText, queryByText } = renderWithProviders(<MoreScreen />)
    expect(getByText('Checking last month…')).toBeTruthy()

    act(() => {
      jest.advanceTimersByTime(1800)
    })
    expect(getByText('Counting transactions…')).toBeTruthy()
    expect(queryByText('Checking last month…')).toBeNull()

    jest.useRealTimers()
  })

  it('shows a dot tracker and unlock copy below the transaction threshold', () => {
    mockUseWrappedStatus.mockReturnValue({
      data: {
        month: '2026-06',
        transactionCount: 4,
        available: false,
        minTransactions: 10,
        currentMonth: '2026-07',
        currentMonthCount: 3,
      },
    })
    const { getByText, getByLabelText } = renderWithProviders(<MoreScreen />)
    expect(getByText('●●●○○○○○○○')).toBeTruthy()
    expect(getByText("3/10 · unlocks Aug 1")).toBeTruthy()
    expect(getByLabelText("3 of 10 transactions logged. Unlocks Aug 1.")).toBeTruthy()
  })

  it('freezes the dots and switches to a waiting state once the goal is reached mid-month', () => {
    mockUseWrappedStatus.mockReturnValue({
      data: {
        month: '2026-06',
        transactionCount: 4,
        available: false,
        minTransactions: 10,
        currentMonth: '2026-07',
        currentMonthCount: 12,
      },
    })
    const { getByText, getByLabelText } = renderWithProviders(<MoreScreen />)
    expect(getByText('●●●●●●●●●●')).toBeTruthy()
    expect(getByText('Wrap unlocks Aug 1')).toBeTruthy()
    expect(getByLabelText('10 of 10 transactions logged. Wrap unlocks Aug 1.')).toBeTruthy()
  })

  it('is live with the month label once a completed edition is available', () => {
    mockUseWrappedStatus.mockReturnValue({
      data: {
        month: '2026-07',
        transactionCount: 14,
        available: true,
        minTransactions: 10,
        currentMonth: '2026-08',
        currentMonthCount: 3,
      },
    })
    const { getByText } = renderWithProviders(<MoreScreen />)
    expect(getByText('Your July 2026, wrapped')).toBeTruthy()
  })
})

describe('More tab · Sign out', () => {
  it('shows a pending label and revokes server-side before clearing locally', async () => {
    let releaseRevoke: () => void = () => {}
    ;(revokeSession as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        releaseRevoke = resolve
      }),
    )

    const { getByText, queryByText } = renderWithProviders(<MoreScreen />)
    fireEvent.press(getByText('Sign out'))

    // Still in flight: the button says so and the local session is untouched.
    await waitFor(() => expect(getByText('Signing out…')).toBeTruthy())
    expect(queryByText('Sign out')).toBeNull()
    expect(revokeSession).toHaveBeenCalledWith('session_1')
    expect(clearAccess).not.toHaveBeenCalled()

    releaseRevoke()
    await waitFor(() => expect(clearAccess).toHaveBeenCalled())
  })

  it('is inert while a sign-out is already in flight', async () => {
    ;(revokeSession as jest.Mock).mockReturnValue(new Promise<void>(() => {}))

    const { getByText } = renderWithProviders(<MoreScreen />)
    fireEvent.press(getByText('Sign out'))
    await waitFor(() => expect(getByText('Signing out…')).toBeTruthy())

    fireEvent.press(getByText('Signing out…'))
    expect(revokeSession).toHaveBeenCalledTimes(1)
  })
})

describe('More tab · Scan a bill sheet', () => {
  it('opens the picker sheet on top of this screen, not a separate one', async () => {
    const { getByText, queryByText } = renderWithProviders(<MoreScreen />)
    expect(queryByText('Take a photo')).toBeNull()

    fireEvent.press(getByText('Scan a bill'))
    expect(getByText('Take a photo')).toBeTruthy()
    expect(getByText('Choose a screenshot')).toBeTruthy()
    // The screen behind the sheet is still this one — no navigation yet.
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('closes the sheet and opens Bills Scanned from the Previous scans link', async () => {
    const { getByText, queryByText } = renderWithProviders(<MoreScreen />)
    fireEvent.press(getByText('Scan a bill'))
    fireEvent.press(getByText('Previous scans'))
    expect(mockPush).toHaveBeenCalledWith('/account/bill-scans')
    expect(queryByText('Take a photo')).toBeNull()
  })

  it('hands off the picked image and navigates to the scan-bill route', async () => {
    const { getByText } = renderWithProviders(<MoreScreen />)
    await flushCategories()

    fireEvent.press(getByText('Scan a bill'))
    fireEvent.press(getByText('Choose a screenshot'))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/modals/scan-bill'))
    expect(takePendingScanImage()).toEqual({ base64: 'abc123', mimeType: 'image/png' })
  })

  it('does not navigate when the picker is cancelled', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null })
    const { getByText, queryByText } = renderWithProviders(<MoreScreen />)
    await flushCategories()

    fireEvent.press(getByText('Scan a bill'))
    fireEvent.press(getByText('Choose a screenshot'))

    await waitFor(() => expect(queryByText('Take a photo')).toBeNull())
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('does not navigate when there are no categories to sort into', async () => {
    ;(getCategories as jest.Mock).mockResolvedValue([])
    const { getByText, queryByText } = renderWithProviders(<MoreScreen />)
    await flushCategories()

    fireEvent.press(getByText('Scan a bill'))
    fireEvent.press(getByText('Choose a screenshot'))

    await waitFor(() => expect(queryByText('Take a photo')).toBeNull())
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('does not show the empty-categories alert while categories are still loading', async () => {
    const { getByText, queryByText } = renderWithProviders(<MoreScreen />)
    // Deliberately no `await flushCategories()` — categoriesQ is still isLoading here.

    fireEvent.press(getByText('Scan a bill'))
    fireEvent.press(getByText('Choose a screenshot'))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/modals/scan-bill'))
    expect(queryByText('No categories yet')).toBeNull()
  })
})

describe('More tab · feature shortcuts', () => {
  it.each([
    ['Recurring expenses', '/account/recurring'],
    ['Archive', '/account/archive'],
    ['Subscriptions', '/subscriptions'],
    ['Insights', '/insights'],
  ])('opens %s from the feature grid', (label, route) => {
    const { getByText } = renderWithProviders(<MoreScreen />)

    fireEvent.press(getByText(label))

    expect(mockPush).toHaveBeenCalledWith(route)
  })
})

it('opens the guided tour from the account list', async () => {
  const { getByText } = renderWithProviders(<MoreScreen />)
  await flushCategories()

  fireEvent.press(getByText('How this works'))

  expect(mockPush).toHaveBeenCalledWith('/account/guided-tour')
})

describe('More tab · hidden features', () => {
  it('drops hidden feature cards and the Bills Scanned row, keeps the rest', async () => {
    mockUseUser.mockReturnValue({ data: { email: 'a@b.com', emailVerified: true, hiddenFeatures: ['investments', 'billScan'] } })
    const { queryByText, getByText } = renderWithProviders(<MoreScreen />)
    await flushCategories()
    expect(queryByText('Investments')).toBeNull()
    expect(queryByText('Scan a bill')).toBeNull()
    expect(queryByText('Bills Scanned')).toBeNull()
    expect(getByText('Insights')).toBeTruthy()
    expect(getByText('2 hidden')).toBeTruthy()
  })

  it('opens the Features screen from Preferences', async () => {
    const { getByText } = renderWithProviders(<MoreScreen />)
    await flushCategories()
    fireEvent.press(getByText('Features'))
    expect(mockPush).toHaveBeenCalledWith('/account/features')
  })
})
