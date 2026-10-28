import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { EnvelopeRow } from './EnvelopeRow'
import { keptDrafts } from './NoteBlock'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { updateCategory } from '@/src/api/categories'
import { useOnline } from '@/src/lib/netStatus'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import type { CategoryRow } from '@/src/types'

jest.mock('@/src/api/categories', () => ({
  ...jest.requireActual('@/src/api/categories'),
  // The refetch after a save hands back what was written.
  getCategories: jest.fn(() => Promise.resolve(mockRows)),
  updateCategory: jest.fn((name: string, updates: { note?: string | null }) => {
    mockRows = mockRows.map((r) => (r.name === name ? { ...r, note: updates.note ?? undefined } : r))
    return Promise.resolve()
  }),
}))
jest.mock('@/src/lib/netStatus', () => ({ ...jest.requireActual('@/src/lib/netStatus'), useOnline: jest.fn(() => true) }))
jest.mock('@/src/hooks/useBudgetSpaces', () => ({ useBudgetSpaces: jest.fn(() => ({ active: { readOnly: false } })) }))

let mockRows: CategoryRow[] = []
const update = updateCategory as jest.Mock

beforeEach(() => {
  keptDrafts.clear()
  update.mockClear()
  ;(useOnline as jest.Mock).mockReturnValue(true)
  ;(useBudgetSpaces as jest.Mock).mockReturnValue({ active: { readOnly: false } })
})

function open(category: Partial<CategoryRow> = {}, onToast = jest.fn()) {
  const queryClient = createTestQueryClient()
  mockRows = [{ name: 'Rent', group: 'Bills', ...category }]
  queryClient.setQueryData(['categories'], mockRows)
  const screen = renderWithProviders(
    <EnvelopeRow
      envelope={{ category: 'Rent', group: 'Bills', assigned: 1000, spent: 0, available: 1000, rolledOver: 0, isOverspent: false, spentPct: 0, isCreditCardPayment: false }}
      icon="House"
      hideAmounts={false}
      onMoveMoney={jest.fn()}
      onEditAmount={jest.fn()}
      onViewTransactions={jest.fn()}
      onToast={onToast}
    />,
    { queryClient },
  )
  fireEvent.press(screen.getAllByText('Rent')[0])
  return screen
}

it('adds a note: empty, type, save', async () => {
  const s = open()
  fireEvent.press(s.getByText('Add a note'))
  expect(s.getByPlaceholderText('Due date, account no., autopay?')).toBeTruthy()
  fireEvent.changeText(s.getByTestId('note-input'), '  Due 5th, autopay on  ')
  fireEvent.press(s.getByLabelText('Save note'))
  await waitFor(() => expect(update).toHaveBeenCalledWith('Rent', { note: 'Due 5th, autopay on' }))
})

it('clears with null when saved empty', async () => {
  const s = open({ note: 'old note' })
  fireEvent.press(s.getByText('Edit note'))
  fireEvent.changeText(s.getByTestId('note-input'), '   ')
  fireEvent.press(s.getByLabelText('Save note'))
  await waitFor(() => expect(update).toHaveBeenCalledWith('Rent', { note: null }))
})

it('saves a tick right away as [x]', async () => {
  const s = open({ note: '- pay rent\n- call owner' })
  fireEvent.press(s.getAllByRole('checkbox')[0])
  await waitFor(() => expect(update).toHaveBeenCalledWith('Rent', { note: '[x] pay rent\n- call owner' }))
  expect(s.getAllByRole('checkbox')[0]).toBeChecked()
  // The row's badge holds until the sheet is out of the way.
  expect(s.getByText('0/2')).toBeTruthy()
  await act(async () => fireEvent.press(s.getByTestId('bottom-sheet-backdrop')))
  await waitFor(() => expect(s.getByText('1/2')).toBeTruthy())
})

it('shows a read-only budget the note and nothing to edit it with', () => {
  ;(useBudgetSpaces as jest.Mock).mockReturnValue({ active: { readOnly: true } })
  const s = open({ note: '- pay rent' })
  expect(s.getByText('pay rent')).toBeTruthy()
  expect(s.queryByText('Edit note')).toBeNull()
  expect(s.getByRole('checkbox')).toBeDisabled()
})

it('hides Add a note on a read-only budget with no note', () => {
  ;(useBudgetSpaces as jest.Mock).mockReturnValue({ active: { readOnly: true } })
  expect(open().queryByText('Add a note')).toBeNull()
})

it("disables Save offline and says why", () => {
  ;(useOnline as jest.Mock).mockReturnValue(false)
  const s = open()
  fireEvent.press(s.getByText('Add a note'))
  fireEvent.changeText(s.getByTestId('note-input'), 'hello')
  expect(s.getByLabelText('Save note')).toBeDisabled()
  expect(s.getByText("You're offline. Save once you're back.")).toBeTruthy()
})

it('saves what was typed when the sheet is dismissed mid-edit', async () => {
  const onToast = jest.fn()
  const s = open({}, onToast)
  fireEvent.press(s.getByText('Add a note'))
  fireEvent.changeText(s.getByTestId('note-input'), 'half a thought')
  await act(async () => fireEvent.press(s.getByTestId('bottom-sheet-backdrop')))
  expect(update).toHaveBeenCalledWith('Rent', { note: 'half a thought' })
  await waitFor(() => expect(onToast).toHaveBeenCalledWith('Note saved'))
})

it('turns the line into a to-do from the chip', () => {
  const s = open()
  fireEvent.press(s.getByText('Add a note'))
  fireEvent.press(s.getByText('Add to-do'))
  expect(s.getByTestId('note-input').props.value).toBe('- ')
})

it('keeps a draft the sheet was torn down with, and reopens on it', () => {
  const s = open()
  fireEvent.press(s.getByText('Add a note'))
  fireEvent.changeText(s.getByTestId('note-input'), 'typed, then the screen went offline')
  s.unmount()
  expect(update).not.toHaveBeenCalled()
  const again = open()
  expect(again.getByTestId('note-input').props.value).toBe('typed, then the screen went offline')
})

it("doesn't carry a kept draft into another budget's category of the same name", () => {
  const { setActiveBudget } = jest.requireActual<typeof import('@/src/lib/activeBudget')>('@/src/lib/activeBudget')
  setActiveBudget('budget-a')
  const s = open()
  fireEvent.press(s.getByText('Add a note'))
  fireEvent.changeText(s.getByTestId('note-input'), 'for budget A only')
  s.unmount()
  setActiveBudget('budget-b')
  expect(open().queryByTestId('note-input')).toBeNull()
  setActiveBudget(null)
})
