import { ExpenseWriteError } from '@/src/lib/expenseConflict'
import type { ExpenseRow } from '@/src/types'
import { Modal } from 'react-native'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { accountsKey } from '@/src/hooks/useAccounts'
import { getRecentExpenses, postExpensePayload, updateExpense } from '@/src/api/expenses'
import { addCategory, getCategories } from '@/src/api/categories'
import { getGroups } from '@/src/api/groups'
import { getCategoryMap, suggestCategoryLLM } from '@/src/api/categoryMap'
import LogExpenseScreen from './log-expense'
import { clearLogExpenseDraft, getLogExpenseDraft } from '@/src/features/log-expense/draft'
import { MIN_SPIN_MS, SETTLE_MS } from '@/src/features/log-expense/AutoCategoryPill'
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

let mockAccounts: { id: string; name: string; type: string; archived: boolean; created_at: string }[] = []
jest.mock('@/src/api/accounts', () => ({
  ...jest.requireActual('@/src/api/accounts'),
  getAccounts: jest.fn(async () => mockAccounts),
}))

const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockPush = jest.fn()
const mockTip: { reason: 'batch' | 'gap' | null; close: jest.Mock } = { reason: null, close: jest.fn() }
jest.mock('@/src/hooks/useCaptureTip', () => ({ useCaptureTip: () => mockTip }))
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

function setup(params: Record<string, string> = {}, expenses: ExpenseRow[] = [], categories = [{ name: 'Groceries', group: 'Food' }], { coldAccounts = false } = {}) {
  mockParams = params
  ;(getRecentExpenses as jest.Mock).mockResolvedValue({ rows: expenses, lastSpent: {} })
  ;(getCategories as jest.Mock).mockResolvedValue(categories)
  ;(getGroups as jest.Mock).mockResolvedValue(['Food'])
  ;(getCategoryMap as jest.Mock).mockResolvedValue({ words: {} })
  ;(suggestCategoryLLM as jest.Mock).mockResolvedValue('')
  // Accounts are usually cached by the time this opens (Home loads them).
  const queryClient = createTestQueryClient()
  if (!coldAccounts) queryClient.setQueryData(accountsKey, mockAccounts)
  return renderWithProviders(
    <LogExpenseSubmitProvider>
      <LogExpenseScreen />
      <Harness />
    </LogExpenseSubmitProvider>,
    { queryClient },
  )
}

beforeEach(() => {
  mockAccounts = []
  clearLogExpenseDraft()
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

it('predicts again when a new expense name changes after a manual category choice', async () => {
  let answer: (v: string) => void = () => {}
  const utils = setup({}, [], [{ name: 'Eating out', group: 'Food' }, { name: 'Rent', group: 'Food' }])
  ;(suggestCategoryLLM as jest.Mock).mockImplementation(() => new Promise<string>((r) => { answer = r }))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  fireEvent.press(utils.getByLabelText('Category'))
  fireEvent.press(await utils.findByText(/Eating out/))
  expect(utils.getByLabelText('Category: Eating out')).toBeTruthy()

  fireEvent.changeText(utils.getByPlaceholderText('What was it for?'), 'house rent')
  expect(utils.queryByLabelText('Category: Eating out')).toBeNull()
  await act(async () => { jest.advanceTimersByTime(300) })
  expect(suggestCategoryLLM).toHaveBeenCalledWith('house rent', ['Eating out', 'Rent'])
  await act(async () => { answer('Rent'); await Promise.resolve() })
  expect(utils.getByLabelText('Category: Rent, picked for you')).toBeTruthy()
})

it('clears an earlier auto-pick while predicting a different new expense name', async () => {
  let answer: (v: string) => void = () => {}
  const utils = setup({}, [], [{ name: 'Eating out', group: 'Food' }, { name: 'Rent', group: 'Food' }])
  ;(suggestCategoryLLM as jest.Mock).mockResolvedValueOnce('Eating out')
    .mockImplementationOnce(() => new Promise<string>((r) => { answer = r }))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  fireEvent.changeText(utils.getByPlaceholderText('What was it for?'), 'coffee')
  await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve() })
  expect(utils.getByLabelText('Category: Eating out, picked for you')).toBeTruthy()

  fireEvent.changeText(utils.getByPlaceholderText('What was it for?'), 'house rent')
  expect(utils.queryByLabelText('Category: Eating out, picked for you')).toBeNull()
  await act(async () => { jest.advanceTimersByTime(300) })
  expect(suggestCategoryLLM).toHaveBeenLastCalledWith('house rent', ['Eating out', 'Rent'])
  await act(async () => { answer('Rent'); await Promise.resolve() })
  expect(utils.getByLabelText('Category: Rent, picked for you')).toBeTruthy()
})

