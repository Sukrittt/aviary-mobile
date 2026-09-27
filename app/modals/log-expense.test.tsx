import { ExpenseWriteError } from '@/src/lib/expenseConflict'
import type { ExpenseRow } from '@/src/types'
import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getRecentExpenses, postExpensePayload, updateExpense } from '@/src/api/expenses'
import { getCategories } from '@/src/api/categories'
import { getGroups } from '@/src/api/groups'
import { getCategoryMap, suggestCategoryLLM } from '@/src/api/categoryMap'
import LogExpenseScreen from './log-expense'
import { todayLocal } from '@/src/lib/date'
import { useLogExpenseSubmitState, LogExpenseSubmitProvider } from '@/src/features/log-expense/SubmitContext'

jest.mock('@/src/api/expenses', () => ({
  getRecentExpenses: jest.fn(),
  postExpensePayload: jest.fn(),
  mintExpensePayload: jest.requireActual('@/src/api/expenses').mintExpensePayload,
  updateExpense: jest.fn(),
}))
jest.mock('@/src/api/categories', () => ({
  getCategories: jest.fn(),
  addCategory: jest.fn(),
}))
// CategoryPickerSheet (rendered by the log-expense screen) groups by this,
// so it needs a resolved value or every category is dropped from the list.
jest.mock('@/src/api/groups', () => ({
  getGroups: jest.fn(),
}))
jest.mock('@/src/api/categoryMap', () => ({
  getCategoryMap: jest.fn(),
  suggestCategoryLLM: jest.fn(),
}))

const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockPush = jest.fn()
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: mockPush, navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

// Mirror the screen and nav as siblings sharing the root submit context.
function Harness() {
  const { submit, onInvalid } = useLogExpenseSubmitState()
  ;(globalThis as any).__submit = submit
  ;(globalThis as any).__onInvalid = onInvalid
  return null
}

function setup(params: Record<string, string> = {}, expenses: ExpenseRow[] = []) {
  mockParams = params
  ;(getRecentExpenses as jest.Mock).mockResolvedValue({ rows: expenses, lastSpent: {} })
  ;(getCategories as jest.Mock).mockResolvedValue([{ name: 'Groceries', group: 'Food' }])
  ;(getGroups as jest.Mock).mockResolvedValue(['Food'])
  ;(getCategoryMap as jest.Mock).mockResolvedValue({ words: {} })
  ;(suggestCategoryLLM as jest.Mock).mockResolvedValue('')
  return renderWithProviders(
    <LogExpenseSubmitProvider>
      <LogExpenseScreen />
      <Harness />
    </LogExpenseSubmitProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ legacyFakeTimers: false })
})

afterEach(() => {
  jest.useRealTimers()
})

async function fillValidForm(utils: ReturnType<typeof setup>) {
  const { getByPlaceholderText, getByLabelText, getByText, findByText } = utils
  fireEvent.changeText(getByPlaceholderText('What was it for?'), 'Milk')
  fireEvent.press(getByLabelText('4'))
  fireEvent.press(getByLabelText('5'))
  fireEvent.press(getByLabelText('0'))
  fireEvent.press(getByText('Category'))
  fireEvent.press(await findByText(/Groceries/))
}

it('plays the nav circle save animation before replacing the screen with the success screen', async () => {
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'srv1', timestamp: '2026-09-04T01:24:00' })
  const utils = setup()
  await fillValidForm(utils)

  await act(async () => {
    ;(globalThis as any).__submit()
    // Let the mutation's promise settle without also advancing the 950ms
    // navigation timer, so the assertion below can catch the animation
    // actually playing before the replace happens.
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(mockReplace).not.toHaveBeenCalled()

  await act(async () => {
    jest.advanceTimersByTime(950)
  })

  expect(mockReplace).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: '/modals/expense-added',
      params: expect.objectContaining({ id: 'srv1', item: 'Milk', amount: '450', category: 'Groceries' }),
    }),
  )
})

it('sends the success screen the category the server stored, not the stale one it asked for', async () => {
  // The picker list predates a rename, so the server maps 'Groceries' forward
  // and answers with the live name. Passing the stale one on would make the
  // success screen look up an envelope that no longer exists, and it would
  // silently drop the budget progress bar.
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'srv1', timestamp: '2026-09-04T01:24:00', category: 'Essentials' })
  const utils = setup()
  await fillValidForm(utils)

  await act(async () => {
    ;(globalThis as any).__submit()
    await Promise.resolve()
    await Promise.resolve()
  })
  await act(async () => {
    jest.advanceTimersByTime(950)
  })

  expect(mockReplace).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: '/modals/expense-added',
      params: expect.objectContaining({ category: 'Essentials' }),
    }),
  )
})

