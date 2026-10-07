import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { BalanceStatus } from '@/src/api/balanceChecks'
import type { CaptureProposal } from '@/src/api/ai'
import type { RowOrigin } from '@/src/features/capture/captureRows'
import BalanceCheckModal from './balance-check'

const mockBack = jest.fn()
const mockStatus = jest.fn()
const mockSubmit = jest.fn()
const mockResolve = jest.fn()
const mockTrack = jest.fn()

const mockPreventRemove = jest.fn()
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: (...args: unknown[]) => mockPreventRemove(...args) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }))
jest.mock('@/src/api/balanceChecks', () => ({
  getBalanceStatus: () => mockStatus(),
  submitBalance: (...args: unknown[]) => mockSubmit(...args),
  resolveBalanceCheck: (...args: unknown[]) => mockResolve(...args),
}))
jest.mock('@/src/lib/analytics', () => ({ track: (...args: unknown[]) => mockTrack(...args) }))
jest.mock('@/src/components/brain/CaptureReview', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    CaptureReview: ({ proposal, origin, onSettled }: { proposal: CaptureProposal; origin: RowOrigin; onSettled: (s: string, ids: string[]) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onSettled('submitted', ['e1'])}>
        <Text>{`Review ${proposal.items.map((i) => i.category).join(', ')} as ${origin.source}`}</Text>
      </Pressable>
    ),
  }
})

const status = (over: Partial<BalanceStatus> = {}): BalanceStatus => ({
  due: true,
  open: false,
  expected: 48000,
  anchor: { timestamp: '2026-09-20T10:00:00+05:30', date: '2026-09-20', balance: 50000 },
  loggedPct: null,
  accounts: [],
  ...over,
})

const measured = (kind: 'square' | 'unlogged' | 'surplus', gap: number) => ({
  id: 'c2',
  kind,
  balance: 48000 - gap,
  expected: 48000,
  logged: 2000,
  gap,
  tolerance: 200,
  cardSpendRecent: 0,
  loggedPct: kind === 'square' ? 100 : null,
})

const estimate: CaptureProposal = {
  id: 'c2',
  items: [
    { id: 'g1', item: 'Unlogged spends', amount: 2000, splitWays: 1, date: '2026-09-27', category: 'Food', categoryConfidence: null, paymentMethod: 'bank' },
    { id: 'g2', item: 'Unlogged spends', amount: 1400, splitWays: 1, date: '2026-09-27', category: 'Travel', categoryConfidence: null, paymentMethod: 'bank' },
  ],
  skipped: [],
  unparsed: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ legacyFakeTimers: false })
  mockStatus.mockResolvedValue(status())
})

afterEach(() => {
  jest.useRealTimers()
})

async function renderModal() {
  const utils = renderWithProviders(<BalanceCheckModal />)
  await waitFor(() => expect(utils.getByText('WHERE YOU PAY FROM')).toBeTruthy())
  return utils
}

function typeBalance(utils: Awaited<ReturnType<typeof renderModal>>, digits: string) {
  fireEvent(utils.getByLabelText('Delete'), 'longPress')
  for (const d of digits) fireEvent.press(utils.getByLabelText(d))
}

async function press(utils: Awaited<ReturnType<typeof renderModal>>, label: string) {
  await act(async () => {
    fireEvent.press(utils.getByLabelText(label))
  })
}

it('starts with the first balance and saves it as the starting point', async () => {
  mockStatus.mockResolvedValue(status({ anchor: null, expected: null }))
  mockSubmit.mockResolvedValue({ id: 'c1', kind: 'baseline', reason: 'first', balance: 50000 })
  const utils = await renderModal()

  expect(utils.getByText('Your starting balance')).toBeTruthy()
  typeBalance(utils, '50000')
  await press(utils, 'Save')

  expect(mockSubmit).toHaveBeenCalledWith([{ name: 'Bank', balance: 50000 }])
  expect(utils.getByText('Starting point saved. See you next week.')).toBeTruthy()
  expect(mockTrack).toHaveBeenCalledWith('balance_checked', { kind: 'baseline', accounts: 1 })
  await act(async () => {
    jest.advanceTimersByTime(1100)
  })
  expect(mockBack).toHaveBeenCalled()
})

it('shows the balance it expects as a hint, never typed in for the user', async () => {
  mockSubmit.mockResolvedValue(measured('square', 0))
  const utils = await renderModal()

  expect(utils.getByText('We expect about ₹48,000.')).toBeTruthy()
  expect(utils.getByLabelText('Check').props.accessibilityState.disabled).toBe(true)
  typeBalance(utils, '48000')
  await press(utils, 'Check')

  expect(mockSubmit).toHaveBeenCalledWith([{ name: 'Bank', balance: 48000 }])
  expect(utils.getByText("All square. You've logged everything.")).toBeTruthy()
})