it('keeps a manual choice made during prediction until the name changes again', async () => {
  let answer: (v: string) => void = () => {}
  const utils = setup({}, [], [{ name: 'Eating out', group: 'Food' }, { name: 'Rent', group: 'Food' }])
  ;(suggestCategoryLLM as jest.Mock).mockImplementation(() => new Promise<string>((r) => { answer = r }))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  fireEvent.changeText(utils.getByPlaceholderText('What was it for?'), 'dinner')
  await act(async () => { jest.advanceTimersByTime(300) })
  fireEvent.press(utils.getByLabelText('Category'))
  fireEvent.press(await utils.findByText(/Rent/))
  await act(async () => { answer('Eating out'); await Promise.resolve() })
  expect(utils.getByLabelText('Category: Rent')).toBeTruthy()
})

it('shows the pill picking while the AI looks up a category, then lands on its answer', async () => {
  let answer: (v: string) => void = () => {}
  const utils = setup()
  ;(suggestCategoryLLM as jest.Mock).mockImplementation(() => new Promise<string>((r) => { answer = r }))
  const { getByPlaceholderText, findByText, getByText, queryByText, getByLabelText } = utils
  // Wait for the category map to load; the suggest effect waits on it.
  await act(async () => { await Promise.resolve(); await Promise.resolve() })

  fireEvent.changeText(getByPlaceholderText('What was it for?'), 'weekly shop')
  await act(async () => { jest.advanceTimersByTime(300 + 150) })
  expect(getByText('Picking…')).toBeTruthy()

  await act(async () => { answer('Groceries'); await Promise.resolve() })
  // The gate's minimum spin, then (once React has committed and scheduled
  // them) the roll's settle steps: at least 2s of slot animation in all.
  await act(async () => { jest.advanceTimersByTime(MIN_SPIN_MS) })
  await act(async () => { jest.advanceTimersByTime(SETTLE_MS - 1) })
  expect(getByText('Picking…')).toBeTruthy()
  await act(async () => { jest.advanceTimersByTime(1) })
  expect(queryByText('Picking…')).toBeNull()
  expect(await findByText('Groceries')).toBeTruthy()
  expect(getByLabelText('Category: Groceries, picked for you')).toBeTruthy()
})

it('lands on Miscellaneous, not marked as picked for you, when the AI finds nothing', async () => {
  let answer: (v: string) => void = () => {}
  const utils = setup({}, [], [{ name: 'Groceries', group: 'Food' }, { name: '🎟️ Miscellaneous', group: 'Fun' }])
  ;(suggestCategoryLLM as jest.Mock).mockImplementation(() => new Promise<string>((r) => { answer = r }))
  const { getByPlaceholderText, findByText, getByText, queryByText, getByLabelText } = utils
  await act(async () => { await Promise.resolve(); await Promise.resolve() })

  fireEvent.changeText(getByPlaceholderText('What was it for?'), 'random thing')
  await act(async () => { jest.advanceTimersByTime(300 + 150) })
  expect(getByText('Picking…')).toBeTruthy()

  await act(async () => { answer(''); await Promise.resolve() })
  await act(async () => { jest.advanceTimersByTime(MIN_SPIN_MS) })
  await act(async () => { jest.advanceTimersByTime(SETTLE_MS) })
  expect(queryByText('Picking…')).toBeNull()
  expect(await findByText('Miscellaneous')).toBeTruthy()
  expect(getByLabelText('Category: Miscellaneous')).toBeTruthy()
})

it('adds up an amount on the keypad and saves the total', async () => {
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'srv1', timestamp: '2026-09-04T01:24:00' })
  const utils = setup()
  const { getByLabelText, getByPlaceholderText, getByText, findByText } = utils
  fireEvent.changeText(getByPlaceholderText('What was it for?'), 'Milk')
  fireEvent.press(getByLabelText('Calculator'))
  for (const k of ['1', '5', '+', '5', '.', '5', '÷', '2']) fireEvent.press(getByLabelText(k))
  expect(getByText('20.5 ÷ 2')).toBeTruthy()
  fireEvent.press(getByText('Category'))
  fireEvent.press(await findByText(/Groceries/))

  await act(async () => {
    ;(globalThis as any).__submit()
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(postExpensePayload).toHaveBeenCalledWith(expect.objectContaining({ amount_inr: '10.25' }), 0)
})

it('keeps a half-filled expense across leaving and coming back, until it is logged', async () => {
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'srv1', timestamp: '2026-09-04T01:24:00' })
  const first = setup()
  await fillValidForm(first)
  first.unmount()

  const second = setup()
  expect(second.getByDisplayValue('Milk')).toBeTruthy()
  await act(async () => {
    ;(globalThis as any).__submit()
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(postExpensePayload).toHaveBeenCalledWith(expect.objectContaining({ item: 'Milk', amount_inr: '450', category: 'Groceries' }), 0)
  second.unmount()

  expect(setup().queryByDisplayValue('Milk')).toBeNull()
})

