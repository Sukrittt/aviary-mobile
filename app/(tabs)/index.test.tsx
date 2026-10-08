import { Animated, Linking, Platform } from 'react-native'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { Path } from 'react-native-svg'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { currentMonthKey } from '@/src/lib/envelope'
import { getSystemStatus } from '@/src/api/systemStatus'
import appJson from '@/app.json'
import HomeScreen from './index'

const MONTH = currentMonthKey()

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))

let mockBudgets: { month: string; category: string; assigned: string; rolled_over: string }[] = []
let mockBudgetsError: Error | null = null
let mockUser: { onboardedAt?: string; getStartedAt?: string; manualTransactionCompletedAt?: string; guidedTourCompletedAt?: string } = {}
const mockRefetch = jest.fn()

jest.mock('@/src/hooks/useBudgets', () => ({
  useBudgets: () => ({ data: mockBudgets, isLoading: false, error: mockBudgetsError, refetch: mockRefetch }),
}))
jest.mock('@/src/hooks/useExpenses', () => ({
  useRecentExpenses: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useLastSpent: () => ({ data: {} }),
}))
jest.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ name: 'Food', group: 'Everyday' }], isLoading: false, error: null, refetch: jest.fn() }),
}))
jest.mock('@/src/hooks/useGroups', () => ({
  useGroups: () => ({ data: ['Everyday'], isLoading: false, error: null, refetch: jest.fn() }),
}))
jest.mock('@/src/hooks/useUser', () => ({
  useUser: () => ({ data: mockUser, isLoading: false, error: null }),
}))
jest.mock('@/src/api/systemStatus', () => ({ getSystemStatus: jest.fn(() => new Promise(() => {})) }))
// Covered by its own test; it fetches and reads SecureStore, neither of which this screen's tests are about.
jest.mock('@/src/components/balance/BalanceCheckCard', () => ({ BalanceCheckCard: () => null }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useIsFocused: () => true,
}))

function renderHome() {
  return renderWithProviders(<HomeScreen />)
}

