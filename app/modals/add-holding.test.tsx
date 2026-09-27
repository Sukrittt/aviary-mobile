import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { addHolding, getHoldings, updateHolding } from '@/src/api/holdings'
import { HoldingWriteError } from '@/src/lib/holdingConflict'
import AddHoldingModal from './add-holding'

jest.mock('@/src/api/holdings', () => ({
  getHoldings: jest.fn(),
  addHolding: jest.fn(),
  updateHolding: jest.fn(),
  deleteHolding: jest.fn(),
  performHoldingAction: jest.fn(),
}))

let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  ;(getHoldings as jest.Mock).mockResolvedValue([])
})

// "Add Holding" also appears as the screen's header title — the confirm
// button is the second match.
function pressSubmit(getAllByText: (t: string) => any[]) {
  fireEvent.press(getAllByText('Add Holding')[1])
}

describe('add mode', () => {
  it('submits a plain holding with the monthly toggle off', async () => {
    ;(addHolding as jest.Mock).mockResolvedValue(undefined)
    const { getByPlaceholderText, getAllByText } = renderWithProviders(<AddHoldingModal />)

    fireEvent.changeText(getByPlaceholderText('e.g. Stocks'), 'Stocks')
    fireEvent.changeText(getByPlaceholderText('0'), '1000')
    pressSubmit(getAllByText)

    await waitFor(() =>
      expect(addHolding).toHaveBeenCalledWith({
        name: 'Stocks',
        type: 'Other',
        value: '1000',
        is_recurring: false,
        recurring_amount: undefined,
      }),
    )
  })

  it('submits an independent monthly contribution once "Repeat monthly" is on, not a copy of the starting value', async () => {
    const { getByPlaceholderText, getAllByPlaceholderText, getAllByText, getByRole } = renderWithProviders(
      <AddHoldingModal />,
    )

    fireEvent.changeText(getByPlaceholderText('e.g. Stocks'), 'Mutual Fund SIP')
    fireEvent.changeText(getAllByPlaceholderText('0')[0], '12000')
    fireEvent(getByRole('switch'), 'valueChange', true)
    fireEvent.changeText(getAllByPlaceholderText('0')[1], '3600')

    pressSubmit(getAllByText)

    await waitFor(() =>
      expect(addHolding).toHaveBeenCalledWith({
        name: 'Mutual Fund SIP',
        type: 'Other',
        value: '12000',
        is_recurring: true,
        recurring_amount: '3600',
      }),
    )
  })
})

