import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import IncomeScreen from './income'
import { getIncomes, getRecurringIncomes, deleteIncome } from '@/src/api/incomes'
import { getAccounts } from '@/src/api/accounts'
import { currentMonthKey } from '@/src/lib/envelope'
import type { IncomeRow, RecurringIncomeRow } from '@/src/types'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))
jest.mock('@/src/lib/netStatus', () => ({ ...jest.requireActual('@/src/lib/netStatus'), useOnline: () => true }))
jest.mock('@/src/api/incomes', () => ({
  ...jest.requireActual('@/src/api/incomes'),
  getIncomes: jest.fn(),
  getRecurringIncomes: jest.fn(),
  deleteIncome: jest.fn(),
}))
jest.mock('@/src/api/accounts', () => ({ ...jest.requireActual('@/src/api/accounts'), getAccounts: jest.fn() }))
jest.mock('@/src/api/budgets', () => ({ getBudgets: jest.fn(async () => []) }))

const month = currentMonthKey()
const schedule = (over: Partial<RecurringIncomeRow> = {}): RecurringIncomeRow => ({
  id: 'r1', label: 'Salary', amount: '50000', frequency: 'monthly', start_date: `${month}-01`, end_date: '', next_run_date: '2099-01-01', account_id: 'a1', status: 'active', created_at: '', ...over,
})
const income = (over: Partial<IncomeRow> = {}): IncomeRow => ({
  id: 'i1', version: 2, date: `${month}-02`, amount: '1500', label: 'Freelance', notes: '', account_id: '', recurring_id: '', source: 'manual', counted: 'extra', created_at: '', ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', name: 'HDFC', type: 'bank', archived: false, created_at: '' }])
  ;(getIncomes as jest.Mock).mockResolvedValue([])
  ;(getRecurringIncomes as jest.Mock).mockResolvedValue([])
})

it('shows what comes in on repeat and what was recorded this month', async () => {
  ;(getRecurringIncomes as jest.Mock).mockResolvedValue([schedule()])
  ;(getIncomes as jest.Mock).mockResolvedValue([income()])
  const { findByText, getByText } = renderWithProviders(<IncomeScreen />)
  expect(await findByText('Salary')).toBeTruthy()
  expect(getByText('Every month')).toBeTruthy()
  await findByText('· HDFC')
  expect(getByText('Freelance')).toBeTruthy()
  expect(getByText(/Added by you/)).toBeTruthy()
})

it('opens a schedule to edit it', async () => {
  ;(getRecurringIncomes as jest.Mock).mockResolvedValue([schedule()])
  const { findByLabelText } = renderWithProviders(<IncomeScreen />)
  fireEvent.press(await findByLabelText('Edit Salary'))
  expect(mockPush).toHaveBeenCalledWith('/modals/recurring-income?id=r1')
})

it('deletes a recorded income after a confirm, with its version', async () => {
  ;(getIncomes as jest.Mock).mockResolvedValue([income()])
  ;(deleteIncome as jest.Mock).mockResolvedValue(undefined)
  const { findByLabelText, getAllByText, getByText } = renderWithProviders(<IncomeScreen />)
  fireEvent.press(await findByLabelText('Delete Freelance'))
  expect(getByText(/comes back out of Ready to Assign/)).toBeTruthy()
  const buttons = getAllByText('Delete')
  await act(async () => {
    fireEvent.press(buttons[buttons.length - 1])
  })
  await waitFor(() => expect(deleteIncome).toHaveBeenCalledWith('i1', 2))
})

it('invites a first income when there is none', async () => {
  const { findByText } = renderWithProviders(<IncomeScreen />)
  expect(await findByText('What comes in?')).toBeTruthy()
})
