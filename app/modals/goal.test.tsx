import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getCategories, updateCategory } from '@/src/api/categories'
import GoalModal from './goal'
import { currentMonthKey, shiftMonthKey } from '@/src/lib/envelope'

jest.mock('@/src/api/categories', () => ({ getCategories: jest.fn(), updateCategory: jest.fn() }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({ category: 'Trip' }),
}))

const MONTH = currentMonthKey()

beforeEach(() => jest.clearAllMocks())

it('types the target on the numpad and saves it with its month', async () => {
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Trip', group: 'Fun' }])
  ;(updateCategory as jest.Mock).mockResolvedValue(undefined)
  const { getByText, getByLabelText, queryByText } = renderWithProviders(<GoalModal />)
  await waitFor(() => expect(getByText('Make Trip a goal')).toBeTruthy())
  // Nothing to save until there's a target, and no way back to spending for a category that isn't a goal.
  expect(getByText('Add a target')).toBeTruthy()
  expect(queryByText('Back to spending')).toBeNull()
  for (const d of ['5', '0', '0', '0']) fireEvent.press(getByLabelText(d))
  // The month opens on two wheels, starting at this month. A turn of the month wheel is next month.
  fireEvent.press(getByLabelText('Pick a month'))
  fireEvent(getByLabelText('Month'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
  fireEvent.press(getByText('Done'))
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