/** A promise whose resolution this test controls, to hold an async call open on demand. */
/** Whether the pressable around a label is disabled (the label's nearest ancestor with an accessibilityState). */
function saveDisabled(label: { parent: unknown }): boolean {
  let node = label as { parent: unknown; props?: { accessibilityState?: { disabled?: boolean } } } | null
  while (node) {
    if (node.props?.accessibilityState) return !!node.props.accessibilityState.disabled
    node = node.parent as typeof node
  }
  return false
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('edit mode', () => {
  const existingHolding = {
    name: 'Bonds',
    type: 'Bonds',
    value: '48000',
    updated_at: '2026-01-01T00:00:00.000Z',
    is_recurring: 'false',
    recurring_amount: '',
    recurring_day: '',
    recurring_last_run: '',
    version: 4,
  }

  it('hides the name/type/starting-value fields and backfills the recurring state from the cached holding', async () => {
    mockParams = { name: 'Bonds' }
    const holdingsGate = deferred<(typeof existingHolding)[]>()
    ;(getHoldings as jest.Mock).mockReturnValue(holdingsGate.promise)

    const { queryByPlaceholderText, findByText, getByText } = renderWithProviders(<AddHoldingModal />)
    await findByText('Bonds')

    // See the notifyManager comment below — a real (macrotask) tick is
    // needed for React Query's batched notification to land inside act().
    await act(async () => {
      holdingsGate.resolve([existingHolding])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getByText('Save changes')).toBeTruthy()
    expect(queryByPlaceholderText('e.g. Stocks')).toBeNull()
  })

  it('submits only is_recurring/recurring_amount, never the base value, when turning recurring on', async () => {
    mockParams = { name: 'Bonds' }
    // `{origName}` (the header's "Bonds" label) renders immediately from the
    // route param, before getHoldings() resolves — so a plain findByText('Bonds')
    // doesn't prove the backfill effect has already run. Gate getHoldings()
    // explicitly and flush it before interacting, or the backfill can land
    // *after* this test's own toggle and silently revert it.
    const holdingsGate = deferred<(typeof existingHolding)[]>()
    ;(getHoldings as jest.Mock).mockReturnValue(holdingsGate.promise)
    ;(updateHolding as jest.Mock).mockResolvedValue(undefined)

    const { getByRole, getByPlaceholderText, queryByPlaceholderText, findByText, getByText } = renderWithProviders(<AddHoldingModal />)
    await findByText('Bonds')

    // React Query's notifyManager batches observer notifications via a real
    // setTimeout(0), not a microtask — awaiting only Promise.resolve() here
    // returns before that timeout fires, so the backfill effect still hasn't
    // run. A real (macrotask) tick is required to let it land.
    await act(async () => {
      holdingsGate.resolve([existingHolding])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Even a real tick isn't always enough on a loaded CI runner: the backfill
    // can still land after the toggle and switch it back off. Save only enables
    // once the backfill has run (it needs the loaded base and version) *and*
    // the toggle survived, and the backfill runs once, so retrying until then
    // leaves the form stable. Checked with the query deferred to after the toggle.
    await waitFor(() => {
      if (!queryByPlaceholderText('0')) fireEvent(getByRole('switch'), 'valueChange', true)
      fireEvent.changeText(getByPlaceholderText('0'), '3600')
      expect(saveDisabled(getByText('Save changes'))).toBe(false)
    })
    fireEvent.press(getByText('Save changes'))

    await waitFor(() =>
      expect(updateHolding).toHaveBeenCalledWith(
        'Bonds',
        { is_recurring: true, recurring_amount: '3600' },
        4,
      ),
    )
  })

  it('submits is_recurring: false with no amount when turning an existing SIP off', async () => {
    mockParams = { name: 'Mutual Fund SIP' }
    const holdingsGate = deferred<(typeof existingHolding & { is_recurring: string; recurring_amount: string })[]>()
    ;(getHoldings as jest.Mock).mockReturnValue(holdingsGate.promise)
    ;(updateHolding as jest.Mock).mockResolvedValue(undefined)

    const { getByRole, findByText, getByText } = renderWithProviders(<AddHoldingModal />)
    await findByText('Mutual Fund SIP')

    await act(async () => {
      holdingsGate.resolve([
        { ...existingHolding, name: 'Mutual Fund SIP', is_recurring: 'true', recurring_amount: '2000' },
      ])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    fireEvent(getByRole('switch'), 'valueChange', false)
    fireEvent.press(getByText('Save changes'))

    await waitFor(() =>
      expect(updateHolding).toHaveBeenCalledWith('Mutual Fund SIP', { is_recurring: false }, 4),
    )
  })

  it('preserves the draft, rebases to the latest version, and requires a second save', async () => {
    mockParams = { name: 'Bonds' }
    const original = { ...existingHolding, is_recurring: 'true', recurring_amount: '100' }
    const latest = { ...original, value: '50000', recurring_amount: '200', version: 5 }
    ;(getHoldings as jest.Mock).mockResolvedValue([original])
    ;(updateHolding as jest.Mock)
      .mockRejectedValueOnce(new HoldingWriteError(409, 'Holding changed', latest))
      .mockResolvedValueOnce(undefined)

    const screen = renderWithProviders(<AddHoldingModal />)
    const amount = await screen.findByDisplayValue('100')
    fireEvent.changeText(amount, '150')
    fireEvent.press(screen.getByText('Save changes'))

    expect(await screen.findByText('This holding was updated')).toBeTruthy()
    expect(screen.getByLabelText('Monthly contribution, latest saved: ₹200 monthly')).toBeTruthy()
    expect(screen.getByLabelText('Monthly contribution, with your changes: ₹150 monthly')).toBeTruthy()
    expect(updateHolding).toHaveBeenCalledTimes(1)
    expect(updateHolding).toHaveBeenLastCalledWith(
      'Bonds',
      { is_recurring: true, recurring_amount: '150' },
      4,
    )

    fireEvent.press(screen.getByRole('button', { name: 'Continue with my changes' }))
    expect(screen.getByDisplayValue('150')).toBeTruthy()
    expect(updateHolding).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Save changes'))
    await waitFor(() => expect(updateHolding).toHaveBeenCalledTimes(2))
    expect(updateHolding).toHaveBeenLastCalledWith(
      'Bonds',
      { is_recurring: true, recurring_amount: '150' },
      5,
    )
  })
})