it('leaves a half-filled expense alone while a prefilled entry is open', async () => {
  const plain = setup()
  fireEvent.changeText(plain.getByPlaceholderText('What was it for?'), 'Milk')
  plain.unmount()

  const prefilled = setup({ item: 'Bread', amountInr: '40' })
  expect(prefilled.getByDisplayValue('Bread')).toBeTruthy()
  fireEvent.changeText(prefilled.getByPlaceholderText('What was it for?'), 'Bread and eggs')
  prefilled.unmount()

  expect(getLogExpenseDraft()?.item).toBe('Milk')
})


it('creates a category from a populated picker, closes the modal and uses it for the expense', async () => {
  let finishSave!: () => void
  ;(addCategory as jest.Mock).mockImplementation(() => new Promise<void>((resolve) => { finishSave = resolve }))
  ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'new-expense', timestamp: '2026-10-06T01:24:00' })
  const utils = setup()
  await fillValidForm(utils)
  fireEvent.press(utils.getByLabelText('Category: Groceries'))
  fireEvent.press(utils.getByLabelText('Add category in picker'))
  expect(utils.queryByText('Choose a category')).toBeNull()
  fireEvent.changeText(utils.getByPlaceholderText('New category name'), '  🏋️ Gym  ')
  fireEvent.press(utils.getByText('Food'))
  await act(async () => { fireEvent.press(utils.getByLabelText('Save category')) })
  expect(addCategory).toHaveBeenCalledWith('🏋️ Gym', 'Food')
  expect(utils.getByText('Saving…')).toBeTruthy()
  // The category refetch stays unresolved: selection must appear immediately.
  ;(getCategories as jest.Mock).mockImplementation(() => new Promise(() => {}))
  await act(async () => { finishSave() })
  expect(utils.queryByPlaceholderText('New category name')).toBeNull()
  expect(utils.queryByText('Choose a category')).toBeNull()
  expect(utils.getByLabelText('Category: Gym')).toBeTruthy()
  expect(utils.getByPlaceholderText('What was it for?').props.value).toBe('Milk')
  await act(async () => { (globalThis as any).__submit() })
  expect(postExpensePayload).toHaveBeenCalledWith(expect.objectContaining({ item: 'Milk', amount_inr: '450', category: '🏋️ Gym' }), 0)
})

it('keeps category creation errors in the modal and lets the user retry', async () => {
  ;(addCategory as jest.Mock).mockRejectedValueOnce(new Error('Category already exists'))
    .mockResolvedValueOnce(undefined)
  const utils = setup()
  await fillValidForm(utils)
  fireEvent.press(utils.getByLabelText('Category: Groceries'))
  fireEvent.press(utils.getByLabelText('Add category in picker'))
  fireEvent.changeText(utils.getByPlaceholderText('New category name'), 'Groceries')
  fireEvent.press(utils.getByLabelText('Save category'))
  expect(await utils.findByText('That name is already taken. Try a different name.')).toBeTruthy()
  expect(utils.getByPlaceholderText('New category name').props.value).toBe('Groceries')
  fireEvent.changeText(utils.getByPlaceholderText('New category name'), 'Gym')
  await act(async () => { fireEvent.press(utils.getByLabelText('Save category')) })
  expect(utils.queryByPlaceholderText('New category name')).toBeNull()
  expect(utils.getByLabelText('Category: Gym')).toBeTruthy()
})

it('discards a cancelled category draft without changing the expense category', async () => {
  const utils = setup()
  await fillValidForm(utils)
  fireEvent.press(utils.getByLabelText('Category: Groceries'))
  fireEvent.press(utils.getByLabelText('Add category in picker'))
  fireEvent.changeText(utils.getByPlaceholderText('New category name'), 'Gym')
  fireEvent(utils.UNSAFE_getAllByType(Modal).find((modal) => modal.props.visible)!, 'requestClose')
  expect(utils.queryByPlaceholderText('New category name')).toBeNull()
  expect(utils.getByLabelText('Category: Groceries')).toBeTruthy()
  fireEvent.press(utils.getByLabelText('Category: Groceries'))
  fireEvent.press(utils.getByLabelText('Add category in picker'))
  expect(utils.getByPlaceholderText('New category name').props.value).toBe('')
  fireEvent.changeText(utils.getByPlaceholderText('New category name'), '   ')
  expect(utils.getByLabelText('Save category')).toBeDisabled()
  expect(addCategory).not.toHaveBeenCalled()
})

