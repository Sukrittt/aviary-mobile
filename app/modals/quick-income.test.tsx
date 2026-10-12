import { act, fireEvent, waitFor } from '@testing-library/react-native'
import * as Reanimated from 'react-native-reanimated'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getBudgets } from '@/src/api/budgets'
import { addIncome, getIncomes } from '@/src/api/incomes'
import { getAccounts } from '@/src/api/accounts'
import { getCategories } from '@/src/api/categories'
import { currentMonthKey } from '@/src/lib/envelope'
import QuickIncomeModal from './quick-income'

jest.mock('@/src/api/budgets', () => ({ getBudgets: jest.fn(), updateBudget: jest.fn() }))
jest.mock('@/src/api/incomes', () => ({ ...jest.requireActual('@/src/api/incomes'), addIncome: jest.fn(), getIncomes: jest.fn() }))
jest.mock('@/src/api/accounts', () => ({ ...jest.requireActual('@/src/api/accounts'), getAccounts: jest.fn() }))
jest.mock('@/src/api/categories', () => ({ getCategories: jest.fn() }))
let mockBeforeRemove: ((e: unknown) => void) | undefined
const mockDispatch = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({
    addListener: (_: string, cb: (e: unknown) => void) => ((mockBeforeRemove = cb), () => {}),
    dispatch: mockDispatch,
  }),
}))

beforeEach(() => {
  ;(getIncomes as jest.Mock).mockResolvedValue([])
  ;(addIncome as jest.Mock).mockResolvedValue({ id: 'i1' })
  ;(getAccounts as jest.Mock).mockResolvedValue([])
  ;(getCategories as jest.Mock).mockResolvedValue([])
  ;(getBudgets as jest.Mock).mockResolvedValue([
    { month: currentMonthKey(), category: '__income__', assigned: '100000', rolled_over: '0', extra: '0', version: 1 },
  ])
})

it('records a one-off from the green flood', async () => {
  const { getByLabelText, getByText } = renderWithProviders(<QuickIncomeModal />)
  await waitFor(() => expect(getByText('₹1,00,000 monthly')).toBeTruthy())
  fireEvent.press(getByLabelText('5'))
  fireEvent.press(getByLabelText('0'))
  await act(async () => {
    fireEvent.press(getByText('Add'))
  })
  expect(addIncome).toHaveBeenCalledWith(expect.objectContaining({ amount: 50, label: 'Extra income' }))
})

it('shrinks the flood before letting the screen go', () => {
  // The mock's withTiming jumps straight to the end; finish the animation too.
  jest.spyOn(Reanimated, 'withTiming').mockImplementation(((v: number, _c: unknown, done?: (f: boolean) => void) => (done?.(true), v)) as never)
  renderWithProviders(<QuickIncomeModal />)
  const preventDefault = jest.fn()
  const action = { type: 'GO_BACK' }
  mockBeforeRemove?.({ preventDefault, data: { action } })
  expect(preventDefault).toHaveBeenCalled()
  expect(mockDispatch).toHaveBeenCalledWith(action)
  // The dispatched removal fires the listener again: this time it goes through.
  preventDefault.mockClear()
  mockBeforeRemove?.({ preventDefault, data: { action } })
  expect(preventDefault).not.toHaveBeenCalled()
  jest.restoreAllMocks()
})
