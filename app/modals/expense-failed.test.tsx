import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { mintExpensePayload, postExpensePayload } from '@/src/api/expenses'
import { HttpError } from '@/src/api/client'
import ExpenseFailedScreen from './expense-failed'
import { getLogExpenseDraft, setLogExpenseDraft } from '@/src/features/log-expense/draft'

jest.mock('@/src/api/expenses', () => ({
  getExpenses: jest.fn(),
  mintExpensePayload: jest.fn((row) => ({ ...row, client_id: 'client-1' })),
  postExpensePayload: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
}))

jest.mock('@/src/lib/pendingExpenses', () => ({ enqueue: jest.fn() }))

// `mock`-prefixed so Jest's out-of-scope guard allows the factory to close over them.
const mockReplace = jest.fn()
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

const BASE_PARAMS = {
  item: 'Milk',
  amount: '450',
  category: '🛒 Groceries',
  date: '2026-08-15',
  notes: '',
  paymentMethod: 'bank',
}

const PAYLOAD = {
  item: 'Milk',
  amount_inr: '450',
  category: '🛒 Groceries',
  date: '2026-08-15',
  notes: '',
  payment_method: 'bank',
}

function setup(overrides: Partial<typeof BASE_PARAMS> = {}) {
  mockParams = { ...BASE_PARAMS, ...overrides }
  return renderWithProviders(<ExpenseFailedScreen />)
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('reads back what could not be saved', () => {
  // Icon and text are separate Text nodes (not one "Milk · 🛒 Groceries"
  // string) — a ZWJ+variation-selector emoji sharing a custom-font Text run
  // with its label can make Android silently drop the rest of that run.
  const { getByText } = setup()
  expect(getByText("Couldn't add")).toBeTruthy()
  expect(getByText('₹450')).toBeTruthy()
  expect(getByText('🛒')).toBeTruthy()
  expect(getByText('Milk · Groceries')).toBeTruthy()
})

// Raw server text ("Failed to add expense: 503") tells the user nothing they can
// act on — the screen deliberately carries no reason line.
it('shows no raw error text', () => {
  const { queryByText } = setup()
  expect(queryByText(/Failed to add expense/)).toBeNull()
  expect(queryByText(/50\d/)).toBeNull()
})

it('retries with the payload it was handed, so nothing is retyped', async () => {
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'abc123', timestamp: '2026-08-15T01:24:00' })
  const { getByText } = setup()
  fireEvent.press(getByText('Retry'))
  await waitFor(() => expect(mintExpensePayload).toHaveBeenCalledWith(PAYLOAD))
})

it('lands on the success screen when the retry works', async () => {
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'abc123', timestamp: '2026-08-15T01:24:00' })
  const { getByText } = setup()
  fireEvent.press(getByText('Retry'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  const arg = mockReplace.mock.calls[0][0]
  expect(arg.pathname).toBe('/modals/expense-added')
  // id and timestamp come from the POST — without them the success screen hides Undo.
  expect(arg.params).toMatchObject({
    id: 'abc123',
    timestamp: '2026-08-15T01:24:00',
    item: 'Milk',
    amount: '450',
    category: '🛒 Groceries',
  })
})

it('drops the saved log-expense draft once the retry logs it', async () => {
  setLogExpenseDraft({ amount: '450', item: 'Milk', category: '🛒 Groceries', categoryTouched: true, autoPicked: false, date: '2026-08-15', notes: '', paymentMethod: 'bank' })
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'abc123', timestamp: '2026-08-15T01:24:00' })
  const { getByText } = setup()
  fireEvent.press(getByText('Retry'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  expect(getLogExpenseDraft()).toBeNull()
})

it('keeps an unrelated log-expense draft when the retry logs a different expense', async () => {
  setLogExpenseDraft({ amount: '40', item: 'Bread', category: '🛒 Groceries', categoryTouched: true, autoPicked: false, date: '2026-08-15', notes: '', paymentMethod: 'bank' })
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'abc123', timestamp: '2026-08-15T01:24:00' })
  const { getByText } = setup()
  fireEvent.press(getByText('Retry'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  expect(getLogExpenseDraft()?.item).toBe('Bread')
})

it('stays put when the retry fails too', async () => {
  // A real 4xx (HttpError), not a transport failure — a transport failure is
  // queued and resolves successfully instead of rejecting (see useExpenses.ts).
  ;(postExpensePayload as jest.Mock).mockRejectedValue(new HttpError(503, 'Failed to add expense: 503'))
  const { getByText } = setup()
  fireEvent.press(getByText('Retry'))
  await waitFor(() => expect(postExpensePayload).toHaveBeenCalled())
  await waitFor(() => expect(getByText('Retry')).toBeTruthy())
  expect(mockReplace).not.toHaveBeenCalled()
})

// Dismissing must not cost the user what they typed — no `timestamp` param, so
// the form reopens in add mode rather than edit mode.
it('reopens a prefilled entry screen on dismiss', () => {
  const { getByText } = setup()
  fireEvent.press(getByText('Dismiss'))
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/modals/log-expense',
    params: { item: 'Milk', amountInr: '450', category: '🛒 Groceries', date: '2026-08-15', notes: '', paymentMethod: 'bank' },
  })
})