it('navigates to the success screen only after the save animation, not immediately on success', async () => {
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'srv1', timestamp: '2026-09-04T01:24:00' })
  const utils = setup()
  await fillValidForm(utils)

  await act(async () => {
    ;(globalThis as any).__submit()
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(mockReplace).not.toHaveBeenCalled()

  await act(async () => {
    jest.advanceTimersByTime(900)
  })
  expect(mockReplace).not.toHaveBeenCalled()

  await act(async () => {
    jest.advanceTimersByTime(100)
  })
  expect(mockReplace).toHaveBeenCalled()
})

it('opens the money brain for logging several spends at once', () => {
  const utils = setup()
  fireEvent.press(utils.getByLabelText('Log several spends at once'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/modals/money-brain', params: { capture: '1' } })
})

it('offers logging several at once only for a new expense, not an edit', () => {
  const utils = setup({ edit: '1', item: 'Milk', amount: '45', category: 'Groceries', date: '2026-09-01', timestamp: '2026-09-01T10:00:00+05:30' })
  expect(utils.queryByLabelText('Log several spends at once')).toBeNull()
})

it('names what is still missing when an incomplete submit is blocked', async () => {
  const utils = setup()
  const { getByLabelText, getByPlaceholderText, queryByText, findByText } = utils
  expect(queryByText('Add an amount, item and category')).toBeNull()

  fireEvent.press(getByLabelText('4'))
  act(() => {
    ;(globalThis as any).__onInvalid()
  })
  expect(await findByText('Add an item and category')).toBeTruthy()

  // The copy tracks the form live while the toast is up.
  fireEvent.changeText(getByPlaceholderText('What was it for?'), 'Milk')
  expect(await findByText('Pick a category')).toBeTruthy()
})


it('preserves an edit draft on conflict and only reapplies changed fields after review', async () => {
  const utils = setup({ id: 'srv1', version: '0', timestamp: 'ts', item: 'Lunch', amountInr: '100', category: 'Groceries', date: '2026-09-18' })
  ;(updateExpense as jest.Mock).mockRejectedValueOnce(new ExpenseWriteError(409, 'Changed on another device', {
    id: 'srv1', version: 1, item: 'Lunch', amount_inr: '150', date: '2026-09-18', category: 'Groceries',
  } as ExpenseRow)).mockResolvedValueOnce(undefined)
  fireEvent.changeText(utils.getByPlaceholderText('What was it for?'), 'Dinner')
  await act(async () => { (globalThis as any).__submit(); await Promise.resolve(); await Promise.resolve() })
  await act(async () => { jest.advanceTimersByTime(1) })
  expect(utils.getByText('This transaction was updated')).toBeTruthy()
  expect(utils.getByLabelText('Description, with your changes: Dinner')).toBeTruthy()
  expect(utils.queryByText('Changed on another device')).toBeNull()
  expect(updateExpense).toHaveBeenLastCalledWith('srv1', 'ts', 'Lunch', 100, { new_item: 'Dinner' }, 0)
  fireEvent.press(utils.getByText('Continue with my changes'))
  await act(async () => { (globalThis as any).__submit(); await Promise.resolve(); await Promise.resolve() })
  expect(updateExpense).toHaveBeenLastCalledWith('srv1', 'ts', 'Lunch', 100, { new_item: 'Dinner' }, 1)
})

it('keeps the draft and shows a deleted-elsewhere message', async () => {
  const utils = setup({ id: 'srv1', version: '0', timestamp: 'ts', item: 'Lunch', amountInr: '100', category: 'Groceries', date: '2026-09-18' })
  ;(updateExpense as jest.Mock).mockRejectedValueOnce(new ExpenseWriteError(404, 'This transaction was deleted on another device.'))
  fireEvent.changeText(utils.getByPlaceholderText('What was it for?'), 'Dinner')
  await act(async () => { (globalThis as any).__submit(); await Promise.resolve(); await Promise.resolve() })
  await act(async () => { jest.advanceTimersByTime(1) })
  expect(utils.getByText('This transaction is already deleted')).toBeTruthy()
  expect(utils.queryByText('This transaction was deleted on another device.')).toBeNull()
  fireEvent.press(utils.getByText('Back to my draft'))
  expect(utils.getByPlaceholderText('What was it for?').props.value).toBe('Dinner')
  ;(updateExpense as jest.Mock).mockClear()
  await act(async () => { (globalThis as any).__submit() })
  expect(updateExpense).not.toHaveBeenCalled()
})

it('uses the latest version to prefill the editor without saving automatically', async () => {
  const utils = setup({ id: 'srv1', version: '0', timestamp: 'ts', item: 'Lunch', amountInr: '100', category: 'Groceries', date: '2026-09-18' })
  ;(updateExpense as jest.Mock).mockRejectedValueOnce(new ExpenseWriteError(409, 'Changed elsewhere', {
    id: 'srv1', version: 2, item: 'Lunch', amount_inr: '150', date: '2026-09-18', category: 'Groceries',
  } as ExpenseRow)).mockResolvedValueOnce(undefined)
  fireEvent.changeText(utils.getByPlaceholderText('What was it for?'), 'Dinner')
  await act(async () => { (globalThis as any).__submit(); await Promise.resolve(); await Promise.resolve() })
  await act(async () => { jest.advanceTimersByTime(1) })
  fireEvent.press(utils.getByText('Use latest instead'))
  expect(utils.getByPlaceholderText('What was it for?').props.value).toBe('Lunch')
  expect(utils.queryByText('This transaction was updated')).toBeNull()
  expect(updateExpense).toHaveBeenCalledTimes(1)
  fireEvent.changeText(utils.getByPlaceholderText('What was it for?'), 'Coffee')
  await act(async () => { (globalThis as any).__submit(); await Promise.resolve(); await Promise.resolve() })
  expect(updateExpense).toHaveBeenLastCalledWith('srv1', 'ts', 'Lunch', 100, { new_item: 'Coffee' }, 2)
})

it('returns from review with the draft and original version intact until a choice is made', async () => {
  const utils = setup({ id: 'srv1', version: '0', timestamp: 'ts', item: 'Lunch', amountInr: '100', category: 'Groceries', date: '2026-09-18' })
  ;(updateExpense as jest.Mock).mockRejectedValue(new ExpenseWriteError(409, 'Changed elsewhere', {
    id: 'srv1', version: 1, item: 'Lunch', amount_inr: '150', date: '2026-09-18', category: 'Groceries',
  } as ExpenseRow))
  fireEvent.changeText(utils.getByPlaceholderText('What was it for?'), 'Dinner')
  await act(async () => { (globalThis as any).__submit(); await Promise.resolve(); await Promise.resolve() })
  await act(async () => { jest.advanceTimersByTime(1) })
  fireEvent.press(utils.getByLabelText('Back to editing'))
  expect(utils.getByPlaceholderText('What was it for?').props.value).toBe('Dinner')
  expect(updateExpense).toHaveBeenCalledTimes(1)
  await act(async () => { (globalThis as any).__submit(); await Promise.resolve(); await Promise.resolve() })
  await act(async () => { jest.advanceTimersByTime(1) })
  expect(updateExpense).toHaveBeenLastCalledWith('srv1', 'ts', 'Lunch', 100, { new_item: 'Dinner' }, 0)
  expect(utils.getByText('This transaction was updated')).toBeTruthy()
})

it('asks before saving an amount far above the category usual, then saves on the second tap', async () => {
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'srv1', timestamp: '2026-09-04T01:24:00' })
  const today = todayLocal()
  // Eight Groceries runs of 40..75: a 450 entry is ~8x the median and beats them all.
  const utils = setup({}, [40, 45, 50, 55, 60, 65, 70, 75].map((a) => ({
    date: today, amount_inr: String(a), category: 'Groceries',
    timestamp: '', item: '', notes: '', source: '', amount: '', description: '', payment_method: '',
  })))
  await fillValidForm(utils)

  await act(async () => { (globalThis as any).__submit(); await Promise.resolve() })
  expect(await utils.findByText(/^Way above your usual .*58\. Tap again to save\.$/)).toBeTruthy()
  expect(postExpensePayload).not.toHaveBeenCalled()

  await act(async () => { (globalThis as any).__submit(); await Promise.resolve(); await Promise.resolve() })
  expect(postExpensePayload).toHaveBeenCalledTimes(1)
})
