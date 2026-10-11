import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getBudgets, updateBudget } from '@/src/api/budgets'
import { addIncome } from '@/src/api/incomes'
import { getAccounts } from '@/src/api/accounts'
import AddIncomeModal from './add-income'
import { currentMonthKey } from '@/src/lib/envelope'

jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(),
  addBudget: jest.fn(),
  updateBudget: jest.fn(),
  deleteBudget: jest.fn(),
  transferBudget: jest.fn(),
}))
jest.mock('@/src/api/incomes', () => ({ ...jest.requireActual('@/src/api/incomes'), addIncome: jest.fn() }))
jest.mock('@/src/api/accounts', () => ({ ...jest.requireActual('@/src/api/accounts'), getAccounts: jest.fn() }))

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const MONTH = currentMonthKey()

beforeEach(() => {
  jest.clearAllMocks()
  ;(addIncome as jest.Mock).mockResolvedValue({ id: 'i1' })
  ;(getAccounts as jest.Mock).mockResolvedValue([])
  ;(getBudgets as jest.Mock).mockResolvedValue([
    { month: MONTH, category: '__income__', assigned: '100000', rolled_over: '0', extra: '500', version: 3 },
  ])
})

function typeAmount(getByLabelText: (t: string) => any, amount: string) {
  for (const digit of amount) fireEvent.press(getByLabelText(digit))
}

it('records a one-off in the ledger, which moves Ready to Assign server-side', async () => {
  const { getByLabelText, getByText } = renderWithProviders(<AddIncomeModal />)
  await waitFor(() => expect(getByText('₹1,00,000 monthly · ₹500 extra')).toBeTruthy())
  typeAmount(getByLabelText, '10000')
  fireEvent.changeText(getByLabelText('What was it'), 'Diwali bonus')
  await act(async () => {
    fireEvent.press(getByText('Add'))
  })
  expect(addIncome).toHaveBeenCalledWith(expect.objectContaining({ amount: 10000, label: 'Diwali bonus', client_id: expect.any(String) }))
  expect(updateBudget).not.toHaveBeenCalled()
})

it('names an unnamed one-off and puts it on the picked account', async () => {
  ;(getAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', name: 'HDFC', type: 'bank', archived: false, created_at: '' }])
  const { getByLabelText, getByText, findByLabelText } = renderWithProviders(<AddIncomeModal />)
  fireEvent.press(await findByLabelText('🏦 HDFC'))
  typeAmount(getByLabelText, '500')
  await act(async () => {
    fireEvent.press(getByText('Add'))
  })
  expect(addIncome).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, label: 'Extra income', account_id: 'a1' }))
})

it('keeps the screen open with a written error when saving fails', async () => {
  ;(addIncome as jest.Mock).mockRejectedValueOnce(new Error('503'))
  const { getByLabelText, getByText, findByText } = renderWithProviders(<AddIncomeModal />)
  await waitFor(() => expect(getBudgets).toHaveBeenCalled())
  typeAmount(getByLabelText, '500')
  await act(async () => {
    fireEvent.press(getByText('Add'))
  })
  expect(await findByText("Couldn't save. Check your connection and try again.")).toBeTruthy()
  expect(mockBack).not.toHaveBeenCalled()
})
