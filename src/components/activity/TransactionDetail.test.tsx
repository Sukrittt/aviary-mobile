import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { formatTime, nowLocal } from '@/src/lib/date'
import { ExpenseWriteError } from '@/src/lib/expenseConflict'
import type { AccountRow, ExpenseRow } from '@/src/types'
import { TransactionDetail } from './TransactionDetail'

const mockMutate = jest.fn()
jest.mock('@/src/hooks/useExpenses', () => ({
  useUpdateExpense: () => ({ mutate: mockMutate, isPending: false }),
}))

const mockAccounts: AccountRow[] = [
  { id: 'a1', name: '💳Debit Card', type: 'bank', archived: false, created_at: '' },
  { id: 'a2', name: 'Amex', type: 'credit_card', archived: false, created_at: '' },
]
jest.mock('@/src/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: mockAccounts }),
  liveAccounts: (rows: AccountRow[]) => rows,
}))
jest.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
  useCategoryTint: () => () => ({ bg: '#eee', ink: '#333' }),
}))

let mockReadOnly = false
const mockBlocked = jest.fn(() => mockReadOnly)
jest.mock('@/src/components/budgets/ReadOnlyNotice', () => ({
  useReadOnly: () => ({ readOnly: mockReadOnly, blocked: mockBlocked }),
}))

// The pickers have their own tests; here they only need to answer.
function mockPick(label: string, answer: () => void, onClose: () => void) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't reference out-of-scope imports (hoisting)
  const { Pressable, Text } = require('react-native')
  return <Pressable onPress={() => { answer(); onClose() }}><Text>{label}</Text></Pressable>
}
jest.mock('@/src/components/shared/CategoryPickerSheet', () => ({
  CategoryPickerSheet: ({ visible, onSelect, onClose }: { visible: boolean; onSelect: (c: string) => void; onClose: () => void }) =>
    visible ? mockPick('pick Hobbies', () => onSelect('Hobbies'), onClose) : null,
}))
jest.mock('@/src/components/shared/DatePicker', () => ({
  CalendarSheet: ({ visible, onPick, onClose }: { visible: boolean; onPick: (d: Date) => void; onClose: () => void }) =>
    visible ? mockPick('pick the 20th', () => onPick(new Date(2026, 9, 20)), onClose) : null,
}))

const txn = (over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: 'e1', version: 3, timestamp: '2026-10-18T00:21:59-06:00', date: '2026-10-18', item: 'Mini GT McLaren GT3', amount_inr: '464.13', category: 'Mini GT',
  notes: '', source: 'manual', amount: '464.13', description: '', payment_method: 'bank', account_id: 'a1', ...over,
})

function renderDetail(row = txn(), onEdit = jest.fn()) {
  renderWithProviders(
    <TransactionDetail txn={row} from={{ x: 0, y: 0, width: 300, height: 80 }} photoUri={null} onClosed={() => {}} onEdit={onEdit} onDelete={() => {}} />,
  )
  return onEdit
}

beforeEach(() => {
  mockMutate.mockReset()
  mockBlocked.mockClear()
  mockReadOnly = false
})

it('shows the account without its emoji', () => {
  renderDetail()
  expect(screen.getByText('Debit Card')).toBeTruthy()
  expect(screen.queryByText('💳Debit Card')).toBeNull()
})

it('changes the category in place and hands Edit the latest row', () => {
  const onEdit = renderDetail()
  fireEvent.press(screen.getByLabelText('Change category, Mini GT'))
  fireEvent.press(screen.getByText('pick Hobbies'))
  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'e1', version: 3, timestamp: '2026-10-18T00:21:59-06:00', updates: { category: 'Hobbies' } }),
    expect.anything(),
  )
  expect(screen.getByLabelText('Change category, Hobbies')).toBeTruthy()
  fireEvent.press(screen.getByText('Edit'))
  expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ category: 'Hobbies', version: 4 }))
})

it('moves the date, keeps the time of day, and sends the next version on the next change', () => {
  const onEdit = renderDetail(txn({ timestamp: nowLocal(new Date(2026, 9, 18, 0, 21, 59)).timestamp }))
  const moved = nowLocal(new Date(2026, 9, 20, 0, 21, 59)).timestamp
  fireEvent.press(screen.getByLabelText(/^Change date/))
  fireEvent.press(screen.getByText('pick the 20th'))
  expect(mockMutate.mock.calls[0][0]).toMatchObject({ version: 3, updates: { new_date: '2026-10-20', new_timestamp: moved } })
  fireEvent.press(screen.getByLabelText('Change category, Mini GT'))
  fireEvent.press(screen.getByText('pick Hobbies'))
  expect(mockMutate.mock.calls[1][0]).toMatchObject({ version: 4, timestamp: moved })
  fireEvent.press(screen.getByText('Edit'))
  expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-20', timestamp: moved, version: 5 }))
})

