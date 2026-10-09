import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { notifyManager } from '@tanstack/react-query'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getRecentExpenses, deleteExpense, postExpensePayload } from '@/src/api/expenses'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as pendingExpenses from '@/src/lib/pendingExpenses'
import { flush } from '@/src/sync/flush'
import { getBudgets } from '@/src/api/budgets'
import { getCategories } from '@/src/api/categories'
import { getGroups } from '@/src/api/groups'
import ExpenseAddedScreen from './expense-added'
import { recordLogAndMaybeAsk } from '@/src/lib/reviewPrompt'
import { DELTA_DELAY, DELTA_DURATION } from '@/src/components/envelope/DeltaBar'
import { currentMonthKey, daysLeftInMonth, prevMonthKey } from '@/src/lib/envelope'
import { fontFamily } from '@/src/theme/fonts'
import { type } from '@/src/theme/scale'

jest.mock('@/src/api/expenses', () => ({
  getRecentExpenses: jest.fn(),
  addExpense: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
  postExpensePayload: jest.fn(),
}))
jest.mock('@/src/api/accessMode', () => ({
  ...jest.requireActual('@/src/api/accessMode'),
  currentUserId: () => 'undo-user',
  sessionGeneration: () => 1,
  getValidToken: jest.fn(async () => 'token'),
}))
jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(),
  addBudget: jest.fn(),
  updateBudget: jest.fn(),
  deleteBudget: jest.fn(),
}))
jest.mock('@/src/api/categories', () => ({
  getCategories: jest.fn(),
  addCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
  moveCategory: jest.fn(),
}))
jest.mock('@/src/api/groups', () => ({
  getGroups: jest.fn(),
  addGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  moveGroup: jest.fn(),
}))
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Soft: 'soft', Light: 'light', Medium: 'medium' },
}))
jest.mock('@/src/lib/reviewPrompt', () => ({
  recordLogAndMaybeAsk: jest.fn(() => Promise.resolve(false)),
}))
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn() }) }))

// React Query's default notifyManager defers subscriber notifications to a
// `setTimeout(0)` scheduler, which can fire after a test's own assertions
// are done and land outside `act`. Running the scheduler synchronously keeps
// every render a query settling causes inside the same act scope as the
// code (a promise resolving) that triggered it.
notifyManager.setScheduler((callback) => callback())

// `mock`-prefixed so Jest's out-of-scope guard allows the factory to close over them.
const mockReplace = jest.fn()
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// computeEnvelopeState only counts expenses in the *current* month, so the
// fixture has to move with the clock rather than pin a date — using the same
// (local-time) month key the app itself computes, not a UTC one, or the two
// drift apart for part of each day.
const MONTH = currentMonthKey()
const TODAY = `${MONTH}-15`
const MONTH_LABEL = MONTHS[Number(MONTH.slice(5)) - 1]
const YEAR2 = MONTH.slice(2, 4)

const BASE_PARAMS = {
  version: '0',
  id: 'abc123',
  timestamp: `${TODAY}T01:24:00`,
  item: 'Milk',
  amount: '450',
  category: '🛒 Groceries',
  date: TODAY,
  notes: '',
  paymentMethod: 'bank',
}

// `budgets` defaults to the standard row rather than being fixed, so a
// caller that needs a different shape (e.g. no budget at all) can set its
// own mock *before* calling setup() without this overwriting it back.
function setup(
  overrides: Partial<typeof BASE_PARAMS> = {},
  expenses: object[] = [],
  budgets: object[] = [{ month: MONTH, category: '🛒 Groceries', assigned: '8000', rolled_over: '0' }],
) {
  mockParams = { ...BASE_PARAMS, ...overrides }
  ;(getRecentExpenses as jest.Mock).mockResolvedValue({ rows: expenses, lastSpent: {} })
  ;(getBudgets as jest.Mock).mockResolvedValue(budgets)
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: '🛒 Groceries', group: 'Food' }])
  ;(getGroups as jest.Mock).mockResolvedValue(['Food'])
  return renderWithProviders(<ExpenseAddedScreen />)
}

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.clearAllMocks()
  jest.mocked(deleteExpense).mockReset()
  jest.mocked(postExpensePayload).mockReset()
})

