import { Profiler, useState } from 'react'
import * as mockReact from 'react'
import { Animated, Linking, Platform } from 'react-native'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { Path } from 'react-native-svg'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { currentMonthKey, monthAbbrev } from '@/src/lib/envelope'
import { getSystemStatus } from '@/src/api/systemStatus'
import { lightTokens } from '@/src/theme/tokens'
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
let mockUser: { onboardedAt?: string; getStartedAt?: string; manualTransactionCompletedAt?: string; guidedTourCompletedAt?: string; createdAt?: string; hiddenFeatures?: string[] } = {}
let mockExpenses: { category: string; amountInr: number; date: string }[] = []
let mockBilling: object | undefined
let mockWrappedStatus: { available: boolean } | undefined
let mockSuggestions: { suggestions: { kind: string }[] } | undefined
const mockMutate = jest.fn()
const mockRefetch = jest.fn()

jest.mock('@/src/hooks/useBudgets', () => ({
  useBudgets: () => ({ data: mockBudgets, isLoading: false, error: mockBudgetsError, refetch: mockRefetch }),
}))
jest.mock('@/src/hooks/useExpenses', () => ({
  useRecentExpenses: () => ({ data: mockExpenses, isLoading: false, error: null, refetch: jest.fn() }),
  useLastSpent: () => ({ data: {} }),
}))
let mockSchedules: { id: string; frequency: string; status: string }[] | undefined = []
jest.mock('@/src/hooks/useIncomes', () => ({ useRecurringIncomes: () => ({ data: mockSchedules }) }))
jest.mock('@/src/hooks/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))
jest.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ name: 'Food', group: 'Everyday' }], isLoading: false, error: null, refetch: jest.fn() }),
}))
jest.mock('@/src/hooks/useGroups', () => ({
  useGroups: () => ({ data: ['Everyday'], isLoading: false, error: null, refetch: jest.fn() }),
}))
jest.mock('@/src/hooks/useUser', () => ({
  useUser: () => ({ data: mockUser, isLoading: false, error: null }),
  useUpdateUser: () => ({ mutate: mockMutate }),
}))
jest.mock('@/src/hooks/useBillingStatus', () => ({ useBillingStatus: () => ({ data: mockBilling }) }))
let mockWrappedLoading = false
jest.mock('@/src/hooks/useWrapped', () => ({ useWrappedStatus: () => ({ data: mockWrappedStatus, isLoading: mockWrappedLoading }) }))
let mockSuggestionsLoading = false
jest.mock('@/src/hooks/useRecurringSuggestions', () => ({ useRecurringSuggestions: () => ({ data: mockSuggestions, isLoading: mockSuggestionsLoading }) }))
jest.mock('@/src/components/ui/AlertHost', () => ({ Alert: { alert: jest.fn() } }))
jest.mock('@/src/api/systemStatus', () => ({ getSystemStatus: jest.fn(() => new Promise(() => {})) }))
// Covered by its own test; it fetches and reads SecureStore, neither of which this screen's tests are about.
jest.mock('@/src/components/balance/BalanceCheckCard', () => ({ BalanceCheckCard: () => null }))
const mockPush = jest.fn()
const mockNavigate = jest.fn()
// A tab's focus as the navigator holds it: isFocused() reads it, and focus/blur
// listeners hear it change without anything re-rendering on their own.
const mockNav = {
  focused: true,
  listeners: new Set<(type: 'focus' | 'blur') => void>(),
  isFocused: () => mockNav.focused,
  emit(type: 'focus' | 'blur') {
    mockNav.focused = type === 'focus'
    mockNav.listeners.forEach((l) => l(type))
  },
}
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: mockNavigate }),
  useNavigation: () => mockNav,
  // Like React Navigation's: re-renders its caller on every blur and focus.
  useIsFocused: () => {
    const [focused, setFocused] = mockReact.useState(mockNav.focused)
    mockReact.useEffect(() => {
      const listener = (type: 'focus' | 'blur') => setFocused(type === 'focus')
      mockNav.listeners.add(listener)
      return () => { mockNav.listeners.delete(listener) }
    }, [])
    return focused
  },
  // Same contract as React Navigation's: runs on focus, cleans up on blur.
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockReact.useEffect(() => {
      let cleanup = mockNav.focused ? effect() : undefined
      const listener = (type: 'focus' | 'blur') => {
        cleanup?.()
        cleanup = type === 'focus' ? effect() : undefined
      }
      mockNav.listeners.add(listener)
      return () => {
        mockNav.listeners.delete(listener)
        cleanup?.()
      }
    }, [effect])
  },
}))

