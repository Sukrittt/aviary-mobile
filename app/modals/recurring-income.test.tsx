import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import RecurringIncomeModal from './recurring-income'
import { addRecurringIncome, getRecurringIncomes, updateRecurringIncome } from '@/src/api/incomes'
import { getAccounts } from '@/src/api/accounts'
import { currentMonthKey } from '@/src/lib/envelope'
import { startingBalanceHref } from '@/src/lib/upcomingPay'

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
const mockBack = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: mockReplace, navigate: jest.fn() }),
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
  expect(addRecurringIncome).toHaveBeenCalledWith(expect.objectContaining({ label: 'Tutoring', amount: '1500', frequency: 'weekly' }))
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

it("leaves an archived account alone when editing something else", async () => {
  mockParams = { id: 'r1' }
  ;(getRecurringIncomes as jest.Mock).mockResolvedValue([
    { id: 'r1', label: 'Salary', amount: '50000', frequency: 'monthly', start_date: '2026-10-01', end_date: '', next_run_date: '2026-11-01', account_id: 'gone', status: 'active', created_at: '' },
  ])
  const { findByDisplayValue, getByText, getByLabelText } = renderWithProviders(<RecurringIncomeModal />)
  await findByDisplayValue('Salary')
  fireEvent.changeText(getByLabelText('Amount'), '52000')
  await act(async () => {
    fireEvent.press(getByText('Save changes'))
  })
  await waitFor(() => expect(updateRecurringIncome).toHaveBeenCalled())
  expect((updateRecurringIncome as jest.Mock).mock.calls[0][1]).not.toHaveProperty('account_id')
})

describe('a first payday next month', () => {
  const [y, m] = currentMonthKey().split('-').map(Number)
  const payday = m === 12 ? `${y + 1}-01-04` : `${y}-${String(m + 1).padStart(2, '0')}-04`
  const schedule = (status: string) => ({ id: 'r1', label: 'Salary', amount: '50000', frequency: 'monthly', start_date: payday, end_date: '', next_run_date: payday, account_id: '', status, created_at: '' })

  async function save() {
    const utils = renderWithProviders(<RecurringIncomeModal />)
    await utils.findByDisplayValue('Salary')
    await act(async () => {
      fireEvent.press(utils.getByText('Save changes'))
    })
    await waitFor(() => expect(mockBack.mock.calls.length + mockReplace.mock.calls.length).toBe(1), { timeout: 3000 })
  }

  it('goes on to a starting balance when nothing counts this month', async () => {
    mockParams = { id: 'r1' }
    ;(getRecurringIncomes as jest.Mock).mockResolvedValue([schedule('active')])
    await save()
    expect(mockReplace).toHaveBeenCalledWith(startingBalanceHref(payday))
  })

  it('just closes for a paused one, which counts in no month', async () => {
    mockParams = { id: 'r1' }
    ;(getRecurringIncomes as jest.Mock).mockResolvedValue([schedule('paused')])
    await save()
    expect(mockBack).toHaveBeenCalled()
  })
})

it('keeps the end date behind a switch, and clears it when switched off', async () => {
  mockParams = { id: 'r1' }
  ;(getRecurringIncomes as jest.Mock).mockResolvedValue([
    { id: 'r1', label: 'Contract', amount: '30000', frequency: 'monthly', start_date: '2026-10-01', end_date: '2027-03-31', next_run_date: '2026-11-01', account_id: '', status: 'active', created_at: '' },
  ])
  const { findByDisplayValue, getByLabelText, getByText, queryByText } = renderWithProviders(<RecurringIncomeModal />)
  await findByDisplayValue('Contract')
  expect(getByText('Ends')).toBeTruthy()

  fireEvent.press(getByLabelText('Has an end date'))
  expect(queryByText('Ends')).toBeNull()
  await act(async () => {
    fireEvent.press(getByText('Save changes'))
  })
  await waitFor(() => expect(updateRecurringIncome).toHaveBeenCalledWith('r1', expect.objectContaining({ end_date: '' })))
})

it('hides the end date on a new income', () => {
  const { queryByText, getByLabelText } = renderWithProviders(<RecurringIncomeModal />)
  expect(queryByText('Ends')).toBeNull()
  fireEvent.press(getByLabelText('Has an end date'))
  expect(queryByText('Ends')).toBeTruthy()
})
