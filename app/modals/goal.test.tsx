import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getCategories, updateCategory } from '@/src/api/categories'
import { getBudgets } from '@/src/api/budgets'
import GoalModal from './goal'
import { currentMonthKey, shiftMonthKey } from '@/src/lib/envelope'
import { shortMonth } from '@/src/lib/goal'

jest.mock('@/src/api/categories', () => ({ getCategories: jest.fn(), updateCategory: jest.fn() }))
jest.mock('@/src/api/expenses', () => ({ getRecentExpenses: jest.fn(() => Promise.resolve({ rows: [], lastSpent: {} })) }))
jest.mock('@/src/api/groups', () => ({ getGroups: jest.fn(() => Promise.resolve(['Fun'])) }))
jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(),
  getCarry: jest.fn(() => Promise.resolve({ ready_to_assign: 0, rolled_over: {} })),
}))
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({ category: 'Trip' }),
}))

const MONTH = currentMonthKey()

// Trip has 1,500 in it this month, all assigned now.
beforeEach(() => {
  jest.clearAllMocks()
  ;(getBudgets as jest.Mock).mockResolvedValue([{ month: MONTH, category: 'Trip', assigned: '1500', rolled_over: '0', version: 1 }])
})

it('types the target on the numpad and saves it with its month', async () => {
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Trip', group: 'Fun' }])
  ;(updateCategory as jest.Mock).mockResolvedValue(undefined)
  const { getByText, getByLabelText, queryByText } = renderWithProviders(<GoalModal />)
  await waitFor(() => expect(getByText('Make Trip a goal')).toBeTruthy())
  // Nothing to save until there's a target, and no way back to spending for a category that isn't a goal.
  expect(getByText('Add a target')).toBeTruthy()
  expect(queryByText('Back to spending')).toBeNull()
  expect(getByText('₹1,500 saved so far')).toBeTruthy()
  expect(getByText('Type a target to get started')).toBeTruthy()
  for (const d of ['5', '0', '0', '0']) fireEvent.press(getByLabelText(d))
  // The month opens on two wheels, starting at this month. A turn of the month wheel is next month.
  fireEvent.press(getByLabelText('Pick a month'))
  fireEvent(getByLabelText('Month'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
  fireEvent.press(getByText('Done'))
  // The row's own math: 5,000 over this month and next, from nothing before this month's 1,500.
  expect(getByText(`₹2,500/mo gets you there by ${shortMonth(shiftMonthKey(MONTH, 1))}`)).toBeTruthy()
  await act(async () => { fireEvent.press(getByText('Save goal')) })
  expect(updateCategory).toHaveBeenCalledWith('Trip', { goal: { amount: 5000, by: shiftMonthKey(MONTH, 1) } })
})

it('starts from the saved goal, and Back to spending clears it', async () => {
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Trip', group: 'Fun', goal: { amount: 1200 } }])
  ;(updateCategory as jest.Mock).mockResolvedValue(undefined)
  const { getByText, getByLabelText } = renderWithProviders(<GoalModal />)
  await waitFor(() => expect(getByText('Goal for Trip')).toBeTruthy())
  expect(getByLabelText('₹1,200')).toBeTruthy()
  await act(async () => { fireEvent.press(getByText('Back to spending')) })
  expect(updateCategory).toHaveBeenCalledWith('Trip', { goal: null })
})

it("springs a month that's over back to this one", async () => {
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Trip', group: 'Fun' }])
  ;(updateCategory as jest.Mock).mockResolvedValue(undefined)
  const { getByText, getByLabelText } = renderWithProviders(<GoalModal />)
  await waitFor(() => expect(getByText('Make Trip a goal')).toBeTruthy())
  fireEvent.press(getByLabelText('1'))
  fireEvent.press(getByLabelText('Pick a month'))
  fireEvent(getByLabelText('Month'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
  fireEvent.press(getByText('Done'))
  await act(async () => { fireEvent.press(getByText('Save goal')) })
  expect(updateCategory).toHaveBeenCalledWith('Trip', { goal: { amount: 1, by: MONTH } })
})
