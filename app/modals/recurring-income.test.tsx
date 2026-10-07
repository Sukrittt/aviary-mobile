import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import RecurringIncomeModal from './recurring-income'
import { addRecurringIncome, getRecurringIncomes, updateRecurringIncome } from '@/src/api/incomes'
import { getAccounts } from '@/src/api/accounts'

jest.mock('@/src/api/incomes', () => ({
  ...jest.requireActual('@/src/api/incomes'),
  getRecurringIncomes: jest.fn(),
  getIncomes: jest.fn(async () => []),
  addRecurringIncome: jest.fn(),
  updateRecurringIncome: jest.fn(),
  deleteRecurringIncome: jest.fn(),
}))
jest.mock('@/src/api/accounts', () => ({ ...jest.requireActual('@/src/api/accounts'), getAccounts: jest.fn() }))
jest.mock('@/src/api/budgets', () => ({ getBudgets: jest.fn(async () => []) }))
jest.mock('@/src/lib/netStatus', () => ({ ...jest.requireActual('@/src/lib/netStatus'), useOnline: () => true, isOnline: () => true }))

let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  ;(getRecurringIncomes as jest.Mock).mockResolvedValue([])
  ;(getAccounts as jest.Mock).mockResolvedValue([])
  ;(addRecurringIncome as jest.Mock).mockResolvedValue(undefined)
  ;(updateRecurringIncome as jest.Mock).mockResolvedValue(undefined)
})

it('adds a weekly income, saying it lands on each payday', async () => {
  const { getByPlaceholderText, getByLabelText, getByText } = renderWithProviders(<RecurringIncomeModal />)
  fireEvent.changeText(getByPlaceholderText('e.g. Salary'), 'Tutoring')
  fireEvent.changeText(getByLabelText('Amount'), '1500')
  fireEvent.press(getByText('weekly'))
  expect(getByText('Lands in Ready to Assign on every payday.')).toBeTruthy()
  await act(async () => {
    fireEvent.press(getByText('Add income'))
  })
  expect(addRecurringIncome).toHaveBeenCalledWith(expect.objectContaining({ label: 'Tutoring', amount: '1500', frequency: 'weekly', account_id: '' }))
})

it("prefills Home's Change income as a monthly income counted from the 1st", () => {
  mockParams = { label: 'Monthly income', amount: '40000', frequency: 'monthly' }
  const { getByDisplayValue, getByText } = renderWithProviders(<RecurringIncomeModal />)
  expect(getByDisplayValue('Monthly income')).toBeTruthy()
  expect(getByDisplayValue('40000')).toBeTruthy()
  expect(getByText(/from the 1st of every month/)).toBeTruthy()
})

it('edits an existing schedule and its account', async () => {
  mockParams = { id: 'r1' }
  ;(getAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', name: 'HDFC', type: 'bank', archived: false, created_at: '' }])
  ;(getRecurringIncomes as jest.Mock).mockResolvedValue([
    { id: 'r1', label: 'Salary', amount: '50000', frequency: 'monthly', start_date: '2026-10-01', end_date: '', next_run_date: '2026-11-01', account_id: '', status: 'active', created_at: '' },
  ])
  const { findByDisplayValue, findByLabelText, getByText, getByLabelText } = renderWithProviders(<RecurringIncomeModal />)
  await findByDisplayValue('Salary')
  fireEvent.press(await findByLabelText('🏦 HDFC'))
  fireEvent.changeText(getByLabelText('Amount'), '55000')
  await act(async () => {
    fireEvent.press(getByText('Save changes'))
  })
  await waitFor(() => expect(updateRecurringIncome).toHaveBeenCalledWith('r1', expect.objectContaining({ amount: '55000', account_id: 'a1' })))
})
