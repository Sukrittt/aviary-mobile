import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { CaptureProposal } from '@/src/api/ai'
import { GAP_ORIGIN } from '@/src/features/capture/captureRows'
import { CaptureReview } from './CaptureReview'

const mockAdd = jest.fn()
const mockSettled = jest.fn()
const mockTrack = jest.fn()

jest.mock('@/src/hooks/useExpenses', () => ({
  useAddExpense: () => ({ mutateAsync: mockAdd }),
  useRecentExpenses: () => ({ data: [] }),
}))
const ENVELOPES = [{ name: 'Travel', group: 'Everyday' }, { name: 'Sports', group: 'Fun' }, { name: 'Shopping', group: 'Fun' }]
const mockCategories: { data: { name: string; group: string }[] | undefined; isError: boolean } = { data: ENVELOPES, isError: false }
jest.mock('@/src/hooks/useCategories', () => ({ useCategories: () => mockCategories }))
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
  mockCategories.data = ENVELOPES
  mockCategories.isError = false
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
  const utils = renderWithProviders(<CaptureReview proposal={proposal} onSettled={mockSettled} />)

  expect(utils.getByDisplayValue('Auto')).toBeTruthy()
  expect(utils.getByLabelText('Envelope: Travel. Change it')).toBeTruthy()
  expect(utils.getByText('₹1,200 ÷ 6')).toBeTruthy()
  expect(utils.getByText('your share ₹200')).toBeTruthy()
  // Yesterday's row says so; today's rows don't.
  expect(utils.getByText('25 Sep')).toBeTruthy()
  expect(utils.getByLabelText('Pick an envelope')).toBeTruthy()
})

it('will not log until every row has an envelope', async () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} onSettled={mockSettled} />)

  fireEvent.press(utils.getByLabelText('Log 3 spends'))
  await flush()
  expect(mockAdd).not.toHaveBeenCalled()

  fireEvent.press(utils.getByLabelText('Pick an envelope'))
  fireEvent.press(utils.getByText('Choose Shopping'))
  expect(utils.getByLabelText('Envelope: Shopping. Change it')).toBeTruthy()
})

it('logs the kept rows with fixed client ids, the split share and source text', async () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} onSettled={mockSettled} />)

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
  expect(mockSettled).toHaveBeenCalledWith('submitted', ['e1', 'e2'])
  expect(mockTrack).toHaveBeenCalledWith('capture_logged', expect.objectContaining({ rows: 2, edited: 1, removed: 1 }))
})

it('plays the success check, then settles into a summary', async () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} onSettled={mockSettled} />)

  fireEvent.press(utils.getByLabelText('Remove Sneakers'))
  fireEvent.press(utils.getByLabelText('Log 2 spends'))
  await flush()
  expect(utils.queryByTestId('capture-summary')).toBeNull()
  // The rows stay on the card while the check draws, instead of leaving an empty card.
  expect(utils.getByDisplayValue('Auto')).toBeTruthy()
  expect(utils.getByDisplayValue('Turf')).toBeTruthy()

  await act(async () => {
    jest.advanceTimersByTime(1100)
  })
  expect(utils.getByText('Logged 2 spends · ₹440')).toBeTruthy()
})

it('keeps only the failed rows editable after a partial failure, and retries just those', async () => {
  mockAdd.mockResolvedValueOnce({ id: 'e1', pending: false }).mockRejectedValueOnce(new Error('400'))
  const utils = renderWithProviders(<CaptureReview proposal={proposal} onSettled={mockSettled} />)

  fireEvent.press(utils.getByLabelText('Remove Sneakers'))
  fireEvent.press(utils.getByLabelText('Log 2 spends'))
  await flush()

  expect(utils.getByText("Couldn't log 1 spend. Check your connection and try again.")).toBeTruthy()
  expect(utils.queryByDisplayValue('Auto')).toBeNull()
  expect(utils.getByDisplayValue('Turf')).toBeTruthy()
  expect(mockSettled).not.toHaveBeenCalled()

  mockAdd.mockResolvedValueOnce({ id: 'e2', pending: false })
  fireEvent.press(utils.getByLabelText('Log 1 spend'))
  await flush()

  expect(mockAdd).toHaveBeenLastCalledWith(expect.objectContaining({ client_id: 'capture:p1:r2' }))
  expect(mockSettled).toHaveBeenCalledWith('submitted', ['e1', 'e2'])
  await act(async () => {
    jest.advanceTimersByTime(1100)
  })
  expect(utils.getByText('Logged 2 spends · ₹440')).toBeTruthy()
})

it('counts a row queued offline as logged', async () => {
  mockAdd.mockResolvedValue({ pending: true })
  const utils = renderWithProviders(<CaptureReview proposal={proposal} onSettled={mockSettled} />)

  fireEvent.press(utils.getByLabelText('Remove Sneakers'))
  fireEvent.press(utils.getByLabelText('Log 2 spends'))
  await flush()
  await act(async () => {
    jest.advanceTimersByTime(1100)
  })

  expect(utils.getByText('Logged 2 spends · ₹440')).toBeTruthy()
  expect(mockSettled).toHaveBeenCalledWith('submitted', [])
})

it('dismisses without logging anything', () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} onSettled={mockSettled} />)

  fireEvent.press(utils.getByText('Not now'))

  expect(utils.getByText('Not logged')).toBeTruthy()
  expect(mockAdd).not.toHaveBeenCalled()
  expect(mockSettled).toHaveBeenCalledWith('dismissed', [])
  expect(mockTrack).toHaveBeenCalledWith('capture_dismissed', { source: 'text', rows: 3, logged: 0 })
})

