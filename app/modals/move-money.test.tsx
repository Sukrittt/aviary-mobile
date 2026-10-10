import { fireEvent, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getRecentExpenses } from '@/src/api/expenses'
import { getBudgets, transferBudget } from '@/src/api/budgets'
import { getCategories } from '@/src/api/categories'
import { getGroups } from '@/src/api/groups'
import MoveMoneyModal from './move-money'
import { currentMonthKey } from '@/src/lib/envelope'

jest.mock('@/src/api/expenses', () => ({ getRecentExpenses: jest.fn() }))
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

// Electricity (the target) is topped up from three envelopes with different
// available/assigned ratios, so ranking order is unambiguous: Travel (90%
// left) > Cook (50% left) > Shopping (10% left).
function setup(overrides: Partial<typeof BASE_PARAMS> = {}, expenses: object[] = []) {
  mockParams = { ...BASE_PARAMS, ...overrides }
  ;(getRecentExpenses as jest.Mock).mockResolvedValue({ rows: expenses, lastSpent: {} })
  ;(getBudgets as jest.Mock).mockResolvedValue([
    { month: MONTH, category: 'Electricity', assigned: '0', rolled_over: '0' },
    { month: MONTH, category: 'Travel', assigned: '1000', rolled_over: '0' },
    { month: MONTH, category: 'Cook', assigned: '1000', rolled_over: '0' },
    { month: MONTH, category: 'Shopping', assigned: '1000', rolled_over: '0' },
  ])
  ;(getCategories as jest.Mock).mockResolvedValue([
    { name: 'Electricity', group: 'Bills' },
    { name: 'Travel', group: 'Fun' },
    { name: 'Cook', group: 'Food' },
    { name: 'Shopping', group: 'Fun' },
  ])
  ;(getGroups as jest.Mock).mockResolvedValue(['Bills', 'Fun', 'Food'])
  return renderWithProviders(<MoveMoneyModal />)
}

const BASE_PARAMS = { fromCategory: 'Electricity' }

beforeEach(() => {
  jest.clearAllMocks()
})

// Spending eats into each envelope so `available/assigned` differs: Travel
// 900/1000, Cook 500/1000, Shopping 100/1000. Passed into setup() rather than
// mocked separately — setup() always sets getRecentExpenses itself, so a standalone
// mockResolvedValue call before it gets silently clobbered.
const SPENDING = [
  { date: `${MONTH}-05`, amount_inr: '100', category: 'Travel' },
  { date: `${MONTH}-05`, amount_inr: '500', category: 'Cook' },
  { date: `${MONTH}-05`, amount_inr: '900', category: 'Shopping' },
]

// The numpad's own digit keys share exact text ("0", "5", ...) with the
// odometer's per-character digit nodes on the same screen, so pressing by
// text is ambiguous — the numpad key's accessibilityLabel is the one thing
// that's unique to it.
async function enterAmount(getByLabelText: (t: string) => any, amount: string) {
  for (const digit of amount) {
    fireEvent.press(getByLabelText(digit))
  }
}

it('advances to the sources step once an amount is entered', async () => {
  const { getByText, getByLabelText, queryByText } = setup()
  // The screen gates on an ActivityIndicator until all four queries settle —
  // wait for real content (the numpad) rather than just the mock call.
  await waitFor(() => expect(getByLabelText('1')).toBeTruthy())
  expect(getByText('Add an amount')).toBeTruthy()
  await enterAmount(getByLabelText, '500')
  fireEvent.press(getByText('Pick sources →'))
  await waitFor(() => expect(queryByText('Pick sources →')).toBeNull())
  expect(getByText('SUGGESTED SOURCES')).toBeTruthy()
})

it('auto-fill allocates from the safest sources until the amount is covered', async () => {
  const { getByText, getByLabelText, queryByText } = setup({}, SPENDING)
  // The screen gates on an ActivityIndicator until all four queries settle —
  // wait for real content (the numpad) rather than just the mock call.
  await waitFor(() => expect(getByLabelText('1')).toBeTruthy())
  await enterAmount(getByLabelText, '1000')
  fireEvent.press(getByText('Pick sources →'))
  await waitFor(() => expect(getByText('SUGGESTED SOURCES')).toBeTruthy())

  fireEvent.press(getByText('Auto-fill'))

  // 1000 needed: Travel gives 900 (its full available), Cook covers the last
  // 100 — assert the actual split amounts, not just that the names appear
  // (both names show up in the remaining pool too, picked or not).
  await waitFor(() => expect(getByText('FROM')).toBeTruthy())
  expect(getByText('₹900 → ₹0')).toBeTruthy()
  expect(getByText('₹500 → ₹400')).toBeTruthy()
  expect(queryByText('Shopping')).toBeTruthy() // still in the remaining pool, untouched
  expect(getByText('Move ₹1,000')).toBeTruthy()
})

