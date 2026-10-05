import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getExpenses } from '@/src/api/expenses'
import { getBudgets, updateBudget } from '@/src/api/budgets'
import { getCategories } from '@/src/api/categories'
import { getGroups } from '@/src/api/groups'
import EditAssignedAmountModal from './edit-assigned-amount'
import { currentMonthKey, prevMonthKey } from '@/src/lib/envelope'
import { BudgetWriteError } from '@/src/lib/budgetConflict'
import * as Haptics from 'expo-haptics'

jest.mock('@/src/api/expenses', () => ({ getExpenses: jest.fn() }))
jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(),
  addBudget: jest.fn(),
  updateBudget: jest.fn(),
  deleteBudget: jest.fn(),
  transferBudget: jest.fn(),
}))
jest.mock('@/src/api/categories', () => ({ getCategories: jest.fn() }))
jest.mock('@/src/api/groups', () => ({ getGroups: jest.fn() }))

const mockBack = jest.fn()
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

const MONTH = currentMonthKey()
const PREV_MONTH = prevMonthKey(MONTH)

function setup(budgets: object[]) {
  mockParams = { category: 'Food' }
  ;(getExpenses as jest.Mock).mockResolvedValue([])
  ;(getBudgets as jest.Mock).mockResolvedValue(budgets)
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Food', group: 'Everyday' }])
  ;(getGroups as jest.Mock).mockResolvedValue(['Everyday'])
  return renderWithProviders(<EditAssignedAmountModal />)
}

async function enterAmount(getByLabelText: (t: string) => any, amount: string) {
  for (const digit of amount) {
    fireEvent.press(getByLabelText(digit))
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('prefills with this month\'s assigned amount and saves an edit', async () => {
  ;(updateBudget as jest.Mock).mockResolvedValue({})
  const { getByLabelText, getByText } = setup([
    { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0', version: 2 },
    { month: MONTH, category: 'Food', assigned: '5000', rolled_over: '0', version: 7 },
  ])

  await waitFor(() => expect(getByLabelText('₹5,000')).toBeTruthy())

  fireEvent.press(getByLabelText('Delete'))
  fireEvent.press(getByLabelText('Delete'))
  fireEvent.press(getByLabelText('Delete'))
  fireEvent.press(getByLabelText('Delete'))
  await enterAmount(getByLabelText, '8000')
  expect(getByLabelText('₹8,000')).toBeTruthy()

  await act(async () => {
    fireEvent.press(getByText('Save'))
  })

  await waitFor(() =>
    expect(updateBudget).toHaveBeenCalledWith(MONTH, 'Food', { assigned: '8000' }, 7),
  )
})

it('shows a "Last month" chip only when a different prior amount exists', async () => {
  const { getByText, queryByText } = setup([
    { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0', version: 2 },
    { month: MONTH, category: 'Food', assigned: '5000', rolled_over: '0', version: 7 },
    { month: PREV_MONTH, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month: PREV_MONTH, category: 'Food', assigned: '3000', rolled_over: '0', version: 1 },
  ])

  await waitFor(() => expect(getByText('Last month · ₹3,000')).toBeTruthy())
  expect(queryByText('Last month · ₹5,000')).toBeNull()
})

it('closes ~1100ms after a successful save', async () => {
  jest.useFakeTimers()
  ;(updateBudget as jest.Mock).mockResolvedValue({})
  const { getByLabelText, getByText } = setup([
    { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0', version: 2 },
    { month: MONTH, category: 'Food', assigned: '5000', rolled_over: '0', version: 7 },
  ])

  await waitFor(() => expect(getByLabelText('₹5,000')).toBeTruthy())

  await act(async () => {
    fireEvent.press(getByText('Save'))
  })
  expect(mockBack).not.toHaveBeenCalled()

  await act(async () => {
    jest.advanceTimersByTime(1100)
  })
  expect(mockBack).toHaveBeenCalled()

  jest.useRealTimers()
})

it('shows the shared full-screen conflict review, preserves the draft, and requires another save', async () => {
  ;(updateBudget as jest.Mock)
    .mockRejectedValueOnce(new BudgetWriteError(409, 'changed', {
      month: MONTH, category: 'Food', assigned: '6000', rolled_over: '0', version: 8,
    }))
    .mockResolvedValueOnce({})
  const { getByLabelText, getByRole, getByTestId, getByText } = setup([
    { month: MONTH, category: '__income__', assigned: '20000', rolled_over: '0', version: 2 },
    { month: MONTH, category: 'Food', assigned: '5000', rolled_over: '0', version: 7 },
  ])
  await waitFor(() => expect(getByLabelText('₹5,000')).toBeTruthy())
  for (let i = 0; i < 4; i++) fireEvent.press(getByLabelText('Delete'))
  await enterAmount(getByLabelText, '8000')

  await act(async () => { fireEvent.press(getByText('Save')) })
  await waitFor(() => expect(getByText('This assignment was updated')).toBeTruthy())
  expect(getByLabelText('Assigned amount, latest saved: ₹6,000')).toBeTruthy()
  expect(getByLabelText('Assigned amount, with your changes: ₹8,000')).toBeTruthy()
  expect(getByTestId('budget-conflict-scroll')).toBeTruthy()
  fireEvent.press(getByRole('button', { name: 'Continue with my changes' }))
  expect(getByLabelText('₹8,000')).toBeTruthy()
  expect(updateBudget).toHaveBeenCalledTimes(1)
  await act(async () => { fireEvent.press(getByText('Save')) })
  await waitFor(() => expect(updateBudget).toHaveBeenLastCalledWith(MONTH, 'Food', { assigned: '8000' }, 8))
})

it('gives selection haptics when a quick pick is tapped', async () => {
  const selection = jest.spyOn(Haptics, 'selectionAsync').mockResolvedValue()
  const { getByText, getByLabelText } = setup([
    { month: MONTH, category: 'Food', assigned: '0', rolled_over: '0', version: 1 },
  ])
  await waitFor(() => expect(getByText('₹2,500')).toBeTruthy())
  fireEvent.press(getByText('₹2,500'))
  expect(selection).toHaveBeenCalledTimes(1)
  expect(getByLabelText('₹2,500')).toBeTruthy()
})
