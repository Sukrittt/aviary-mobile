import { setOnline } from '@/src/lib/netStatus'
import ExpenseAddedScreen from './expense-added'
import { enqueue, remove } from '@/src/lib/pendingExpenses'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { mintExpensePayload, postExpensePayload, deleteExpense } from '@/src/api/expenses'
import { HttpError } from '@/src/api/client'
import ExpenseFailedScreen from './expense-failed'
import { getLogExpenseDraft, setLogExpenseDraft } from '@/src/features/log-expense/draft'

jest.mock('@/src/api/expenses', () => ({
  getExpenses: jest.fn(),
  getRecentExpenses: jest.fn(async () => ({ rows: [], lastSpent: {} })),
  mintExpensePayload: jest.fn((row) => ({ ...row, client_id: 'client-1' })),
  postExpensePayload: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
}))

jest.mock('@/src/lib/pendingExpenses', () => ({
  enqueue: jest.fn(), remove: jest.fn(async () => {}),
  syncReceipt: jest.fn(async () => undefined),
  list: jest.fn(async () => [{ payload: { client_id: 'client-1' }, submitted: false }]),
  listFailed: jest.fn(async () => []),
}))
jest.mock('@/src/api/accessMode', () => ({ ...jest.requireActual('@/src/api/accessMode'), currentUserId: jest.fn(() => 'user_1') }))
jest.mock('@/src/api/budgets', () => ({ getBudgets: jest.fn(async () => []) }))
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn() }) }))
jest.mock('@/src/lib/reviewPrompt', () => ({ recordLogAndMaybeAsk: jest.fn(async () => false) }))

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

afterEach(() => setOnline(true))

beforeEach(() => {
  setOnline(true)
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


it.each([false, true])('preserves Retry create metadata and supports Undo (offline=%s)', async (offline) => {
  ;(postExpensePayload as jest.Mock)[offline ? 'mockRejectedValue' : 'mockResolvedValue'](
    offline ? new TypeError('Network request failed') : { id: 'retry-row', version: 7, category: 'Food shopping', timestamp: '2026-10-08T10:00:00' },
  )
  ;(deleteExpense as jest.Mock).mockResolvedValue(undefined)
  const failed = setup()
  if (offline) { setOnline(false); setOnline(false) }
  fireEvent.press(failed.getByText('Retry'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  mockParams = mockReplace.mock.calls[0][0].params
  expect(mockParams).toMatchObject({
    id: offline ? '' : 'retry-row', version: offline ? '' : '7',
    clientId: 'client-1', pending: offline ? '1' : '',
    category: offline ? '🛒 Groceries' : 'Food shopping', amount: '450',
  })
  failed.unmount()
  mockReplace.mockClear()
  const success = renderWithProviders(<ExpenseAddedScreen />)
  if (offline) {
    expect(enqueue).toHaveBeenCalled()
    expect(success.getByText(/Logged offline/)).toBeTruthy()
    expect(success.queryByText(/left of/)).toBeNull()
  }
  fireEvent.press(success.getByText('Undo'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  if (offline) {
    expect((remove as jest.Mock).mock.calls[0][0]).toBe('client-1')
    expect(deleteExpense).not.toHaveBeenCalled()
  } else {
    expect(deleteExpense).toHaveBeenCalledWith('retry-row', '2026-10-08T10:00:00', 'Milk', 450, 7)
  }
})
