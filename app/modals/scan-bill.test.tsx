import ExpenseAddedScreen from './expense-added'
import { enqueue, remove } from '@/src/lib/pendingExpenses'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getCategories } from '@/src/api/categories'
import { getGroups } from '@/src/api/groups'
import { getExpenses, mintExpensePayload, postExpensePayload, deleteExpense } from '@/src/api/expenses'
import { scanBill } from '@/src/api/scan'
import { saveBillScan } from '@/src/api/bills'
import { setPendingScanImage, takePendingScanImage } from '@/src/lib/pendingScanImage'
import { todayLocal } from '@/src/lib/date'
import ScanBillScreen from './scan-bill'

jest.mock('@/src/api/categories', () => ({
  getCategories: jest.fn(),
  addCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
  moveCategory: jest.fn(),
}))
// CategoryPickerSheet (rendered by the review screen) groups by this, so it
// needs a resolved value or every category is dropped from the list.
jest.mock('@/src/api/groups', () => ({
  getGroups: jest.fn(),
}))
jest.mock('@/src/api/expenses', () => ({
  getExpenses: jest.fn(),
  getRecentExpenses: jest.fn(async () => ({ rows: [], lastSpent: {} })),
  mintExpensePayload: jest.fn((row) => ({ ...row, client_id: 'client-1' })),
  postExpensePayload: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
}))
jest.mock('@/src/api/scan', () => ({ scanBill: jest.fn() }))
jest.mock('@/src/api/bills', () => ({ saveBillScan: jest.fn() }))
jest.mock('@/src/lib/pendingExpenses', () => ({ enqueue: jest.fn(), remove: jest.fn(async () => {}) }))
jest.mock('@/src/api/budgets', () => ({ getBudgets: jest.fn(async () => []) }))
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn() }) }))
jest.mock('@/src/lib/reviewPrompt', () => ({ recordLogAndMaybeAsk: jest.fn(async () => false) }))

let mockParams: Record<string, string> = {}
const mockBack = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

const CATEGORIES = [{ name: 'Groceries', group: 'Essentials' }]

// total (900) exceeds the item sum (860) by 40 — a delivery-fee gap that's
// tracked separately from the items now and split across a people-count
// (default 2), rather than folded into the item list as an extra row.
const SCAN_RESULT = {
  merchant: 'Blinkit',
  total: 900,
  date: '2026-08-29',
  category: 'Groceries',
  items: [
    { name: 'Milk', price: 60, qty: 1 },
    { name: 'Pizza', price: 800, qty: 1 },
  ],
}

/** Flushes past react-query's internal promise chain (fetch -> setData -> notify -> re-render) so a resolved query (categories) lands in state before the next assertion — a single micro/macrotask hop isn't reliably deep enough. */
async function flushCategories() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getCategories as jest.Mock).mockResolvedValue(CATEGORIES)
  ;(getGroups as jest.Mock).mockResolvedValue(['Essentials'])
  ;(getExpenses as jest.Mock).mockResolvedValue([])
  ;(saveBillScan as jest.Mock).mockResolvedValue(undefined)
  // The photo is picked on the "more" screen before this route ever mounts —
  // simulate that handoff the same way, via the real pendingScanImage module.
  setPendingScanImage({ base64: 'abc123', mimeType: 'image/png' })
})

