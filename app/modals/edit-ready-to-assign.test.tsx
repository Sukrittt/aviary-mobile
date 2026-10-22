import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getExpenses } from '@/src/api/expenses'
import { getBudgets, updateBudget, getCarry } from '@/src/api/budgets'
import { getCategories } from '@/src/api/categories'
import { getGroups } from '@/src/api/groups'
import EditReadyToAssignModal from './edit-ready-to-assign'
import { currentMonthKey, prevMonthKey } from '@/src/lib/envelope'
import { BudgetWriteError } from '@/src/lib/budgetConflict'

jest.mock('@/src/api/expenses', () => ({ getExpenses: jest.fn() }))
jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(),
  addBudget: jest.fn(),
  updateBudget: jest.fn(),
  deleteBudget: jest.fn(),
  transferBudget: jest.fn(),
  getCarry: jest.fn(() => Promise.resolve({ ready_to_assign: 0, rolled_over: {} })),
}))
jest.mock('@/src/api/categories', () => ({ getCategories: jest.fn() }))
jest.mock('@/src/api/groups', () => ({ getGroups: jest.fn() }))

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const MONTH = currentMonthKey()
const PREV_MONTH = prevMonthKey(MONTH)

// Income and Food carried from last month: income 20000, assigned 5000, RTA 15000.
function setup() {
  ;(getExpenses as jest.Mock).mockResolvedValue([])
  ;(getBudgets as jest.Mock).mockResolvedValue([
    { month: PREV_MONTH, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month: PREV_MONTH, category: 'Food', assigned: '5000', rolled_over: '0', version: 1 },
  ])
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Food', group: 'Everyday' }])
  ;(getGroups as jest.Mock).mockResolvedValue(['Everyday'])
  return renderWithProviders(<EditReadyToAssignModal />)
}

async function typeAmount(getByLabelText: (t: string) => any, amount: string) {
  for (let i = 0; i < 5; i++) fireEvent.press(getByLabelText('Delete'))
  for (const digit of amount) fireEvent.press(getByLabelText(digit))
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('prefills the current Ready to Assign with a hint and the income card', async () => {
  const { getByLabelText, getByText } = setup()
  await waitFor(() => expect(getByLabelText('₹15,000')).toBeTruthy())
  expect(getByText("Type what's left to assign")).toBeTruthy()
  expect(getByText('₹20,000 income · ₹5,000 assigned')).toBeTruthy()
})

it('saves the difference as this month\'s income extra, leaving the monthly income alone', async () => {
  ;(updateBudget as jest.Mock).mockResolvedValue({})
  const { getByLabelText, getByText } = setup()
  await waitFor(() => expect(getByLabelText('₹15,000')).toBeTruthy())

  await typeAmount(getByLabelText, '25000')
  expect(getByText('Income ₹30,000')).toBeTruthy()

  await act(async () => {
    fireEvent.press(getByText('Save'))
  })

  await waitFor(() => expect(updateBudget).toHaveBeenCalledWith(MONTH, '__income__', { extra: '10000' }, 0))
})

it('shows a friendly error when the save fails', async () => {
  ;(updateBudget as jest.Mock).mockRejectedValue(new Error('503'))
  const { getByLabelText, getByText } = setup()
  await waitFor(() => expect(getByLabelText('₹15,000')).toBeTruthy())

  await act(async () => {
    fireEvent.press(getByText('Save'))
  })

  await waitFor(() => expect(getByText("Couldn't save. Check your connection and try again.")).toBeTruthy())
  expect(mockBack).not.toHaveBeenCalled()
})

it('reviews a stale Ready to Assign draft on the shared full-screen conflict screen', async () => {
  ;(updateBudget as jest.Mock)
    .mockRejectedValueOnce(new BudgetWriteError(409, 'changed', {
      month: MONTH, category: '__income__', assigned: '25000', rolled_over: '0', version: 2,
    }))
    .mockResolvedValueOnce({})
  const { getByLabelText, getByRole, getByTestId, getByText } = setup()
  await waitFor(() => expect(getByLabelText('₹15,000')).toBeTruthy())
  await typeAmount(getByLabelText, '25000')

  await act(async () => { fireEvent.press(getByText('Save')) })
  await waitFor(() => expect(getByText('Ready to Assign was updated')).toBeTruthy())
  expect(getByLabelText('Ready to Assign, latest saved: ₹20,000')).toBeTruthy()
  expect(getByLabelText('Ready to Assign, with your changes: ₹25,000')).toBeTruthy()
  expect(getByTestId('budget-conflict-scroll')).toBeTruthy()
  fireEvent.press(getByRole('button', { name: 'Continue with my changes' }))
  expect(updateBudget).toHaveBeenCalledTimes(1)
  await act(async () => { fireEvent.press(getByText('Save')) })
  await waitFor(() => expect(updateBudget).toHaveBeenLastCalledWith(MONTH, '__income__', { extra: '5000' }, 2))
})

describe('using the latest Ready to Assign after a conflict', () => {
  async function useLatest(assigned: string) {
    ;(updateBudget as jest.Mock).mockRejectedValueOnce(new BudgetWriteError(409, 'changed', {
      month: MONTH, category: '__income__', assigned, rolled_over: '0', version: 2,
    }))
    const utils = setup()
    await waitFor(() => expect(utils.getByLabelText('₹15,000')).toBeTruthy())
    await typeAmount(utils.getByLabelText, '25000')
    await act(async () => { fireEvent.press(utils.getByText('Save')) })
    fireEvent.press(await waitFor(() => utils.getByRole('button', { name: 'Use latest instead' })))
    return utils
  }

  it('rounds float noise out of the seeded amount', async () => {
    // 10000.2 income minus 5000 assigned is 5000.200000000001 in floats.
    const { getByLabelText } = await useLatest('10000.2')
    expect(getByLabelText('₹5,000.2')).toBeTruthy()
  })

  it('starts an over-assigned latest month from 0', async () => {
    const { getByLabelText } = await useLatest('3500')
    expect(getByLabelText('₹0')).toBeTruthy()
  })
})

it("won't act on balances without last month's carry", async () => {
  ;(getCarry as jest.Mock).mockRejectedValueOnce(new Error('503'))
  const { findByText } = renderWithProviders(<EditReadyToAssignModal />)
  expect(await findByText("Couldn't load your balances. Check your connection and try again.")).toBeTruthy()
})

it('counts last month\'s carry in the latest Ready to Assign after a conflict', async () => {
  ;(getCarry as jest.Mock).mockResolvedValueOnce({ ready_to_assign: 1000, rolled_over: {} })
  ;(updateBudget as jest.Mock).mockRejectedValueOnce(new BudgetWriteError(409, 'changed', {
    month: MONTH, category: '__income__', assigned: '25000', rolled_over: '0', version: 2,
  }))
  const utils = setup()
  await waitFor(() => expect(utils.getByLabelText('₹16,000')).toBeTruthy())
  await typeAmount(utils.getByLabelText, '30000')
  await act(async () => { fireEvent.press(utils.getByText('Save')) })
  // 25,000 income + 1,000 carried - 5,000 assigned.
  expect(await waitFor(() => utils.getByLabelText('Ready to Assign, latest saved: ₹21,000'))).toBeTruthy()
  fireEvent.press(utils.getByRole('button', { name: 'Use latest instead' }))
  expect(utils.getByLabelText('₹21,000')).toBeTruthy()
})