it('splits a move across multiple sources on submit', async () => {
  ;(transferBudget as jest.Mock).mockResolvedValue({})
  const { getByText, getByLabelText } = setup({}, SPENDING)
  // The screen gates on an ActivityIndicator until all four queries settle —
  // wait for real content (the numpad) rather than just the mock call.
  await waitFor(() => expect(getByLabelText('1')).toBeTruthy())
  await enterAmount(getByLabelText, '1000')
  fireEvent.press(getByText('Pick sources →'))
  await waitFor(() => expect(getByText('SUGGESTED SOURCES')).toBeTruthy())

  fireEvent.press(getByText('Auto-fill'))
  await waitFor(() => expect(getByText('Move ₹1,000')).toBeTruthy())
  fireEvent.press(getByText('Move ₹1,000'))

  // One server-side transaction: Travel gives its full 900 available, Cook
  // covers the remaining 100, both credited to Electricity in one call.
  await waitFor(() =>
    expect(transferBudget).toHaveBeenCalledWith(MONTH, 'Electricity', [
      { category: 'Travel', amount: 900 },
      { category: 'Cook', amount: 100 },
    ]),
  )
})

it('filters the source list by search', async () => {
  const { getByText, getByLabelText, getByPlaceholderText, queryByText } = setup({}, SPENDING)
  // The screen gates on an ActivityIndicator until all four queries settle —
  // wait for real content (the numpad) rather than just the mock call.
  await waitFor(() => expect(getByLabelText('1')).toBeTruthy())
  await enterAmount(getByLabelText, '500')
  fireEvent.press(getByText('Pick sources →'))
  await waitFor(() => expect(getByText('SUGGESTED SOURCES')).toBeTruthy())

  fireEvent.changeText(getByPlaceholderText('Find an envelope'), 'trav')
  expect(getByText('Travel')).toBeTruthy()
  expect(queryByText('Cook')).toBeNull()
  expect(queryByText('Shopping')).toBeNull()
})

it('removes native input padding so the envelope placeholder aligns with the search icon', async () => {
  const { getByText, getByLabelText, getByPlaceholderText } = setup({}, SPENDING)
  await waitFor(() => expect(getByLabelText('1')).toBeTruthy())
  await enterAmount(getByLabelText, '500')
  fireEvent.press(getByText('Pick sources →'))
  await waitFor(() => expect(getByText('SUGGESTED SOURCES')).toBeTruthy())

  const inputStyle = StyleSheet.flatten(getByPlaceholderText('Find an envelope').props.style)
  expect(inputStyle.padding).toBe(0)
})

it('ignores a pool tap once the amount is covered, so the move never exceeds it', async () => {
  ;(transferBudget as jest.Mock).mockResolvedValue({})
  const { getByText, getByLabelText } = setup({}, SPENDING)
  await waitFor(() => expect(getByLabelText('1')).toBeTruthy())
  await enterAmount(getByLabelText, '1000')
  fireEvent.press(getByText('Pick sources →'))
  await waitFor(() => expect(getByText('SUGGESTED SOURCES')).toBeTruthy())

  fireEvent.press(getByText('Auto-fill'))
  await waitFor(() => expect(getByText('Move ₹1,000')).toBeTruthy())
  // Travel 900 + Cook 100 already cover it; Shopping is still in the pool.
  fireEvent.press(getByText('Shopping'))
  fireEvent.press(getByText('Move ₹1,000'))

  await waitFor(() => expect(transferBudget).toHaveBeenCalled())
  const posted = (transferBudget as jest.Mock).mock.calls[0][2] as { amount: number }[]
  expect(posted.reduce((sum, s) => sum + s.amount, 0)).toBe(1000)
})

it('never picks more than a source has available', async () => {
  ;(transferBudget as jest.Mock).mockResolvedValue({})
  // Shopping is left with 0.5, less than the 1 being moved.
  const spending = [
    { date: `${MONTH}-05`, amount_inr: '100', category: 'Travel' },
    { date: `${MONTH}-05`, amount_inr: '999.5', category: 'Shopping' },
  ]
  const { getByText, getByLabelText } = setup({}, spending)
  await waitFor(() => expect(getByLabelText('1')).toBeTruthy())
  await enterAmount(getByLabelText, '1')
  fireEvent.press(getByText('Pick sources →'))
  await waitFor(() => expect(getByText('SUGGESTED SOURCES')).toBeTruthy())

  fireEvent.press(getByText('Shopping'))
  fireEvent.press(getByText('Travel'))
  await waitFor(() => expect(getByText('Move ₹1')).toBeTruthy())
  fireEvent.press(getByText('Move ₹1'))

  await waitFor(() =>
    expect(transferBudget).toHaveBeenCalledWith(MONTH, 'Electricity', [
      { category: 'Shopping', amount: 0.5 },
      { category: 'Travel', amount: 0.5 },
    ]),
  )
})