it('totals several accounts, named once and asked about again', async () => {
  mockStatus.mockResolvedValue(status({ accounts: ['HDFC'] }))
  mockSubmit.mockResolvedValue(measured('square', 0))
  const utils = await renderModal()

  typeBalance(utils, '40000')
  fireEvent.press(utils.getByText('+ Add another account'))
  fireEvent.changeText(utils.getByLabelText('Account 2 name'), 'Slice')
  typeBalance(utils, '8000')
  expect(utils.getByText('Total ₹48,000')).toBeTruthy()
  expect(utils.getByText('We expect about ₹48,000 in total.')).toBeTruthy()
  await press(utils, 'Check')

  expect(mockSubmit).toHaveBeenCalledWith([{ name: 'HDFC', balance: 40000 }, { name: 'Slice', balance: 8000 }])
  expect(mockTrack).toHaveBeenCalledWith('balance_checked', { kind: 'square', accounts: 2 })
})

it('edits whichever account is picked, and waits for every balance', async () => {
  mockStatus.mockResolvedValue(status({ accounts: ['HDFC', 'Slice'] }))
  const utils = await renderModal()

  typeBalance(utils, '40000')
  expect(utils.getByLabelText('Check').props.accessibilityState.disabled).toBe(true)
  fireEvent.press(utils.getByLabelText('Slice balance'))
  typeBalance(utils, '8000')
  fireEvent.press(utils.getByLabelText('HDFC balance'))
  typeBalance(utils, '41000')
  expect(utils.getByText('Total ₹49,000')).toBeTruthy()

  fireEvent.press(utils.getByLabelText('Remove Slice'))
  expect(utils.queryByLabelText('Slice balance')).toBeNull()
  expect(utils.getByLabelText('Check').props.accessibilityState.disabled).toBe(false)
})

it('asks for distinct names before saving', async () => {
  mockStatus.mockResolvedValue(status({ accounts: ['HDFC'] }))
  const utils = await renderModal()
  typeBalance(utils, '40000')
  fireEvent.press(utils.getByText('+ Add another account'))
  fireEvent.changeText(utils.getByLabelText('Account 2 name'), 'hdfc')
  typeBalance(utils, '8000')
  await press(utils, 'Check')

  expect(utils.getByText('Give each account its own name.')).toBeTruthy()
  expect(mockSubmit).not.toHaveBeenCalled()
})

it('starts over when the accounts change', async () => {
  mockSubmit.mockResolvedValue({ id: 'c3', kind: 'baseline', reason: 'accounts_changed', balance: 59000 })
  const utils = await renderModal()
  typeBalance(utils, '59000')
  await press(utils, 'Check')
  expect(utils.getByText("New starting point saved. We'll compare next week.")).toBeTruthy()
})

it('turns spends not logged into estimates on the review card', async () => {
  mockSubmit.mockResolvedValue(measured('unlogged', 3400))
  mockResolve.mockResolvedValue({ status: 'resolved', forgotten: 3400, cardShortfall: 0, proposal: estimate, loggedPct: 37 })
  const utils = await renderModal()
  typeBalance(utils, '44600')
  await press(utils, 'Check')

  expect(utils.getByText("₹3,400 left your account that you haven't logged.")).toBeTruthy()
  await press(utils, "Spends I didn't log")

  expect(mockResolve).toHaveBeenCalledWith('c2', {})
  expect(mockTrack).toHaveBeenCalledWith('balance_resolved', { reason: 'unlogged' })
  expect(mockTrack).toHaveBeenCalledWith('balance_checked', { kind: 'unlogged', accounts: 1 })
  fireEvent.press(utils.getByText('Review Food, Travel as balance_gap'))
  expect(utils.getByText("You'd logged 37% of what left your account yourself.")).toBeTruthy()
  fireEvent.press(utils.getByText('Done'))
  expect(mockBack).toHaveBeenCalled()
})

it('takes a card bill and moved money out of the gap, and flags card spends the bill says were missed', async () => {
  mockSubmit.mockResolvedValue(measured('unlogged', 11000))
  const card: CaptureProposal = {
    ...estimate,
    items: [{ id: 'g1', item: 'Unlogged card spends', amount: 2000, splitWays: 1, date: '2026-09-27', category: 'Shopping', categoryConfidence: null, paymentMethod: 'credit_card' }],
  }
  mockResolve.mockResolvedValue({ status: 'resolved', forgotten: 500, cardShortfall: 2000, proposal: card, loggedPct: 80 })
  const utils = await renderModal()
  typeBalance(utils, '37000')
  await press(utils, 'Check')
  await press(utils, 'A mix')

  fireEvent.changeText(utils.getByLabelText('Card bill amount'), '8000')
  fireEvent.changeText(utils.getByLabelText('Moved, lent or cash amount'), '2500')
  expect(utils.getByText("The other ₹500 counts as spends you didn't log.")).toBeTruthy()
  await press(utils, 'Continue')

  expect(mockResolve).toHaveBeenCalledWith('c2', { cardBill: 8000, movedOut: 2500 })
  expect(mockTrack).toHaveBeenCalledWith('balance_resolved', { reason: 'mix' })
  expect(utils.getByText('Your card bill was ₹2,000 more than the card spends you logged, so those are in here too.')).toBeTruthy()
  expect(utils.getByText('Review Shopping as balance_gap')).toBeTruthy()
})