const COUNTDOWN_SLOW = { timeout: DELTA_DELAY + 1500 }

it('reads back the amount, item and time of what was just logged', async () => {
  const { getByLabelText, getByText } = setup()
  // The amount animates, so the full string only exists on the odometer's label.
  expect(getByLabelText('₹450')).toBeTruthy()
  expect(getByText('Milk')).toBeTruthy()
  expect(getByText(`15 ${MONTH_LABEL} '${YEAR2}, 1:24 am`)).toBeTruthy()
  await waitFor(() => expect(getGroups).toHaveBeenCalled())
})

it('taps a soft haptic as each section is revealed', async () => {
  // Past-month expense: no budget card, so just headline, item and footer.
  setup({ date: `${prevMonthKey(MONTH)}-15` })
  await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledTimes(3))
  expect(jest.mocked(Haptics.impactAsync).mock.calls.every(([s]) => s === 'soft')).toBe(true)
})

// Category already shows in the budget card below (pill + dot), so the
// subtitle under the headline is the item name alone, even when the item
// happens to share the category's name.
it('falls back to the category label only when there is no item name', async () => {
  // Icon and text are separate Text nodes (not one "🛒 Groceries" string) — a
  // ZWJ+variation-selector emoji sharing a custom-font Text run with its label
  // can make Android silently drop the rest of that run.
  const { getByText } = setup({ item: '' })
  expect(getByText('🛒')).toBeTruthy()
  expect(getByText('Groceries')).toBeTruthy()
  await waitFor(() => expect(getGroups).toHaveBeenCalled())
})

// The card first establishes the old envelope state, then the percentage and
// new bar segment move together after a short hold.
it('counts percentage used from the old value to the new value', async () => {
  const { getByText, queryByText } = setup({}, [
    { date: TODAY, amount_inr: '3200', category: '🛒 Groceries', timestamp: 'other' },
  ])
  await waitFor(() => expect(getByText('40% used')).toBeTruthy())
  expect(queryByText('46% used')).toBeNull()
  await waitFor(
    () => expect(getByText('46% used')).toBeTruthy(),
    { timeout: DELTA_DELAY + DELTA_DURATION + 1500 },
  )
  expect(getByText('left of ₹8,000')).toBeTruthy()
  // Category header (dot + name) and the days-left/pace footer. Not
  // hardcoded: daysLeftInMonth() reads the real wall-clock date, same as the
  // screen does, so the assertion has to track it rather than freeze today's
  // value.
  expect(getByText('Groceries')).toBeTruthy()
  const days = daysLeftInMonth()
  expect(getByText(days === 0 ? 'Less than 24 hrs' : `${days} days left`)).toBeTruthy()
})

it('moves the percentage badge colors through the same old-to-new thresholds', async () => {
  const { getByText, getByTestId } = setup(
    { amount: '3760' },
    [{ date: TODAY, amount_inr: '4000', category: '🛒 Groceries', timestamp: 'other' }],
  )
  await waitFor(() => expect(getByText('50% used')).toBeTruthy())

  const dot = getByTestId('envelope-category-dot')
  const pill = getByTestId('percent-used-pill')
  expect(StyleSheet.flatten(dot.props.style).backgroundColor).toBe('rgba(31, 122, 77, 1)')
  expect(StyleSheet.flatten(pill.props.style).backgroundColor).toBe('rgba(31, 122, 77, 0.18)')

  await waitFor(
    () => {
      expect(getByText('97% used')).toBeTruthy()
      expect(StyleSheet.flatten(dot.props.style).backgroundColor).toBe('rgba(215, 14, 58, 1)')
      expect(StyleSheet.flatten(pill.props.style).backgroundColor).toBe('rgba(215, 14, 58, 0.18)')
    },
    COUNTDOWN_SLOW,
  )
})