// Its own focus re-render is cheap and not what the tab-switch test measures.
jest.mock('@/src/components/nav/AnimatedTabContent', () => ({ AnimatedTabContent: ({ children }: any) => children }))

function renderHome() {
  return renderWithProviders(<HomeScreen />)
}

describe('HomeScreen · Ready to Assign', () => {
  beforeEach(() => {
    mockNav.focused = true
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

    // No schedule yet: Change income starts one from today's monthly figure.
    fireEvent.press(getByText('Change income'))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/modals/recurring-income', params: { label: 'Monthly income', frequency: 'monthly', amount: '20000' } })
    fireEvent.press(getByLabelText('Ready to Assign options'))
    fireEvent.press(getByText('Add income'))
    expect(mockPush).toHaveBeenLastCalledWith('/modals/add-income')
    fireEvent.press(getByLabelText('Ready to Assign options'))
    fireEvent.press(getByText('Manage income'))
    expect(mockPush).toHaveBeenLastCalledWith('/account/income')
    fireEvent.press(getByLabelText('Ready to Assign options'))
    fireEvent.press(getByText('Set Ready to Assign'))
    expect(mockPush).toHaveBeenLastCalledWith('/modals/edit-ready-to-assign')
  })

  it('Change income edits the one monthly schedule, or sends you to pick among several', () => {
    mockSchedules = [{ id: 'r1', frequency: 'monthly', status: 'active' }, { id: 'r2', frequency: 'weekly', status: 'active' }]
    const first = renderHome()
    fireEvent.press(first.getByLabelText('Ready to Assign options'))
    fireEvent.press(first.getByText('Change income'))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/modals/recurring-income', params: { id: 'r1' } })
    first.unmount()

    mockSchedules = [{ id: 'r1', frequency: 'monthly', status: 'active' }, { id: 'r3', frequency: 'monthly', status: 'active' }]
    const second = renderHome()
    fireEvent.press(second.getByLabelText('Ready to Assign options'))
    fireEvent.press(second.getByText('Change income'))
    expect(mockPush).toHaveBeenLastCalledWith('/account/income')
    second.unmount()

    // Not loaded yet: never a create form that could duplicate a schedule.
    mockSchedules = undefined
    const third = renderHome()
    fireEvent.press(third.getByLabelText('Ready to Assign options'))
    fireEvent.press(third.getByText('Change income'))
    expect(mockPush).toHaveBeenLastCalledWith('/account/income')
    mockSchedules = []
  })

  it('shows an income pill that opens the income options', () => {
    const { getByText } = renderHome()

    fireEvent.press(getByText('Income · ₹20,000'))
    expect(getByText('Change income')).toBeTruthy()
  })

  it('sends the pill straight to setting income when there is none', () => {
    mockBudgets = []
    const { getByText } = renderHome()

    fireEvent.press(getByText('Set your income'))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/modals/recurring-income', params: { label: 'Monthly income', frequency: 'monthly', amount: '' } })
  })

  it('shrinks Ready to Assign to a slim row once every rupee is assigned', () => {
    mockBudgets = [
      { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' },
      { month: MONTH, category: 'Food', assigned: '20000', rolled_over: '0' },
    ]
    const { getByTestId, queryByTestId, getByLabelText, getByText } = renderHome()
    expect(getByTestId('rta-slim')).toBeTruthy()
    expect(queryByTestId('rta-hero')).toBeNull()

    // Same tap target and income options as the full hero.
    fireEvent.press(getByLabelText('Ready to Assign options'))
    expect(getByText('Change income')).toBeTruthy()
  })

  it('celebrates the moment Ready to Assign reaches zero, not a load that starts there', () => {
    // A budget save refetches into the same mounted screen; a rerender with new data stands in for it.
    let refetched = () => {}
    function Harness() {
      const [, setTick] = useState(0)
      refetched = () => setTick((n) => n + 1)
      return <HomeScreen />
    }
    const view = renderWithProviders(<Harness />)
    expect(view.queryByText('Every rupee has a job.')).toBeNull()
    mockBudgets = [
      { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' },
      { month: MONTH, category: 'Food', assigned: '20000', rolled_over: '0' },
    ]
    act(() => refetched())
    expect(view.getByText('Every rupee has a job.')).toBeTruthy()
    view.unmount()

    const fresh = renderHome()
    expect(fresh.getByTestId('rta-slim')).toBeTruthy()
    expect(fresh.queryByText('Every rupee has a job.')).toBeNull()
  })

  it("doesn't re-render on a tab switch that changes nothing on screen", () => {
    // Home is the heaviest tab; re-rendering it on every blur and focus held up
    // the switch to Activity (and back) on the JS thread.
    let renders = 0
    renderWithProviders(<Profiler id="home" onRender={() => { renders++ }}><HomeScreen /></Profiler>)
    const before = renders
    act(() => mockNav.emit('blur'))
    act(() => mockNav.emit('focus'))
    expect(renders).toBe(before)
  })

  it('holds a Ready to Assign change made while covered until Home is back in view', () => {
    let refetched = () => {}
    function Harness() {
      const [, setTick] = useState(0)
      refetched = () => setTick((n) => n + 1)
      return <HomeScreen />
    }
    const view = renderWithProviders(<Harness />)
    act(() => mockNav.emit('blur'))
    mockBudgets = [
      { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' },
      { month: MONTH, category: 'Food', assigned: '8000', rolled_over: '0' },
    ]
    act(() => refetched())
    expect(view.getByLabelText('₹15,000')).toBeTruthy()
    act(() => mockNav.emit('focus'))
    expect(view.getByLabelText('₹12,000')).toBeTruthy()
  })

  it('shows the month in the header', () => {
    const { getByText } = renderHome()
    expect(getByText(`${monthAbbrev(MONTH)} ${MONTH.slice(0, 4)}`)).toBeTruthy()
  })

  it('keeps the full hero while money is left to assign, or before income is set', () => {
    const first = renderHome()
    expect(first.getByTestId('rta-hero')).toBeTruthy()
    first.unmount()

    mockBudgets = []
    const second = renderHome()
    expect(second.getByTestId('rta-hero')).toBeTruthy()
    expect(second.queryByTestId('rta-slim')).toBeNull()
  })

  it('uses the app icon as the home header brand', () => {
    const { getByLabelText, queryByText, UNSAFE_getAllByType } = renderHome()

    expect(getByLabelText('Aviary app icon')).toBeTruthy()
    expect(queryByText('Aviary')).toBeNull()
    expect(UNSAFE_getAllByType(Path).some((path) => path.props.fill === lightTokens.accent)).toBe(true)
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

    expect(await findByText('1/4')).toBeTruthy()
    expect(getByText('Set up your budget')).toBeTruthy()
    expect(getByText('₹15,000 still to assign')).toBeTruthy()
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

  it('removes Get Started once every step is complete', () => {
    mockBudgets = [
      { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' },
      { month: MONTH, category: 'Food', assigned: '20000', rolled_over: '0' },
    ]
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
    expect(await findByText('0/4')).toBeTruthy()
    expect(queryByText('Set up your budget')).toBeNull()

    fireEvent.press(await findByText('Add your income'))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/modals/recurring-income', params: { label: 'Monthly income', frequency: 'monthly', amount: '' } })
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
    expect(await findByText('2/4')).toBeTruthy()
    expect(await findByText('Add your income')).toBeTruthy()
  })

  // Income alone leaves every envelope at zero, so the next step is assigning it.
  it('asks to assign all of the income, opening the next empty envelope', async () => {
    mockBudgets = [
      { month: MONTH, category: '__income__', assigned: '50000', rolled_over: '0' },
      { month: MONTH, category: 'Food', assigned: '0', rolled_over: '0' },
    ]
    const { findByText, getByText } = renderHome()
    expect(await findByText('1/4')).toBeTruthy()
    expect(getByText('₹50,000 still to assign')).toBeTruthy()

    fireEvent.press(getByText('Assign all your income'))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/modals/edit-assigned-amount', params: { category: 'Food' } })
  })

  it('ticks the assign step once Ready to Assign hits zero', async () => {
    mockBudgets = [
      { month: MONTH, category: '__income__', assigned: '50000', rolled_over: '0' },
      { month: MONTH, category: 'Food', assigned: '50000', rolled_over: '0' },
    ]
    const { findByText } = renderHome()
    expect(await findByText('2/4')).toBeTruthy()
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

describe('HomeScreen · one banner at a time', () => {
  const NEW_ACCOUNT = '2026-11-01T00:00:00.000Z'
  const trial = (days: number) => ({ mode: 'trial', enforced: true, purchaseEnabled: true, allowed: true, trialDaysRemaining: days })
  const PREV = (() => {
    const [y, m] = MONTH.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  })()
  const expenses = (n: number) => Array.from({ length: n }, (_, i) => ({ category: 'Food', amountInr: 10 + i, date: `${MONTH}-01` }))

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })
    mockPush.mockClear()
    mockMutate.mockClear()
    mockBudgetsError = null
    mockUser = { createdAt: NEW_ACCOUNT }
    mockExpenses = []
    mockBilling = undefined
    mockWrappedStatus = undefined
    mockSuggestions = undefined
    mockSuggestionsLoading = false
    mockWrappedLoading = false
    mockBudgets = [
      { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' },
      { month: PREV, category: '__income__', assigned: '5000', rolled_over: '0' },
    ]
  })

  it('shows the trial reminder over the rollover banner at 3 days left', async () => {
    mockBilling = trial(3)
    const { findByText, queryByText } = renderHome()
    expect(await findByText(/Free trial · 3 days left/)).toBeTruthy()
    expect(queryByText(/went to savings last month/)).toBeNull()
  })

  it('skips the 7-day trial reminder and shows the rollover banner', async () => {
    mockBilling = trial(7)
    const { findByText, queryByText } = renderHome()
    expect(await findByText(/went to savings last month/)).toBeTruthy()
    expect(queryByText(/Free trial/)).toBeNull()
  })

  it('lets Nice dismiss the rollover banner', async () => {
    mockBilling = trial(7)
    const { findByText, getByText, queryByText } = renderHome()
    expect(await findByText(/went to savings last month/)).toBeTruthy()
    fireEvent.press(getByText('Nice'))
    await waitFor(() => expect(queryByText(/went to savings last month/)).toBeNull())
  })

  it('offers Insights once 30 expenses are logged, with nothing above it', async () => {
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
    mockExpenses = expenses(30)
    const { findByText } = renderHome()
    expect(await findByText(/Insights can show you where it all goes/)).toBeTruthy()
    fireEvent.press(await findByText('Turn on'))
    expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: ['askAviary', 'billScan', 'wrapped', 'investments', 'subscriptions'] }, expect.anything())
    expect(mockNavigate).toHaveBeenCalledWith('/insights')
  })

  it('offers Subscriptions first when a scan found one', async () => {
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
    mockExpenses = expenses(30)
    mockSuggestions = { suggestions: [{ kind: 'subscription' }] }
    const { findByText, queryByText } = renderHome()
    expect(await findByText(/pay for a few subscriptions/)).toBeTruthy()
    expect(queryByText(/Insights can show you/)).toBeNull()
  })

  it('holds the slot while the subscription check is still loading', async () => {
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
    mockExpenses = expenses(30)
    mockSuggestionsLoading = true
    const { queryByText } = renderHome()
    await act(async () => {})
    expect(queryByText(/Insights can show you/)).toBeNull()
  })

  it('holds the slot while Wrapped status is still loading', async () => {
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
    mockExpenses = expenses(30)
    mockWrappedLoading = true
    const { queryByText } = renderHome()
    await act(async () => {})
    expect(queryByText('Turn on')).toBeNull()
  })

  it('says so when turning a feature on fails', async () => {
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
    mockExpenses = expenses(30)
    const { findByText } = renderHome()
    fireEvent.press(await findByText('Turn on'))
    act(() => mockMutate.mock.calls[0][1].onError(new Error('offline')))
    expect(jest.requireMock('@/src/components/ui/AlertHost').Alert.alert).toHaveBeenCalledWith("Couldn't turn that on", 'Check your connection and try again.')
  })

  it('offers Wrapped when last month unlocks, and remembers Not now', async () => {
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
    mockWrappedStatus = { available: true }
    const { findByText, queryByText } = renderHome()
    fireEvent.press(await findByText('Not now'))
    await waitFor(() => expect(queryByText(/Wrapped is ready/)).toBeNull())
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('mc-rollover-dismissed-nudge-wrapped', '1')
  })

  it('offers Scan a bill after 10 expenses, opening the scan sheet', async () => {
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
    mockExpenses = expenses(10)
    const { findByText } = renderHome()
    expect(await findByText(/Got a receipt/)).toBeTruthy()
    fireEvent.press(await findByText('Turn on'))
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/more', params: { scan: '1' } })
  })

  it('offers Ask Aviary after a week of logging days', async () => {
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
    mockExpenses = Array.from({ length: 7 }, (_, i) => ({ category: 'Food', amountInr: 10, date: `${MONTH}-0${i + 1}` }))
    const { findByText } = renderHome()
    expect(await findByText(/Ask Aviary can answer questions/)).toBeTruthy()
  })

  it('never offers a feature that is already on', async () => {
    mockBudgets = [{ month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0' }]
    mockUser = { createdAt: '2026-01-01T00:00:00.000Z' }
    mockExpenses = expenses(40)
    mockWrappedStatus = { available: true }
    const { queryByText } = renderHome()
    await act(async () => {})
    expect(queryByText('Turn on')).toBeNull()
  })

  it('has no Insights link when Insights is off', async () => {
    const { queryByLabelText, queryByText } = renderHome()
    await act(async () => {})
    expect(queryByLabelText('Insights')).toBeNull()
    expect(queryByText('Trends, daily spend and subscriptions')).toBeNull()
  })
})
