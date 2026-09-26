import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { CaptureProposal } from '@/src/api/ai'
import { CaptureReview } from './CaptureReview'

const mockAdd = jest.fn()
const mockUpdateStatus = jest.fn(async () => {})
const mockTrack = jest.fn()

jest.mock('@/src/hooks/useExpenses', () => ({
  useAddExpense: () => ({ mutateAsync: mockAdd }),
  useRecentExpenses: () => ({ data: [] }),
}))
jest.mock('@/src/api/ai', () => ({
  updateProposalStatus: (...args: unknown[]) => mockUpdateStatus(...(args as [])),
}))
jest.mock('@/src/lib/analytics', () => ({ track: (...args: unknown[]) => mockTrack(...args) }))
jest.mock('@/src/lib/date', () => ({ ...jest.requireActual('@/src/lib/date'), todayLocal: () => '2026-09-26' }))
jest.mock('@/src/components/shared/CategoryPickerSheet', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    CategoryPickerSheet: ({ visible, onSelect }: { visible: boolean; onSelect: (value: string) => void }) =>
      visible ? (
        <Pressable accessibilityRole="button" onPress={() => onSelect('Shopping')}>
          <Text>Choose Shopping</Text>
        </Pressable>
      ) : null,
  }
})

const proposal: CaptureProposal = {
  id: 'p1',
  items: [
    { id: 'r1', item: 'Auto', amount: 240, splitWays: 1, date: '2026-09-26', category: 'Travel', categoryConfidence: 1 },
    { id: 'r2', item: 'Turf', amount: 1200, splitWays: 6, date: '2026-09-26', category: 'Sports', categoryConfidence: 0.9 },
    { id: 'r3', item: 'Sneakers', amount: 4999, splitWays: 1, date: '2026-09-25', category: '', categoryConfidence: 0.4 },
  ],
  skipped: [],
  unparsed: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ legacyFakeTimers: false })
  let n = 0
  mockAdd.mockImplementation(async () => ({ id: `e${++n}`, pending: false }))
})

afterEach(() => {
  jest.useRealTimers()
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

it('shows each row with its envelope, split and date', () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} sessionId="s1" />)

  expect(utils.getByDisplayValue('Auto')).toBeTruthy()
  expect(utils.getByLabelText('Envelope: Travel. Change it')).toBeTruthy()
  expect(utils.getByText('₹1,200 ÷ 6 = ₹200')).toBeTruthy()
  // Yesterday's row says so; today's rows don't.
  expect(utils.getByText('25 Sep')).toBeTruthy()
  expect(utils.getByLabelText('Pick an envelope')).toBeTruthy()
})

it('will not log until every row has an envelope', async () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} sessionId="s1" />)

  fireEvent.press(utils.getByLabelText('Log 3 spends'))
  await flush()
  expect(mockAdd).not.toHaveBeenCalled()

  fireEvent.press(utils.getByLabelText('Pick an envelope'))
  fireEvent.press(utils.getByText('Choose Shopping'))
  expect(utils.getByLabelText('Envelope: Shopping. Change it')).toBeTruthy()
})

it('logs the kept rows with fixed client ids, the split share and source text', async () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} sessionId="s1" />)

  fireEvent.press(utils.getByLabelText('Remove Sneakers'))
  fireEvent.changeText(utils.getByLabelText('Amount for Auto'), '260')
  fireEvent.press(utils.getByLabelText('Log 2 spends'))
  await flush()

  expect(mockAdd).toHaveBeenCalledTimes(2)
  expect(mockAdd.mock.calls[0][0]).toEqual({
    item: 'Auto',
    amount_inr: '260',
    category: 'Travel',
    date: '2026-09-26',
    source: 'text',
    client_id: 'capture:p1:r1',
  })
  expect(mockAdd.mock.calls[1][0]).toMatchObject({ amount_inr: '200', notes: 'Split 6 ways · ₹1,200 total', client_id: 'capture:p1:r2' })
  expect(mockUpdateStatus).toHaveBeenCalledWith('s1', 'p1', 'submitted', ['e1', 'e2'])
  expect(mockTrack).toHaveBeenCalledWith('capture_logged', expect.objectContaining({ rows: 2, edited: 1, removed: 1 }))
})