it('closes with nothing to log when the whole gap was moved or lent', async () => {
  mockSubmit.mockResolvedValue(measured('unlogged', 5000))
  mockResolve.mockResolvedValue({ status: 'resolved', forgotten: 0, cardShortfall: 0, proposal: null, loggedPct: 100 })
  const utils = await renderModal()
  typeBalance(utils, '43000')
  await press(utils, 'Check')
  await press(utils, 'Moved, lent or cash')

  expect(utils.queryByLabelText('Card bill amount')).toBeNull()
  fireEvent.changeText(utils.getByLabelText('Moved, lent or cash amount'), '5000')
  expect(utils.getByText('That covers it.')).toBeTruthy()
  await press(utils, 'Continue')

  expect(mockResolve).toHaveBeenCalledWith('c2', { movedOut: 5000 })
  expect(utils.getByText('Got it. Nothing to log.')).toBeTruthy()
  await act(async () => {
    jest.advanceTimersByTime(1100)
  })
  expect(mockBack).toHaveBeenCalled()
})

it('will not continue without a valid amount', async () => {
  mockSubmit.mockResolvedValue(measured('unlogged', 5000))
  const utils = await renderModal()
  typeBalance(utils, '43000')
  await press(utils, 'Check')
  await press(utils, 'Card bill')

  fireEvent.changeText(utils.getByLabelText('Card bill amount'), 'abc')
  await press(utils, 'Continue')
  expect(mockResolve).not.toHaveBeenCalled()
})

it('records where extra money came from in one tap, and logs nothing', async () => {
  mockSubmit.mockResolvedValue(measured('surplus', -7000))
  mockResolve.mockResolvedValue({ status: 'resolved', forgotten: 0, cardShortfall: 0, proposal: null, loggedPct: 100 })
  const utils = await renderModal()
  typeBalance(utils, '55000')
  await press(utils, 'Check')

  expect(utils.getByText("You've got ₹7,000 more than we expected.")).toBeTruthy()
  await press(utils, 'Income or salary')

  expect(mockResolve).toHaveBeenCalledWith('c2', { moneyIn: 'income' })
  expect(mockTrack).toHaveBeenCalledWith('balance_resolved', { reason: 'income' })
  expect(utils.getByText('Got it. Nothing to log.')).toBeTruthy()
  await act(async () => {
    jest.advanceTimersByTime(1100)
  })
  expect(mockBack).toHaveBeenCalled()
})

it('shows a written message, never the server error, when saving fails', async () => {
  mockSubmit.mockRejectedValue(new Error('Failed to save balance: 503'))
  const utils = await renderModal()
  typeBalance(utils, '48000')
  await press(utils, 'Check')

  expect(utils.getByText("Couldn't save your balance. Check your connection and try again.")).toBeTruthy()
  expect(utils.queryByText(/503/)).toBeNull()
  expect(mockBack).not.toHaveBeenCalled()
})

it('shows a written message when an answer fails, and lets the user try again', async () => {
  mockSubmit.mockResolvedValue(measured('surplus', -7000))
  mockResolve.mockRejectedValueOnce(new Error('Failed to resolve balance check: 500'))
  const utils = await renderModal()
  typeBalance(utils, '55000')
  await press(utils, 'Check')
  await press(utils, 'Refund or paid back')

  expect(utils.getByText("Couldn't save that. Check your connection and try again.")).toBeTruthy()
  mockResolve.mockResolvedValue({ status: 'resolved', forgotten: 0, cardShortfall: 0, proposal: null, loggedPct: 100 })
  await press(utils, 'Refund or paid back')
  expect(utils.getByText('Got it. Nothing to log.')).toBeTruthy()
})

it('asks to finish a check with an unexplained gap', async () => {
  mockStatus.mockResolvedValue(status({ open: true }))
  const utils = await renderModal()
  expect(utils.getByText("Let's finish your last check")).toBeTruthy()
})

it('keeps the estimates open until they are logged or put off', async () => {
  mockSubmit.mockResolvedValue(measured('unlogged', 3400))
  mockResolve.mockResolvedValue({ status: 'resolved', forgotten: 3400, cardShortfall: 0, proposal: estimate, loggedPct: 37 })
  const utils = await renderModal()
  typeBalance(utils, '44600')
  await press(utils, 'Check')
  await press(utils, "Spends I didn't log")

  expect(mockPreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function))
  expect(utils.getByText('Log them, or tap Not now. Closing would lose these.')).toBeTruthy()
  fireEvent.press(utils.getByText('Review Food, Travel as balance_gap'))
  expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function))
})

it('goes back from the amounts to the gap question', async () => {
  mockSubmit.mockResolvedValue(measured('unlogged', 3400))
  const utils = await renderModal()
  typeBalance(utils, '44600')
  await press(utils, 'Check')
  await press(utils, 'Card bill')
  fireEvent.press(utils.getByText('Pick something else'))
  expect(utils.getByText("₹3,400 left your account that you haven't logged.")).toBeTruthy()
})