it('uses the emphasized typography hierarchy from the confirmation design', async () => {
  const { getByText } = setup({ item: 'Apples' })
  await waitFor(() => expect(getByText('6% used')).toBeTruthy(), COUNTDOWN_SLOW)

  const days = daysLeftInMonth()
  const daysLabel = days === 0 ? 'Less than 24 hrs' : `${days} days left`
  const perDay = days > 0 ? Math.round(7550 / days) : 7550

  expect(StyleSheet.flatten(getByText('Apples').props.style)).toMatchObject({ fontFamily: fontFamily.bodyExtraBold })
  expect(StyleSheet.flatten(getByText('Groceries').props.style)).toMatchObject({ fontFamily: fontFamily.bodyExtraBold })
  expect(StyleSheet.flatten(getByText('6% used').props.style)).toMatchObject({ fontFamily: fontFamily.bodyExtraBold })
  expect(StyleSheet.flatten(getByText('left of ₹8,000').props.style)).toMatchObject({
    fontFamily: fontFamily.bodyBold,
    fontSize: type.caption,
  })
  expect(StyleSheet.flatten(getByText(daysLabel).props.style)).toMatchObject({ fontFamily: fontFamily.bodyExtraBold })
  expect(StyleSheet.flatten(getByText(`₹${perDay.toLocaleString('en-IN')}/day to stay on track`).props.style)).toMatchObject({
    fontFamily: fontFamily.bodyExtraBold,
  })
  expect(StyleSheet.flatten(getByText(`15 ${MONTH_LABEL} '${YEAR2}, 1:24 am`).props.style)).toMatchObject({
    fontFamily: fontFamily.bodyExtraBold,
  })
})

// The "left" figure is the one that visibly moves: it opens on the
// pre-expense balance and counts down to the post-expense one once the
// delta lands on the bar, so the charge just made reads as an event rather
// than a bar that was simply short to begin with.
it('counts the left figure down from its pre-expense value once the delta lands', async () => {
  const { getByLabelText } = setup()
  // 8000 assigned - 0 already spent - 450 not yet subtracted = 8000 pre-expense.
  await waitFor(() => expect(getByLabelText('₹8,000')).toBeTruthy())
  // 8000 - 450 = 7550 once the countdown fires.
  await waitFor(() => expect(getByLabelText('₹7,550')).toBeTruthy(), COUNTDOWN_SLOW)
})

// The expenses refetch the mutation triggered may not have landed yet. Both
// branches have to produce the same number, or the envelope balance visibly
// ticks down mid-animation — or worse, double-counts the new expense.
it('charges the envelope by hand while the new expense is missing from the cache', async () => {
  const { getByLabelText } = setup({}, [{ date: TODAY, amount_inr: '1200', category: '🛒 Groceries', timestamp: 'other' }])
  // 8000 assigned - 1200 already spent - 450 not yet in the list = 6350
  await waitFor(() => expect(getByLabelText('₹6,350')).toBeTruthy(), COUNTDOWN_SLOW)
})

it('does not double-charge once the new expense is in the cache', async () => {
  const { getByLabelText } = setup({}, [
    { date: TODAY, amount_inr: '1200', category: '🛒 Groceries', timestamp: 'other' },
    { date: TODAY, amount_inr: '450', category: '🛒 Groceries', timestamp: BASE_PARAMS.timestamp },
  ])
  await waitFor(() => expect(getByLabelText('₹6,350')).toBeTruthy(), COUNTDOWN_SLOW)
})

it('omits the envelope line for a category with no money assigned this month', async () => {
  const { queryByText } = setup({}, [], [])
  await waitFor(() => expect(getGroups).toHaveBeenCalled())
  expect(queryByText(/left of/)).toBeNull()
})