describe('ScanBillScreen', () => {
  it('goes back when no handed-off image is waiting', async () => {
    takePendingScanImage() // drain the one beforeEach queued, leaving nothing pending

    renderWithProviders(<ScanBillScreen />)
    await waitFor(() => expect(mockBack).toHaveBeenCalled())
  })

  it('scans, reviews the fee-adjusted share, and confirms through the breakdown screen', async () => {
    ;(scanBill as jest.Mock).mockResolvedValue(SCAN_RESULT)
    ;(postExpensePayload as jest.Mock).mockResolvedValue({ id: 'e1', timestamp: '2026-08-29T10:00:00' })

    const { getByText, getByDisplayValue, getByLabelText } = renderWithProviders(<ScanBillScreen />)

    await flushCategories()
    await waitFor(() => expect(scanBill).toHaveBeenCalled())

    expect((scanBill as jest.Mock).mock.calls[0][0]).toEqual({
      image: 'abc123',
      mimeType: 'image/png',
      categories: ['Groceries'],
    })

    // Items default "mine" (60+800=860); the 40 fee gap defaults to a 2-person
    // split (20), so my share is 880, not the full 900. The hero amount is an
    // odometer (AmountText animate) — its digits render as separate Text nodes,
    // so it's queried by its accessibilityLabel (the full formatted string)
    // rather than getByText.
    await waitFor(() => expect(getByLabelText('₹880')).toBeTruthy())
    expect(getByText('of ₹900 bill')).toBeTruthy()
    expect(getByDisplayValue('Blinkit')).toBeTruthy()

    fireEvent.press(getByText('Review ₹880 →'))

    await waitFor(() => expect(getByText('Log ₹880 to Groceries')).toBeTruthy())
    fireEvent.press(getByText('Log ₹880 to Groceries'))

    await waitFor(() =>
      expect(mintExpensePayload).toHaveBeenCalledWith({
        item: 'Blinkit',
        amount_inr: '880',
        category: 'Groceries',
        date: todayLocal(),
        payment_method: 'bank',
      }),
    )
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/modals/expense-added', params: expect.objectContaining({ amount: '880' }) }),
    )

    // react-query v5 calls mutationFn with a second (internal, undocumented)
    // context arg, so this checks the first call arg directly rather than
    // toHaveBeenCalledWith (which requires every arg to match).
    await waitFor(() =>
      expect((saveBillScan as jest.Mock).mock.calls[0]?.[0]).toMatchObject({
        image: 'abc123',
        mimeType: 'image/png',
        merchant: 'Blinkit',
        category: 'Groceries',
        date: todayLocal(),
        total: 900,
        my_share: 880,
        expense_id: 'e1',
        items: [
          { name: 'Milk', price: 60, qty: 1, divisor: 1 },
          { name: 'Pizza', price: 800, qty: 1, divisor: 1 },
        ],
      }),
    )
  })

  it('recomputes the share when the fee people-count changes', async () => {
    ;(scanBill as jest.Mock).mockResolvedValue(SCAN_RESULT)
    const { getByText, getByLabelText } = renderWithProviders(<ScanBillScreen />)

    await flushCategories()
    await waitFor(() => expect(getByLabelText('₹880')).toBeTruthy())

    // 40 fee split 3 ways = 13.33, on top of the unchanged 860 of items.
    fireEvent.press(getByText('3'))
    await waitFor(() => expect(getByLabelText('₹873.33')).toBeTruthy())
  })

  it('applies a bulk split to multiple selected items', async () => {
    ;(scanBill as jest.Mock).mockResolvedValue(SCAN_RESULT)
    const { getByText, getByLabelText } = renderWithProviders(<ScanBillScreen />)

    await flushCategories()
    await waitFor(() => expect(getByLabelText('₹880')).toBeTruthy())

    fireEvent.press(getByText('Select'))
    fireEvent.press(getByText('Milk'))
    fireEvent.press(getByText('Pizza'))
    fireEvent.press(getByText('÷2'))

    // Both items now halved: (60/2 + 800/2) + the unchanged 20 fee share = 450.
    await waitFor(() => expect(getByLabelText('₹450')).toBeTruthy())
  })

  it('keeps split choices when the categories query refetches mid-review', async () => {
    ;(scanBill as jest.Mock).mockResolvedValue(SCAN_RESULT)
    let queryClient!: QueryClient
    function GrabQueryClient() {
      queryClient = useQueryClient()
      return null
    }
    const { getByText, getByLabelText } = renderWithProviders(
      <>
        <GrabQueryClient />
        <ScanBillScreen />
      </>,
    )

    await flushCategories()
    await waitFor(() => expect(getByLabelText('₹880')).toBeTruthy())

    fireEvent.press(getByText('Select'))
    fireEvent.press(getByText('Milk'))
    fireEvent.press(getByText('Pizza'))
    fireEvent.press(getByText('÷2'))
    await waitFor(() => expect(getByLabelText('₹450')).toBeTruthy())

    // What a token refresh used to do app-wide: drop every cached query. The
    // next render rebuilds categories from scratch, so isLoading flips
    // true -> false again, which re-ran the scan and reset every divisor.
    act(() => queryClient.clear())
    fireEvent.press(getByText('Select'))
    await flushCategories()

    expect(scanBill).toHaveBeenCalledTimes(1)
    expect(getByLabelText('₹450')).toBeTruthy()
  })

  it('lets a scanned fee/discount line be expanded, edited, and removed', async () => {
    ;(scanBill as jest.Mock).mockResolvedValue({
      ...SCAN_RESULT,
      total: 900,
      items: [...SCAN_RESULT.items, { name: 'Delivery Fee', price: 40, qty: 1 }],
    })
    const { getByText, getByLabelText, queryByText } = renderWithProviders(<ScanBillScreen />)

    await flushCategories()

    const collapsedFeeName = await waitFor(() => getByText('Delivery Fee'))
    expect(collapsedFeeName.props.numberOfLines).toBe(1)

    // Header count reflects only the 2 real product items.
    expect(getByText('2 items · scanned just now')).toBeTruthy()

    // Pooled fee (40) split across the default 2 people = 20, on top of the
    // unchanged 860 of product items.
    await waitFor(() => expect(getByLabelText('₹880')).toBeTruthy())

    fireEvent.press(getByLabelText('Show full item name: Delivery Fee'))
    fireEvent.changeText(getByLabelText('Item name'), 'Service Fee')
    fireEvent.changeText(getByLabelText('Fee amount for Service Fee'), '20')
    await waitFor(() => expect(getByLabelText('₹870')).toBeTruthy())

    fireEvent.press(getByLabelText('Remove Service Fee'))
    await waitFor(() => expect(getByLabelText('₹860')).toBeTruthy())
    expect(queryByText('Fees & discount')).toBeNull()
  })

  it('filters items by search query', async () => {
    ;(scanBill as jest.Mock).mockResolvedValue(SCAN_RESULT)
    const { getByLabelText, getByPlaceholderText, queryByText } = renderWithProviders(<ScanBillScreen />)

    await flushCategories()
    await waitFor(() => expect(getByLabelText('₹880')).toBeTruthy())

    fireEvent.changeText(getByPlaceholderText('Search items'), 'pizza')
    expect(queryByText('Milk')).toBeNull()
    expect(queryByText('Pizza')).toBeTruthy()
  })

  it('shows the manual escape hatch when the scan fails', async () => {
    ;(scanBill as jest.Mock).mockRejectedValue(new Error('bill scan failed: 502'))

    const { getByText } = renderWithProviders(<ScanBillScreen />)
    await flushCategories()

    await waitFor(() => expect(getByText('Enter manually')).toBeTruthy())
    fireEvent.press(getByText('Enter manually'))
    expect(mockReplace).toHaveBeenCalledWith('/modals/log-expense')
  })
})