it('offers category creation when there are no categories yet', async () => {
  ;(addCategory as jest.Mock).mockResolvedValue(undefined)
  const utils = setup({}, [], [])
  await act(async () => {})
  fireEvent.press(utils.getByText('Category'))
  fireEvent.press(utils.getByLabelText('Add category in picker'))
  fireEvent.changeText(utils.getByPlaceholderText('New category name'), 'First category')
  await act(async () => { fireEvent.press(utils.getByLabelText('Save category')) })
  expect(addCategory).toHaveBeenCalledWith('First category', '')
  expect(utils.getByLabelText('Category: First category')).toBeTruthy()
})


it('offers category creation only inside the category picker', async () => {
  const utils = setup()
  await fillValidForm(utils)
  expect(utils.queryByLabelText('Add category')).toBeNull()
  expect(utils.queryByLabelText('Add category in picker')).toBeNull()
  fireEvent.press(utils.getByLabelText('Category: Groceries'))
  expect(utils.getByLabelText('Add category in picker')).toBeTruthy()
})

it('points at logging several at once when the tip says now is the moment', () => {
  mockTip.reason = 'batch'
  const utils = setup()
  fireEvent.press(utils.getByLabelText('Try logging several at once'))
  expect(mockTip.close).toHaveBeenCalledWith('try')
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/modals/money-brain', params: { capture: '1' } })
  mockTip.reason = null
})

describe('accounts', () => {
  const row = (category: string, account_id: string, date: string): ExpenseRow => ({
    id: `${category}-${date}`, version: 0, timestamp: `${date}T10:00:00`, date, item: 'x', amount_inr: '10', category, notes: '', source: 'manual', amount: '', description: '', payment_method: 'bank', account_id,
  })

  it("logs on the account the category is usually paid from", async () => {
    mockAccounts = [
      { id: 'hdfc', name: 'HDFC', type: 'bank', archived: false, created_at: '1' },
      { id: 'card', name: 'Amex', type: 'credit_card', archived: false, created_at: '2' },
    ]
    ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'srv1', timestamp: '2026-09-04T01:24:00' })
    const utils = setup({}, [row('Groceries', 'card', '2026-09-01'), row('Groceries', 'card', '2026-09-02'), row('Rent', 'hdfc', '2026-09-03')])
    await fillValidForm(utils)
    fireEvent.press(utils.getByText('More'))
    expect((await utils.findByLabelText('💳 Amex')).props.accessibilityState).toMatchObject({ checked: true })
    await act(async () => {
      ;(globalThis as any).__submit()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect((postExpensePayload as jest.Mock).mock.calls[0][0]).toMatchObject({ account_id: 'card', payment_method: 'credit_card' })
  })

  it('waits for accounts to load before it can submit', async () => {
    let release!: (rows: typeof mockAccounts) => void
    const { getAccounts } = jest.requireMock('@/src/api/accounts')
    ;(getAccounts as jest.Mock).mockImplementationOnce(() => new Promise((r) => { release = r }))
    ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'srv1', timestamp: '2026-09-04T01:24:00' })
    const utils = setup({}, [], undefined, { coldAccounts: true })
    await fillValidForm(utils)
    await act(async () => {
      ;(globalThis as any).__submit()
      await Promise.resolve()
    })
    expect(postExpensePayload).not.toHaveBeenCalled()
    await act(async () => {
      release([])
    })
    await waitFor(() => {
      if (!(postExpensePayload as jest.Mock).mock.calls.length) (globalThis as any).__submit()
      expect(postExpensePayload).toHaveBeenCalled()
    })
  })

  it('sends no account while the user has none', async () => {
    ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'srv1', timestamp: '2026-09-04T01:24:00' })
    const utils = setup()
    await fillValidForm(utils)
    await act(async () => {
      ;(globalThis as any).__submit()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect((postExpensePayload as jest.Mock).mock.calls[0][0]).not.toHaveProperty('account_id')
  })

  it("an edit that moves the row to another account sends only that change", async () => {
    mockAccounts = [
      { id: 'hdfc', name: 'HDFC', type: 'bank', archived: false, created_at: '1' },
      { id: 'cash', name: 'Wallet', type: 'cash', archived: false, created_at: '2' },
    ]
    ;(updateExpense as jest.Mock).mockResolvedValue(undefined)
    const utils = setup({ id: 'e1', version: '0', timestamp: '2026-09-04T10:00:00', item: 'Milk', amountInr: '450', category: 'Groceries', date: '2026-09-04', notes: '', paymentMethod: 'bank', accountId: 'hdfc' })
    fireEvent.press(utils.getByText('More'))
    fireEvent.press(await utils.findByLabelText('💵 Wallet'))
    await act(async () => {
      ;(globalThis as any).__submit()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(updateExpense).toHaveBeenCalledWith('e1', '2026-09-04T10:00:00', 'Milk', 450, { new_account_id: 'cash' }, 0)
  })
})