// Logging an expense against a past month doesn't move this month's
// envelope, so the progress card (which only ever reads the current month's
// state) would show a misleading bump if it rendered here at all.
it('omits the envelope card for an expense logged in a past month', async () => {
  const PAST = `${prevMonthKey(MONTH)}-15`
  const { queryByText } = setup({ date: PAST, timestamp: `${PAST}T01:24:00` })
  await waitFor(() => expect(getGroups).toHaveBeenCalled())
  expect(queryByText(/left of/)).toBeNull()
  expect(queryByText(/% used/)).toBeNull()
})

// The POST is the only source of a timestamp on newer servers; older ones return
// none, and the stamp line went blank rather than falling back.
it('falls back to the navigation time when the server returned no timestamp', async () => {
  const { getByText } = setup({ timestamp: '', loggedAt: `${TODAY}T09:05:00` } as never)
  expect(getByText(`15 ${MONTH_LABEL} '${YEAR2}, 9:05 am`)).toBeTruthy()
  await waitFor(() => expect(getGroups).toHaveBeenCalled())
})

it('deletes by id and reopens a prefilled entry screen on undo', async () => {
  ;(deleteExpense as jest.Mock).mockResolvedValue(undefined)
  const { getByText } = setup()
  fireEvent.press(getByText('Undo'))
  await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith('abc123', BASE_PARAMS.timestamp, 'Milk', 450, 0))
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/modals/log-expense',
      params: { item: 'Milk', amountInr: '450', category: '🛒 Groceries', date: TODAY, notes: '', paymentMethod: 'bank' },
    }),
  )
})

it('deletes the committed row when an offline expense syncs while its success screen stays open', async () => {
  const payload = {
    client_id: 'offline-undo', item: 'Milk', amount_inr: '450',
    category: BASE_PARAMS.category, date: TODAY, timestamp: BASE_PARAMS.timestamp,
  }
  await pendingExpenses.enqueue(payload)
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'synced-row', version: 7, timestamp: payload.timestamp })
  ;(deleteExpense as jest.Mock).mockResolvedValue(undefined)
  const { getByText } = setup({ id: '', pending: '1', clientId: payload.client_id } as never)
  await act(async () => { await flush() })
  expect(await pendingExpenses.list()).toEqual([])

  fireEvent.press(getByText('Undo'))

  await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith('synced-row', payload.timestamp, 'Milk', 450, 7, 1))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/modals/log-expense' })))
})