it('keeps the time you see when a date moves across a clock change', () => {
  const timestamp = '2026-03-01T10:00:00-05:00'
  renderDetail(txn({ timestamp, date: '2026-03-01' }))
  fireEvent.press(screen.getByLabelText(/^Change date/))
  fireEvent.press(screen.getByText('pick the 20th'))
  const sent = mockMutate.mock.calls[0][0].updates.new_timestamp
  expect(sent.slice(0, 10)).toBe('2026-10-20')
  expect(formatTime(sent)).toBe(formatTime(timestamp))
  expect(screen.getByLabelText(`Change time, ${formatTime(timestamp)}`)).toBeTruthy()
})

describe('time', () => {
  const spin = (wheel: string, actionName: 'increment' | 'decrement') =>
    fireEvent(screen.getByLabelText(wheel), 'accessibilityAction', { nativeEvent: { actionName } })

  it('changes the time, sends it in the device zone, and keeps the day', () => {
    const onEdit = renderDetail(txn({ timestamp: nowLocal(new Date(2026, 9, 18, 0, 21)).timestamp }))
    fireEvent.press(screen.getByLabelText(/^Change time/))
    spin('Hour', 'increment')
    spin('Minute', 'decrement')
    spin('am or pm', 'increment')
    fireEvent.press(screen.getByText('Done'))
    const picked = nowLocal(new Date(2026, 9, 18, 13, 20)).timestamp
    expect(mockMutate.mock.calls[0][0]).toMatchObject({ version: 3, updates: { new_timestamp: picked } })
    expect(screen.getByLabelText('Change time, 1:20 pm')).toBeTruthy()
    fireEvent.press(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ timestamp: picked, date: '2026-10-18', version: 4 }))
  })

  it('writes nothing when the wheels end up where they started', () => {
    renderDetail(txn({ timestamp: nowLocal(new Date(2026, 9, 18, 0, 21)).timestamp }))
    fireEvent.press(screen.getByLabelText(/^Change time/))
    fireEvent.press(screen.getByText('Done'))
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it("won't take a time that hasn't happened yet", () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 18, 10, 0), doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'nextTick', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'hrtime'] })
    try {
      renderDetail(txn({ timestamp: nowLocal(new Date(2026, 9, 18, 9, 0)).timestamp }))
      fireEvent.press(screen.getByLabelText(/^Change time/))
      expect(screen.queryByText("That time hasn't happened yet.")).toBeNull()
      spin('am or pm', 'increment')
      expect(screen.getByText("That time hasn't happened yet.")).toBeTruthy()
      // Disabled, so the press falls through to the sheet's card, which wants an event.
      fireEvent.press(screen.getByText('Done'), { stopPropagation: () => {} })
      expect(mockMutate).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })
})

it('switches the account and clears it, and writes nothing when the pick is unchanged', () => {
  const onEdit = renderDetail()
  fireEvent.press(screen.getByLabelText('Change account, Debit Card'))
  fireEvent.press(screen.getByLabelText('Debit Card'))
  expect(mockMutate).not.toHaveBeenCalled()

  fireEvent.press(screen.getByLabelText('Change account, Debit Card'))
  fireEvent.press(screen.getByLabelText('Amex'))
  expect(mockMutate.mock.calls[0][0].updates).toEqual({ new_account_id: 'a2' })
  fireEvent.press(screen.getByText('Edit'))
  expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ account_id: 'a2', payment_method: 'credit_card' }))

  fireEvent.press(screen.getByLabelText('Change account, Amex'))
  fireEvent.press(screen.getByLabelText('No account'))
  expect(mockMutate.mock.calls[1][0].updates).toEqual({ new_account_id: '' })
  expect(screen.getByLabelText('Change account, Not set')).toBeTruthy()
})

it('puts the old value back when the save fails, with words a person can act on', () => {
  renderDetail()
  fireEvent.press(screen.getByLabelText('Change category, Mini GT'))
  fireEvent.press(screen.getByText('pick Hobbies'))
  act(() => mockMutate.mock.calls[0][1].onError(new Error('Failed to update expense: 503')))
  expect(screen.getByLabelText('Change category, Mini GT')).toBeTruthy()
  expect(screen.getByText("Couldn't save that. Check your connection and try again.")).toBeTruthy()
  expect(screen.queryByText(/503/)).toBeNull()
})

it('takes the latest row on a conflict, so the retry sends the right version', () => {
  renderDetail()
  fireEvent.press(screen.getByLabelText('Change category, Mini GT'))
  fireEvent.press(screen.getByText('pick Hobbies'))
  act(() => mockMutate.mock.calls[0][1].onError(new ExpenseWriteError(409, 'Changed', txn({ version: 7, category: 'Cars' }))))
  expect(screen.getByText("This changed on another device. Here's the latest, so give it another go.")).toBeTruthy()
  fireEvent.press(screen.getByLabelText('Change category, Cars'))
  fireEvent.press(screen.getByText('pick Hobbies'))
  expect(mockMutate.mock.calls[1][0]).toMatchObject({ version: 7, updates: { category: 'Hobbies' } })
})

it("doesn't offer changes on a row that can't take them", () => {
  mockReadOnly = true
  renderDetail()
  expect(screen.queryByLabelText(/^Change /)).toBeNull()
})

it("doesn't offer changes on an expense still waiting to sync", () => {
  renderDetail(txn({ id: undefined, version: undefined }))
  expect(screen.queryByLabelText(/^Change /)).toBeNull()
})