it.each([false, true])('preserves scan create metadata and supports Undo (offline=%s)', async (offline) => {
  ;(scanBill as jest.Mock).mockResolvedValue(SCAN_RESULT)
  ;(postExpensePayload as jest.Mock)[offline ? 'mockRejectedValue' : 'mockResolvedValue'](
    offline ? new TypeError('Network request failed') : { id: 'scan-row', version: 7, category: 'Food shopping', timestamp: '2026-10-08T10:00:00' },
  )
  ;(deleteExpense as jest.Mock).mockResolvedValue(undefined)
  const screen = renderWithProviders(<ScanBillScreen />)
  await flushCategories()
  await waitFor(() => expect(screen.getByText('Review ₹880 →')).toBeTruthy())
  fireEvent.press(screen.getByText('Review ₹880 →'))
  fireEvent.press(screen.getByText('Log ₹880 to Groceries'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  mockParams = mockReplace.mock.calls[0][0].params
  expect(mockParams).toMatchObject({
    id: offline ? '' : 'scan-row', version: offline ? '' : '7',
    clientId: 'client-1', pending: offline ? '1' : '',
    category: offline ? 'Groceries' : 'Food shopping', amount: '880',
  })
  if (offline) {
    expect(enqueue).toHaveBeenCalled()
    expect(saveBillScan).not.toHaveBeenCalled()
  } else {
    await waitFor(() => expect(saveBillScan).toHaveBeenCalled())
    expect((saveBillScan as jest.Mock).mock.calls[0][0].category).toBe('Food shopping')
  }
  screen.unmount()
  mockReplace.mockClear()
  const success = renderWithProviders(<ExpenseAddedScreen />)
  if (offline) {
    expect(success.getByText(/Logged offline/)).toBeTruthy()
    expect(success.queryByText(/left of/)).toBeNull()
  }
  fireEvent.press(success.getByText('Undo'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  if (offline) {
    expect(remove).toHaveBeenCalledWith('client-1')
    expect(deleteExpense).not.toHaveBeenCalled()
  } else {
    expect(deleteExpense).toHaveBeenCalledWith('scan-row', '2026-10-08T10:00:00', 'Blinkit', 880, 7)
  }
})
