import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
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

  /**
   * Render in edit mode with the holding already in the query cache. These
   * tests are about what gets submitted, not about the backfill arriving late,
   * so nothing should be able to land after the test's own toggle and revert
   * it. (Gating getHoldings and flushing one tick raced under CI load: React
   * Query's notification could arrive after the toggle.)
   */
  function renderEditing(holding: typeof existingHolding & Record<string, unknown>) {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(['holdings'], [holding])
    return renderWithProviders(<AddHoldingModal />, { queryClient })
  }

  it('submits only is_recurring/recurring_amount, never the base value, when turning recurring on', async () => {
    mockParams = { name: 'Bonds' }
    ;(updateHolding as jest.Mock).mockResolvedValue(undefined)

    const { getByRole, findByPlaceholderText, getByText } = renderEditing(existingHolding)

    fireEvent(getByRole('switch'), 'valueChange', true)
    fireEvent.changeText(await findByPlaceholderText('0'), '3600')
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
    ;(updateHolding as jest.Mock).mockResolvedValue(undefined)

    const { getByRole, getByText } = renderEditing({
      ...existingHolding,
      name: 'Mutual Fund SIP',
      is_recurring: 'true',
      recurring_amount: '2000',
    })
    expect(getByRole('switch').props.value).toBe(true)

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