it('plays the success check, then settles into a summary', async () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} sessionId="s1" />)

  fireEvent.press(utils.getByLabelText('Remove Sneakers'))
  fireEvent.press(utils.getByLabelText('Log 2 spends'))
  await flush()
  expect(utils.queryByTestId('capture-summary')).toBeNull()

  await act(async () => {
    jest.advanceTimersByTime(1100)
  })
  expect(utils.getByText('Logged 2 spends · ₹440')).toBeTruthy()
})

it('keeps only the failed rows editable after a partial failure, and retries just those', async () => {
  mockAdd.mockResolvedValueOnce({ id: 'e1', pending: false }).mockRejectedValueOnce(new Error('400'))
  const utils = renderWithProviders(<CaptureReview proposal={proposal} sessionId="s1" />)

  fireEvent.press(utils.getByLabelText('Remove Sneakers'))
  fireEvent.press(utils.getByLabelText('Log 2 spends'))
  await flush()

  expect(utils.getByText("Couldn't log 1 spend. Check your connection and try again.")).toBeTruthy()
  expect(utils.queryByDisplayValue('Auto')).toBeNull()
  expect(utils.getByDisplayValue('Turf')).toBeTruthy()
  expect(mockUpdateStatus).not.toHaveBeenCalled()

  mockAdd.mockResolvedValueOnce({ id: 'e2', pending: false })
  fireEvent.press(utils.getByLabelText('Log 1 spend'))
  await flush()

  expect(mockAdd).toHaveBeenLastCalledWith(expect.objectContaining({ client_id: 'capture:p1:r2' }))
  expect(mockUpdateStatus).toHaveBeenCalledWith('s1', 'p1', 'submitted', ['e1', 'e2'])
  await act(async () => {
    jest.advanceTimersByTime(1100)
  })
  expect(utils.getByText('Logged 2 spends · ₹440')).toBeTruthy()
})

it('counts a row queued offline as logged', async () => {
  mockAdd.mockResolvedValue({ pending: true })
  const utils = renderWithProviders(<CaptureReview proposal={proposal} sessionId="s1" />)

  fireEvent.press(utils.getByLabelText('Remove Sneakers'))
  fireEvent.press(utils.getByLabelText('Log 2 spends'))
  await flush()
  await act(async () => {
    jest.advanceTimersByTime(1100)
  })

  expect(utils.getByText('Logged 2 spends · ₹440')).toBeTruthy()
  expect(mockUpdateStatus).toHaveBeenCalledWith('s1', 'p1', 'submitted', [])
})

it('dismisses without logging anything', () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} sessionId="s1" />)

  fireEvent.press(utils.getByText('Not now'))

  expect(utils.getByText('Not logged')).toBeTruthy()
  expect(mockAdd).not.toHaveBeenCalled()
  expect(mockUpdateStatus).toHaveBeenCalledWith('s1', 'p1', 'dismissed')
  expect(mockTrack).toHaveBeenCalledWith('capture_dismissed', { rows: 3 })
})

it('shows a proposal from chat history as read only', () => {
  const utils = renderWithProviders(
    <CaptureReview proposal={{ ...proposal, status: 'submitted', expenseIds: ['e1', 'e2'] }} sessionId="s1" />,
  )

  expect(utils.getByText('Logged 2 spends')).toBeTruthy()
  expect(utils.queryByTestId('capture-review')).toBeNull()
})

it('records nothing server-side for the demo, which has no session', async () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} sessionId={null} />)

  fireEvent.press(utils.getByText('Not now'))
  expect(mockUpdateStatus).not.toHaveBeenCalled()
})
