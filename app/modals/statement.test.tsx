import { act, fireEvent, waitFor } from '@testing-library/react-native'
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
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  ImpactFeedbackStyle: { Rigid: 'rigid' },
  AndroidHaptics: { Clock_Tick: 'clock_tick' },
}))
const mockBack = jest.fn()
const mockDismissTo = jest.fn()
let mockActive: unknown = null
jest.mock('@/src/hooks/useBudgetSpaces', () => ({
  ...jest.requireActual('@/src/hooks/useBudgetSpaces'),
  useBudgetSpaces: () => ({ active: mockActive, budgets: [], multi: true, count: 2, limit: 5, atLimit: false }),
}))
const READ_ONLY_BUDGET = {
  id: 'b2', name: 'Studio', readOnly: true, ownerId: 'o1', role: 'member', personal: false,
  members: [{ userId: 'o1', name: 'Priya Rao', avatarUrl: null, role: 'owner', joinedAt: null }],
}

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn(), dismissTo: mockDismissTo }) }))

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
  mockActive = null
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
  // Left in flight: this is about what gets sent, and the success tick would animate past the test.
  mockMutate.mockReturnValue(new Promise(() => {}))
  fireEvent.press(screen.getByText(/^Log 2 · /))
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2))
  expect(mockMutate.mock.calls.map((c) => c[0].client_id)).toEqual(['statement:a', 'statement:c'])
  expect(mockMutate.mock.calls[1][0]).toMatchObject({ source: 'statement', category: 'Food', date: '2026-10-12' })
})

it('ticks every row at once, and unticks them again', async () => {
  const screen = await openReview()
  expect(screen.getByText('3 payments · 12 to 17 Oct')).toBeTruthy()
  fireEvent.press(screen.getByText('Tick all'))
  expect(screen.getByLabelText(/Add Rapido/).props.accessibilityState).toMatchObject({ checked: true })
  fireEvent.press(screen.getByText('Untick all'))
  expect(screen.getByText('Tick what to add')).toBeTruthy()
  // A selection tick each time, like Activity's select mode.
  expect(jest.requireMock('expo-haptics').selectionAsync).toHaveBeenCalledTimes(2)
})

it('picking a category ticks the row it belongs to', async () => {
  const screen = await openReview()
  fireEvent.press(screen.getByLabelText('Pick a category for Chai'))
  fireEvent.press(screen.getByText('pick-food'))
  expect(screen.getByLabelText(/Add Chai/).props.accessibilityState).toMatchObject({ checked: true })
  expect(screen.getByText(/^Log 2 · /)).toBeTruthy()
})

it('ends on what got filled in, then closes or goes to Activity', async () => {
  jest.useFakeTimers()
  try {
    const screen = await openReview()
    fireEvent.press(screen.getByLabelText(/Add Rapido/))
    fireEvent.press(screen.getByText(/^Log 2 · /))
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2))
    await waitFor(() => jest.advanceTimersByTime(1100))
    expect(await screen.findByText("You're caught up.")).toBeTruthy()
    expect(screen.getByText(/17 Oct is filled in/)).toBeTruthy()
    expect(screen.getByText('2 payments added')).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('See them in Activity'))
    expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/activity')
    fireEvent.press(screen.getByText('Done'))
    expect(mockBack).toHaveBeenCalled()
  } finally {
    jest.useRealTimers()
  }
})

it('counts a row an earlier failed try already saved, even once it is unticked', async () => {
  jest.useFakeTimers()
  try {
    const screen = await openReview()
    fireEvent.press(screen.getByLabelText(/Add Rapido/))
    mockMutate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('503'))
    fireEvent.press(screen.getByText(/^Log 2 · /))
    expect(await screen.findByText("Couldn't log 1. Check your connection and try again.")).toBeTruthy()
    fireEvent.press(screen.getByLabelText(/Add Swiggy/))
    fireEvent.press(screen.getByText(/^Log 1 · /))
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(3))
    await waitFor(() => jest.advanceTimersByTime(1100))
    expect(await screen.findByText("You're caught up.")).toBeTruthy()
    expect(screen.getByText('2 payments added')).toBeTruthy()
    expect(mockMutate.mock.calls[2][0].client_id).toBe('statement:b')
  } finally {
    jest.useRealTimers()
  }
})

async function logAndFinish(screen: Awaited<ReturnType<typeof openReview>>, label: RegExp, calls: number) {
  fireEvent.press(screen.getByText(label))
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(calls))
  await waitFor(() => jest.advanceTimersByTime(1100))
}