it('settles as not logged once every row is removed, instead of an empty card', () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} onSettled={mockSettled} />)

  for (const item of ['Auto', 'Turf', 'Sneakers']) fireEvent.press(utils.getByLabelText(`Remove ${item}`))
  act(() => {
    jest.advanceTimersByTime(300)
  })

  expect(utils.getByText('Not logged')).toBeTruthy()
  expect(utils.queryByText('Nothing to log')).toBeNull()
  expect(mockSettled).toHaveBeenCalledWith('dismissed', [])
})

it('shows a proposal from chat history as read only', () => {
  const utils = renderWithProviders(
    <CaptureReview proposal={{ ...proposal, status: 'submitted', expenseIds: ['e1', 'e2'] }} onSettled={mockSettled} />,
  )

  expect(utils.getByText('Logged 2 spends')).toBeTruthy()
  expect(utils.queryByTestId('capture-review')).toBeNull()
})

it('works without anyone listening for the outcome', () => {
  const utils = renderWithProviders(<CaptureReview proposal={proposal} />)
  fireEvent.press(utils.getByText('Not now'))
  expect(utils.getByText('Not logged')).toBeTruthy()
})

it('logs a balance check estimate as balance_gap, as a card spend where it was one', async () => {
  const estimate: CaptureProposal = {
    id: 'c1',
    items: [
      { id: 'g1', item: 'Unlogged spends', amount: 2000, splitWays: 1, date: '2026-09-26', category: 'Travel', categoryConfidence: null, paymentMethod: 'bank' },
      { id: 'g2', item: 'Unlogged card spends', amount: 1800, splitWays: 1, date: '2026-09-26', category: 'Sports', categoryConfidence: null, paymentMethod: 'credit_card' },
    ],
    skipped: [],
    unparsed: [],
  }
  const utils = renderWithProviders(<CaptureReview proposal={estimate} origin={GAP_ORIGIN} onSettled={mockSettled} />)

  fireEvent.press(utils.getByLabelText('Log 2 spends'))
  await flush()

  expect(mockAdd.mock.calls[0][0]).toEqual({
    item: 'Unlogged spends',
    amount_inr: '2000',
    category: 'Travel',
    date: '2026-09-26',
    notes: 'Estimated from a balance check',
    payment_method: 'bank',
    source: 'balance_gap',
    client_id: 'gap:c1:g1',
  })
  expect(mockAdd.mock.calls[1][0]).toMatchObject({ payment_method: 'credit_card', client_id: 'gap:c1:g2' })
  expect(mockTrack).toHaveBeenCalledWith('capture_logged', expect.objectContaining({ source: 'balance_gap' }))
})

it('locks a failed row to retry as it was, and Not now keeps the spends that made it', async () => {
  mockAdd.mockResolvedValueOnce({ id: 'e1', pending: false }).mockRejectedValueOnce(new Error('400'))
  const utils = renderWithProviders(<CaptureReview proposal={proposal} onSettled={mockSettled} />)
  fireEvent.press(utils.getByLabelText('Remove Sneakers'))
  fireEvent.press(utils.getByLabelText('Log 2 spends'))
  await flush()

  expect(utils.getByDisplayValue('Turf').props.editable).toBe(false)
  fireEvent.press(utils.getByText('Not now'))
  expect(mockSettled).toHaveBeenCalledWith('submitted', ['e1'])
  expect(utils.getByText('Logged 1 spend · ₹240')).toBeTruthy()
})

it('names what blocks Log, and shows an envelope emoji once', () => {
  mockCategories.data = [...ENVELOPES, { name: '🛵 Travel', group: 'Everyday' }]
  const utils = renderWithProviders(
    <CaptureReview
      proposal={{ ...proposal, items: [{ ...proposal.items[0], category: '🛵 Travel' }, proposal.items[2]] }}
      onSettled={mockSettled}
    />,
  )
  expect(utils.getByText('Pick an envelope for Sneakers to log these.')).toBeTruthy()
  expect(utils.getByText('🛵')).toBeTruthy()
  expect(utils.getByText('Travel')).toBeTruthy()
})

it('makes a row whose envelope was deleted pick a new one', () => {
  mockCategories.data = [{ name: 'Sports', group: 'Fun' }]
  const utils = renderWithProviders(
    <CaptureReview proposal={{ ...proposal, items: [proposal.items[0]] }} onSettled={mockSettled} />,
  )
  expect(utils.getByLabelText('Pick an envelope')).toBeTruthy()
  expect(utils.getByText('Pick an envelope for Auto to log these.')).toBeTruthy()
})

it("won't log before the envelope list is in, unless it failed to load", async () => {
  mockCategories.data = undefined
  const one = { ...proposal, items: [proposal.items[0]] }
  const utils = renderWithProviders(<CaptureReview proposal={one} onSettled={mockSettled} />)
  fireEvent.press(utils.getByLabelText('Log 1 spend'))
  await flush()
  expect(mockAdd).not.toHaveBeenCalled()

  utils.unmount()
  mockCategories.isError = true
  const retry = renderWithProviders(<CaptureReview proposal={one} onSettled={mockSettled} />)
  fireEvent.press(retry.getByLabelText('Log 1 spend'))
  await flush()
  expect(mockAdd).toHaveBeenCalled()
})

it('hides the logged pill where a reply answers the log instead', async () => {
  const utils = renderWithProviders(
    <CaptureReview proposal={{ ...proposal, items: [proposal.items[0]] }} onSettled={mockSettled} loggedSummary={false} />,
  )
  fireEvent.press(utils.getByLabelText('Log 1 spend'))
  await flush()
  await act(async () => {
    jest.advanceTimersByTime(1100)
  })
  expect(utils.queryByTestId('capture-summary')).toBeNull()
  expect(utils.queryByTestId('capture-review')).toBeNull()
})