describe('HomeScreen · Ready to Assign', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockBudgetsError = null
    mockUser = { onboardedAt: '2026-10-01T00:00:00.000Z', getStartedAt: '2026-10-01T00:00:00.000Z' }
    mockRefetch.mockClear()
    mockBudgets = [
      { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' },
      { month: MONTH, category: 'Food', assigned: '5000', rolled_over: '0' },
    ]
  })

  it('shows Ready to Assign as income minus assigned', () => {
    const { getByLabelText } = renderHome()
    // Ready to Assign = 20,000 income - 5,000 assigned to Food.
    expect(getByLabelText('₹15,000')).toBeTruthy()
  })

  it('opens income options from the Ready to Assign hero', () => {
    const { getByLabelText, getByText } = renderHome()

    fireEvent.press(getByLabelText('Ready to Assign options'))
    expect(getByText('Income ₹20,000')).toBeTruthy()

    fireEvent.press(getByText('Change income'))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/modals/edit-month-income', params: { month: MONTH, initial: '20000' } })
    fireEvent.press(getByLabelText('Ready to Assign options'))
    fireEvent.press(getByText('Add income'))
    expect(mockPush).toHaveBeenLastCalledWith('/modals/add-income')
    fireEvent.press(getByLabelText('Ready to Assign options'))
    fireEvent.press(getByText('Set Ready to Assign'))
    expect(mockPush).toHaveBeenLastCalledWith('/modals/edit-ready-to-assign')
  })

  it('uses the app icon as the home header brand', () => {
    const { getByLabelText, queryByText, UNSAFE_getAllByType } = renderHome()

    expect(getByLabelText('Aviary app icon')).toBeTruthy()
    expect(queryByText('Aviary')).toBeNull()
    expect(UNSAFE_getAllByType(Path).some((path) => path.props.fill === '#000000')).toBe(true)
  })

  it('fades the settled bird out before resetting the landing choreography', async () => {
    const timingSpy = jest.spyOn(Animated, 'timing')
    const landingSpy = jest.spyOn(Animated, 'parallel')
    const { getByLabelText } = renderHome()
    await act(async () => {})
    timingSpy.mockClear()
    landingSpy.mockClear()

    fireEvent.press(getByLabelText('Aviary app icon'))

    expect(timingSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0, duration: 180 }),
    )
    expect(landingSpy).not.toHaveBeenCalled()
    timingSpy.mockRestore()
    landingSpy.mockRestore()
  })

  it('opens the full-screen edit-assigned-amount modal for the tapped category', () => {
    const { getByText } = renderHome()

    fireEvent.press(getByText('Food'))
    fireEvent.press(getByText('Edit assigned amount'))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/modals/edit-assigned-amount',
      params: { category: 'Food' },
    })
  })

  it('shows DB-backed getting-started progress and opens each unfinished step', async () => {
    const { getByText, findByText } = renderHome()

    expect(await findByText('1/3')).toBeTruthy()
    expect(getByText('Set up your budget')).toBeTruthy()
    fireEvent.press(getByText('Add a manual transaction'))
    expect(mockPush).toHaveBeenLastCalledWith('/modals/log-expense')
    fireEvent.press(getByText('Take a guided tour'))
    expect(mockPush).toHaveBeenLastCalledWith('/account/guided-tour')
  })

  it('hides Get Started when skipped, and remembers it on this device', async () => {
    const { findByText, queryByText, getByLabelText } = renderHome()
    await findByText('Get started')

    fireEvent.press(getByLabelText('Skip getting started'))

    await waitFor(() => expect(queryByText('Get started')).toBeNull())
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('mc-rollover-dismissed-get-started', '1')
  })

  it('stays hidden when skipped earlier on this device', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'mc-rollover-dismissed-get-started' ? '1' : null),
    )
    const { queryByText, findByText } = renderHome()
    await findByText('Envelopes')
    expect(queryByText('Get started')).toBeNull()
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation(() => Promise.resolve(null))
  })

  it('removes Get Started once both remaining milestones are complete', () => {
    mockUser = {
      onboardedAt: '2026-10-01T00:00:00.000Z',
      getStartedAt: '2026-10-01T00:00:00.000Z',
      manualTransactionCompletedAt: '2026-10-01T01:00:00.000Z',
      guidedTourCompletedAt: '2026-10-01T02:00:00.000Z',
    }
    const { queryByText } = renderHome()
    expect(queryByText('Get started')).toBeNull()
  })

  // Setup can skip income, so Get started keeps asking until there's some.
  it('asks for income first when setup skipped it, opening the income editor', async () => {
    mockBudgets = [{ month: MONTH, category: 'Food', assigned: '0', rolled_over: '0' }]
    const { findByText, queryByText } = renderHome()
    expect(await findByText('0/3')).toBeTruthy()
    expect(queryByText('Set up your budget')).toBeNull()

    fireEvent.press(await findByText('Add your income'))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/modals/edit-month-income', params: { month: MONTH, initial: '0' } })
  })

  it('keeps Get started up without income, even with both other milestones done', async () => {
    mockBudgets = []
    mockUser = {
      onboardedAt: '2026-10-01T00:00:00.000Z',
      getStartedAt: '2026-10-01T00:00:00.000Z',
      manualTransactionCompletedAt: '2026-10-01T01:00:00.000Z',
      guidedTourCompletedAt: '2026-10-01T02:00:00.000Z',
    }
    const { findByText } = renderHome()
    expect(await findByText('2/3')).toBeTruthy()
    expect(await findByText('Add your income')).toBeTruthy()
  })

  it('shows a retryable error screen instead of raw error text when a query fails', () => {
    // First load failed, so there's nothing saved to fall back on.
    mockBudgetsError = new Error('network error')
    mockBudgets = undefined as unknown as typeof mockBudgets
    const { getByText, queryByText } = renderHome()

    expect(getByText("Couldn't load your budget")).toBeTruthy()
    expect(queryByText(/network error/i)).toBeNull()

    fireEvent.press(getByText('Try again'))
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('keeps the budget on screen when a refresh fails', () => {
    mockBudgetsError = new Error('network error')
    const { queryByText } = renderHome()
    expect(queryByText("Couldn't load your budget")).toBeNull()
  })
})

describe('HomeScreen · minimum version banner', () => {
  const storeUrl = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'
  const status = (minVersion: string) => ({
    aiDisabled: false,
    maintenance: { on: false, message: '' },
    appUpdate: { android: { latestVersion: minVersion, minVersion, storeUrl } },
  })

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
    mockBudgetsError = null
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
  })

  it('links to the store when the installed app is below the minimum', async () => {
    const nextVersion = `${Number(appJson.expo.version.split('.')[0]) + 1}.0.0`
    ;(getSystemStatus as jest.Mock).mockResolvedValueOnce(status(nextVersion))
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)

    const { findByText } = renderHome()
    fireEvent.press(await findByText('Update'))

    expect(openUrl).toHaveBeenCalledWith(storeUrl)
    openUrl.mockRestore()
  })

  it('stays hidden when the installed app meets the minimum', async () => {
    ;(getSystemStatus as jest.Mock).mockResolvedValueOnce(status(appJson.expo.version))

    const { queryByText } = renderHome()
    await act(async () => {})

    expect(getSystemStatus).toHaveBeenCalled()
    expect(queryByText(/new version of Aviary/)).toBeNull()
  })
})