it('cancels an unsent expense locally and reopens the draft', async () => {
  await pendingExpenses.enqueue({
    client_id: 'unsent', item: 'Milk', amount_inr: '450', category: BASE_PARAMS.category,
    date: TODAY, timestamp: BASE_PARAMS.timestamp,
  })
  const { getByText } = setup({ id: '', pending: '1', clientId: 'unsent' } as never)
  fireEvent.press(getByText('Undo'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/modals/log-expense' })))
  expect(await pendingExpenses.list()).toEqual([])
  expect(deleteExpense).not.toHaveBeenCalled()
  expect(postExpensePayload).not.toHaveBeenCalled()
})

it('shows a failed synced Undo without reopening the form and allows retry', async () => {
  await pendingExpenses.enqueue({
    client_id: 'retry-undo', item: 'Milk', amount_inr: '450', category: BASE_PARAMS.category,
    date: TODAY, timestamp: BASE_PARAMS.timestamp,
  })
  jest.mocked(postExpensePayload).mockResolvedValue({ id: 'saved', version: 7, timestamp: BASE_PARAMS.timestamp })
  await flush()
  jest.mocked(deleteExpense).mockRejectedValueOnce(new Error('Could not delete. Check your connection.'))
  const { getByText, findByText } = setup({ id: '', pending: '1', clientId: 'retry-undo' } as never)
  fireEvent.press(getByText('Undo'))
  await findByText('Could not delete. Check your connection.')
  expect(mockReplace).not.toHaveBeenCalled()
  jest.mocked(deleteExpense).mockResolvedValue(undefined)
  fireEvent.press(getByText('Undo'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1))
  expect(postExpensePayload).toHaveBeenCalledTimes(1)
})

it('prevents repeated Undo and Done while deletion is pending, and does not navigate after unmount', async () => {
  await pendingExpenses.enqueue({
    client_id: 'slow-undo', item: 'Milk', amount_inr: '450', category: BASE_PARAMS.category,
    date: TODAY, timestamp: BASE_PARAMS.timestamp,
  })
  jest.mocked(postExpensePayload).mockResolvedValue({ id: 'saved', version: 7, timestamp: BASE_PARAMS.timestamp })
  await flush()
  let finish!: () => void
  jest.mocked(deleteExpense).mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { getByText, unmount } = setup({ id: '', pending: '1', clientId: 'slow-undo' } as never)
  const undoButton = getByText('Undo')
  act(() => {
    fireEvent.press(undoButton)
    fireEvent.press(undoButton)
  })
  await waitFor(() => expect(getByText('Undoing…')).toBeTruthy())
  fireEvent.press(getByText('Done'))
  await waitFor(() => expect(deleteExpense).toHaveBeenCalledTimes(1))
  expect(mockReplace).not.toHaveBeenCalled()
  unmount()
  await act(async () => { finish() })
  await waitFor(async () => expect(await pendingExpenses.syncReceipt('slow-undo', 'undo-user')).toHaveProperty('undone', true))
  expect(mockReplace).not.toHaveBeenCalled()
})

// Without an id the only way to address the row is a timestamp/item/amount
// triple, which can match a different expense. No Undo beats a wrong delete.
it('hides undo when the server did not return an id', async () => {
  const { queryByText } = setup({ id: '' })
  await waitFor(() => expect(getGroups).toHaveBeenCalled())
  expect(queryByText('Undo')).toBeNull()
})

describe('we noticed', () => {
  const milk = (id: string, date: string) => ({ id, date, item: 'Milk', timestamp: `${date}T09:00:00`, amount_inr: '50', category: '🛒 Groceries', source: 'manual' })

  it('says so from the third time this week', async () => {
    const earlier = `${MONTH}-${String(Number(TODAY.slice(8)) - 2).padStart(2, '0')}`
    const { findByText } = setup({}, [milk('e1', earlier), milk('e2', TODAY)])
    expect(await findByText('One of your regulars this week')).toBeTruthy()
  })

  it('stays quiet the second time', async () => {
    const { findByText, queryByText } = setup({}, [milk('e0', TODAY)])
    await findByText('Milk')
    expect(queryByText(/regulars/)).toBeNull()
  })
})

describe('review prompt', () => {
  it('counts the add and may ask for a review on Done', async () => {
    const { getByText } = setup()
    expect(recordLogAndMaybeAsk).not.toHaveBeenCalled()
    fireEvent.press(getByText('Done'))
    expect(recordLogAndMaybeAsk).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
    await waitFor(() => expect(getGroups).toHaveBeenCalled())
  })

  it("doesn't ask after an offline add", async () => {
    const { getByText } = setup({ pending: '1', clientId: 'c1' } as never)
    fireEvent.press(getByText('Done'))
    expect(recordLogAndMaybeAsk).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
    await waitFor(() => expect(getGroups).toHaveBeenCalled())
  })

  it("doesn't ask while an Undo is deleting the expense", async () => {
    ;(deleteExpense as jest.Mock).mockReturnValue(new Promise(() => {}))
    const { getByText } = setup()
    fireEvent.press(getByText('Undo'))
    await waitFor(() => expect(getByText('Undoing…')).toBeTruthy())
    fireEvent.press(getByText('Done'))
    expect(recordLogAndMaybeAsk).not.toHaveBeenCalled()
  })
})
