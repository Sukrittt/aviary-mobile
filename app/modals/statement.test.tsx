import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import StatementScreen from './statement'

const mockRead = jest.fn()
jest.mock('@/src/api/statement', () => ({
  ...jest.requireActual('@/src/api/statement'),
  readStatement: (...a: unknown[]) => mockRead(...a),
}))
const mockMutate = jest.fn()
jest.mock('@/src/hooks/useExpenses', () => ({ useAddExpense: () => ({ mutateAsync: mockMutate }) }))
const mockPickFile = jest.fn()
jest.mock('@/src/lib/filePicker', () => ({ canPickFiles: true, pickFile: () => mockPickFile() }))
jest.mock('@/src/components/shared/CategoryPickerSheet', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    CategoryPickerSheet: ({ visible, onSelect }: { visible: boolean; onSelect: (c: string) => void }) =>
      visible ? <Pressable onPress={() => onSelect('Food')}><Text>pick-food</Text></Pressable> : null,
  }
})
let mockOnline = true
jest.mock('@/src/lib/netStatus', () => ({ ...jest.requireActual('@/src/lib/netStatus'), useOnline: () => mockOnline }))
const mockBack = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }))

const PROPOSAL = {
  id: 'p1',
  credits: 1,
  dropped: 0,
  items: [
    { id: 'statement:a', item: 'Swiggy', amount: 349, date: '2026-10-17', category: 'Food', suggestSkip: null },
    { id: 'statement:b', item: 'Rapido', amount: 120, date: '2026-10-17', category: 'Travel', suggestSkip: 'logged' },
    { id: 'statement:c', item: 'Chai', amount: 20, date: '2026-10-12', category: '', suggestSkip: 'before_last' },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockOnline = true
  mockRead.mockResolvedValue(PROPOSAL)
  mockMutate.mockResolvedValue({})
  mockPickFile.mockResolvedValue({ uri: 'file:///hdfc.csv', name: 'hdfc.csv', size: 1200 })
})

async function openReview() {
  const screen = renderWithProviders(<StatementScreen />)
  fireEvent.press(screen.getByText('Choose a statement'))
  await screen.findByText('Check these, then log')
  return screen
}

it('reads a statement file and leaves likely-logged and older rows unticked', async () => {
  const screen = await openReview()
  expect(mockRead).toHaveBeenCalledWith({ file: expect.objectContaining({ name: 'hdfc.csv' }) })
  expect(screen.getByLabelText(/Add Swiggy/).props.accessibilityState).toMatchObject({ checked: true })
  expect(screen.getByLabelText(/Add Rapido/).props.accessibilityState).toMatchObject({ checked: false })
  expect(screen.getByLabelText(/Add Chai/).props.accessibilityState).toMatchObject({ checked: false })
  expect(screen.getByText(/Looks logged already/)).toBeTruthy()
  expect(screen.getByText('1 credit skipped. Log refunds as income if you want them counted.')).toBeTruthy()
})

it('logs only ticked rows, each with its hashed client_id', async () => {
  const screen = await openReview()
  fireEvent.press(screen.getByLabelText(/Add Chai/))
  expect(screen.getByText('Pick a category for the ticked rows to log them.')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('Pick a category for Chai'))
  fireEvent.press(screen.getByText('pick-food'))
  fireEvent.press(screen.getByText(/^Log 2 · /))
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2))
  expect(mockMutate.mock.calls.map((c) => c[0].client_id)).toEqual(['statement:a', 'statement:c'])
  expect(mockMutate.mock.calls[1][0]).toMatchObject({ source: 'statement', category: 'Food', date: '2026-10-12' })
})

it('turns away a file that is not a statement, and words a locked pdf', async () => {
  mockPickFile.mockResolvedValueOnce({ uri: 'file:///x.docx', name: 'x.docx' })
  const screen = renderWithProviders(<StatementScreen />)
  fireEvent.press(screen.getByText('Choose a statement'))
  expect(await screen.findByText('Pick a CSV, Excel or PDF statement.')).toBeTruthy()
  expect(mockRead).not.toHaveBeenCalled()

  const { StatementFailure } = jest.requireActual('@/src/api/statement')
  mockRead.mockRejectedValueOnce(new StatementFailure('That PDF has a password. Download the statement as Excel or CSV from net banking and upload that instead.'))
  fireEvent.press(screen.getByText('Choose a statement'))
  expect(await screen.findByText(/That PDF has a password/)).toBeTruthy()
})

it('says uploads need a connection when offline, and picks nothing', () => {
  mockOnline = false
  const screen = renderWithProviders(<StatementScreen />)
  expect(screen.getByText("You're offline. Uploads need a connection.")).toBeTruthy()
  fireEvent.press(screen.getByText('Choose a statement'))
  expect(mockPickFile).not.toHaveBeenCalled()
})

it('recovers when the file picker itself fails', async () => {
  mockPickFile.mockRejectedValueOnce(new Error('picker crashed'))
  const screen = renderWithProviders(<StatementScreen />)
  fireEvent.press(screen.getByText('Choose a statement'))
  expect(await screen.findByText("Couldn't open that. Try again.")).toBeTruthy()
})