it('saves four at a time, a day in order, and counts every row to the end', async () => {
  jest.useFakeTimers()
  try {
    // Two on the 1st (one lane, in order), then a day each: six rows, more than the four that go at once.
    const days = ['01', '01', '02', '03', '04', '05']
    mockRead.mockResolvedValueOnce({
      ...PROPOSAL,
      credits: 0,
      items: days.map((d, n) => ({ id: `statement:${n}`, item: `Shop ${n}`, amount: 100, date: `2026-10-${d}`, category: 'Food', suggestSkip: null })),
    })
    const answers: (() => void)[] = []
    mockMutate.mockImplementation(() => new Promise((r) => answers.push(() => r({}))))
    const screen = await openReview()
    fireEvent.press(screen.getByText(/^Log 6 · /))
    const sent = () => mockMutate.mock.calls.map((c) => c[0].client_id)
    await waitFor(() => expect(sent()).toEqual(['statement:0', 'statement:2', 'statement:3', 'statement:4']))
    expect(mockMutate.mock.calls[0][0]).toMatchObject({ deferRefresh: true })
    expect(screen.getByText('Logging 0 of 6…')).toBeTruthy()
    // Onboarding's saving button: busy, so a second press can't log twice.
    expect(screen.getByRole('button', { busy: true })).toBeTruthy()
    // The 1st's second row only goes once its first one lands.
    await act(async () => answers[0]())
    await waitFor(() => expect(sent()).toEqual(['statement:0', 'statement:2', 'statement:3', 'statement:4', 'statement:1']))
    expect(screen.getByText('Logging 1 of 6…')).toBeTruthy()
    await act(async () => answers.slice(1).forEach((a) => a()))
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(6))
    expect(screen.getByText('Logging 5 of 6…')).toBeTruthy()
    await act(async () => answers[5]())
    await waitFor(() => jest.advanceTimersByTime(1100))
    expect(await screen.findByText('6 payments added')).toBeTruthy()
  } finally {
    jest.useRealTimers()
  }
})

it("doesn't count a row the server already had as added", async () => {
  jest.useFakeTimers()
  try {
    const screen = await openReview()
    fireEvent.press(screen.getByLabelText(/Add Rapido/))
    mockMutate.mockResolvedValueOnce({}).mockResolvedValueOnce({ duplicate: true })
    await logAndFinish(screen, /^Log 2 · /, 2)
    expect(await screen.findByText('1 payment added')).toBeTruthy()
  } finally {
    jest.useRealTimers()
  }
})

it('says so when everything ticked was already there', async () => {
  jest.useFakeTimers()
  try {
    const screen = await openReview()
    mockMutate.mockResolvedValueOnce({ duplicate: true })
    await logAndFinish(screen, /^Log 1 · /, 1)
    expect(await screen.findByText('Those were already in your budget, so nothing doubled up.')).toBeTruthy()
    expect(screen.queryByText(/added/)).toBeNull()
  } finally {
    jest.useRealTimers()
  }
})

it('turns away a file that is not a statement, and words a locked pdf', async () => {
  mockPickFile.mockResolvedValueOnce({ uri: 'file:///x.docx', name: 'x.docx' })
  const screen = renderWithProviders(<StatementScreen />)
  fireEvent.press(screen.getByText('Choose a statement'))
  expect(await screen.findByText('Pick a CSV, Excel or PDF statement.')).toBeTruthy()
  expect(mockRead).not.toHaveBeenCalled()

  const { StatementFailure } = jest.requireActual('@/src/api/statement')
  mockRead.mockRejectedValueOnce(new StatementFailure('That PDF has a password. Download the statement as Excel or CSV from net banking and upload that instead.', 'That PDF is locked'))
  fireEvent.press(screen.getByText('Choose a statement'))
  expect(await screen.findByText(/That PDF has a password/)).toBeTruthy()
  expect(screen.getByText('That PDF is locked')).toBeTruthy()
  expect(jest.requireMock('expo-haptics').notificationAsync).toHaveBeenCalledWith('error')
  // Try again goes back to the picker.
  fireEvent.press(screen.getByText('Try again'))
  expect(screen.getByText('Choose a statement')).toBeTruthy()
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

it('opens to the read-only notice in a read-only budget', () => {
  mockActive = READ_ONLY_BUDGET
  const screen = renderWithProviders(<StatementScreen />)
  expect(screen.getByTestId('read-only-notice')).toBeTruthy()
  expect(screen.queryByText('Choose a statement')).toBeNull()
})
