import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getBudgets, updateBudget } from '@/src/api/budgets'
import { getCategories } from '@/src/api/categories'
import AddIncomeModal from './add-income'
import { BudgetWriteError } from '@/src/lib/budgetConflict'
import { currentMonthKey } from '@/src/lib/envelope'

jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(),
  addBudget: jest.fn(),
  updateBudget: jest.fn(),
  deleteBudget: jest.fn(),
  transferBudget: jest.fn(),
}))
jest.mock('@/src/api/categories', () => ({ getCategories: jest.fn() }))

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

beforeEach(() => {
  jest.clearAllMocks()
  ;(updateBudget as jest.Mock).mockResolvedValue({})
  ;(getCategories as jest.Mock).mockResolvedValue([])
})

function typeAmount(getByLabelText: (t: string) => any, amount: string) {
  for (const digit of amount) fireEvent.press(getByLabelText(digit))
}

const MONTH = currentMonthKey()

it('adds on top of this month\'s existing extra', async () => {
  ;(getBudgets as jest.Mock).mockResolvedValue([
    { month: MONTH, category: '__income__', assigned: '100000', rolled_over: '0', extra: '500', version: 3 },
  ])
  const { getByLabelText, getByText } = renderWithProviders(<AddIncomeModal />)
  await waitFor(() => expect(getByText('₹1,00,000 monthly · ₹500 extra')).toBeTruthy())
  typeAmount(getByLabelText, '10000')
  await act(async () => {
    fireEvent.press(getByText('Add'))
  })
  expect(updateBudget).toHaveBeenCalledWith(MONTH, '__income__', { extra: '10500' }, 3)
})

it('adds on top of the row another device saved first', async () => {
  ;(getBudgets as jest.Mock).mockResolvedValue([])
  ;(updateBudget as jest.Mock).mockRejectedValueOnce(new BudgetWriteError(409, 'changed', {
    month: MONTH, category: '__income__', assigned: '100000', rolled_over: '0', extra: '2000', version: 4,
  }))
  const { getByLabelText, getByText } = renderWithProviders(<AddIncomeModal />)
  await waitFor(() => expect(getBudgets).toHaveBeenCalled())
  typeAmount(getByLabelText, '1000')
  await act(async () => {
    fireEvent.press(getByText('Add'))
  })
  await waitFor(() => expect(updateBudget).toHaveBeenLastCalledWith(MONTH, '__income__', { extra: '3000' }, 4))
})

it('previews Ready to Assign plus the typed amount, not income plus it', async () => {
  ;(getBudgets as jest.Mock).mockResolvedValue([
    { month: MONTH, category: '__income__', assigned: '50000', rolled_over: '0', extra: '0', version: 1 },
    { month: MONTH, category: 'Food', assigned: '40000', rolled_over: '0', extra: '0', version: 1 },
  ])
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Food', group: 'Everyday' }])
  const { getByLabelText, findByText } = renderWithProviders(<AddIncomeModal />)
  await findByText('₹50,000 monthly')
  typeAmount(getByLabelText, '5000')
  expect(await findByText('Ready to Assign ₹15,000 · this month only')).toBeTruthy()
})

it('holds the Ready to Assign preview until categories load', async () => {
  ;(getBudgets as jest.Mock).mockResolvedValue([
    { month: MONTH, category: '__income__', assigned: '50000', rolled_over: '0', extra: '0', version: 1 },
    { month: MONTH, category: 'Food', assigned: '40000', rolled_over: '0', extra: '0', version: 1 },
  ])
  ;(getCategories as jest.Mock).mockReturnValue(new Promise(() => {}))
  const { getByLabelText, findByText, queryByText } = renderWithProviders(<AddIncomeModal />)
  await findByText('₹50,000 monthly')
  typeAmount(getByLabelText, '5000')
  expect(queryByText(/Ready to Assign/)).toBeNull()
})
