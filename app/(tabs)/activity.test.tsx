import { ExpenseWriteError } from '@/src/lib/expenseConflict'
import type { ReactNode } from 'react'
import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { ExpensesPage, ExpensesPageParams } from '@/src/api/expenses'
import ActivityScreen from './activity'

const mockUseExpensesPage = jest.fn()
const mockDelete = jest.fn()
const mockDeleteAsync = jest.fn()
const mockPush = jest.fn()
let mockDuplicates: unknown[] = []

jest.mock('@/src/hooks/useExpenses', () => ({
  useExpensesPage: (params: ExpensesPageParams) => mockUseExpensesPage(params),
  useDeleteExpense: () => ({ mutate: mockDelete, mutateAsync: mockDeleteAsync }),
  prefetchExpensesPage: jest.fn(),
  useDuplicates: () => ({ data: mockDuplicates }),
  // CategoryPickerSheet (rendered inside a BottomSheet) reads the base,
  // unpaginated hook for its autosuggest word map — unrelated to this
  // screen's own paginated fetch, so a static empty result is enough.
  useExpenses: () => ({ data: [], isLoading: false, error: null }),
  useRecentExpenses: () => ({ data: [], isLoading: false, error: null }),
}))

jest.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [], isLoading: false, error: null }),
}))

jest.mock('@/src/hooks/useGroups', () => ({
  useGroups: () => ({ data: [], isLoading: false, error: null }),
}))

let mockOnline = true
jest.mock('@/src/lib/netStatus', () => ({ useOnline: () => mockOnline, readLastSynced: async () => null }))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't reference out-of-scope imports (hoisting)
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, []),
  useIsFocused: () => true,
}))

// SwipeableRow imports react-native-gesture-handler/ReanimatedSwipeable
// directly, which needs a native worklets module unavailable under Jest.
// jest.setup.js's global gesture-handler mock doesn't cover this submodule.
// Swipe behavior is verified by hand elsewhere (RNTL can't simulate a drag
// anyway) — this test only cares about the row's content and pagination.
jest.mock('@/src/components/activity/SwipeableRow', () => ({
  SwipeableRow: ({ children }: { children: ReactNode }) => children,
}))

function row(index: number, date: string): {
  id: string
  timestamp: string
  date: string
  item: string
  amount_inr: string
  category: string
  notes: string
  source: string
  amount: string
  description: string
  payment_method: string
} {
  return {
    id: `row-${index}`,
    timestamp: `${date}T10:00:00`,
    date,
    item: `Item ${index}`,
    amount_inr: '100',
    category: 'Food',
    notes: '',
    source: '',
    amount: '100',
    description: '',
    payment_method: 'bank',
  }
}

function pageResult(overrides: Partial<ExpensesPage>): ExpensesPage {
  return {
    rows: [row(1, '2026-06-01')],
    total: 1,
    page: 1,
    pageCount: 1,
    totalAmount: 100,
    ...overrides,
  }
}

beforeEach(() => {
  mockUseExpensesPage.mockReset()
  mockPush.mockReset()
  mockDuplicates = []
  mockOnline = true
})

it('shows duplicate review as a compact header action', () => {
  mockDuplicates = [{ duplicate: { id: 'two' }, original: { id: 'one' } }]
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })

  const screen = renderWithProviders(<ActivityScreen />)

  fireEvent.press(screen.getByText('Review 1 duplicate'))
  expect(mockPush).toHaveBeenCalledWith('/modals/duplicates')
})

it('shows the server-reported total and spend, with no pagination row for a single page', () => {
  mockUseExpensesPage.mockImplementation((params: ExpensesPageParams) => ({
    data:
      params.limit === 1
        ? pageResult({ rows: [row(1, '2026-06-01')] })
        : pageResult({
            rows: [row(1, '2026-06-01'), row(2, '2026-06-02')],
            total: 2,
            totalAmount: 300,
          }),
    isLoading: false,
    error: null,
  }))

  const { getByText, queryByLabelText } = renderWithProviders(<ActivityScreen />)

  expect(getByText('2 transactions')).toBeTruthy()
  expect(getByText('Total: ₹300')).toBeTruthy()
  expect(queryByLabelText('Next page')).toBeNull()
})

it('hides the count and total footer when there are no transactions', () => {
  mockUseExpensesPage.mockImplementation(() => ({
    data: pageResult({ rows: [], total: 0, totalAmount: 0 }),
    isLoading: false,
    error: null,
  }))

  const { getByText, queryByText } = renderWithProviders(<ActivityScreen />)

  expect(getByText('No transactions for this filter.')).toBeTruthy()
  expect(queryByText(/transactions?$/)).toBeNull()
  expect(queryByText(/^Total:/)).toBeNull()
})

it('clears search and date filters from the empty-state action', () => {
  mockUseExpensesPage.mockReturnValue({
    data: pageResult({ rows: [], total: 0, totalAmount: 0 }),
    isLoading: false,
    error: null,
  })
  const screen = renderWithProviders(<ActivityScreen />)
  fireEvent.changeText(screen.getByPlaceholderText('Search transactions'), 'coffee')
  fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByPlaceholderText('Search transactions').props.value).toBe('')
  expect(screen.getByText('Your story starts here')).toBeTruthy()
  const query = mockUseExpensesPage.mock.calls.at(-1)![0] as ExpensesPageParams
  expect(query.q).toBeUndefined()
  expect(query.from).toBeUndefined()
  expect(query.to).toBeUndefined()
  fireEvent.press(screen.getByRole('button', { name: 'Log an expense' }))
  expect(mockPush).toHaveBeenCalledWith('/modals/log-expense')
})

it('pages through the Activity list via server-side pagination', () => {
  mockUseExpensesPage.mockImplementation((params: ExpensesPageParams) => {
    if (params.limit === 1) return { data: pageResult({}), isLoading: false, error: null }
    const page = params.page
    return {
      data: pageResult({
        rows: [row(page, `2026-06-0${page}`)],
        total: 3,
        page,
        pageCount: 3,
        totalAmount: 300,
      }),
      isLoading: false,
      error: null,
    }
  })

  const { getByText, getByLabelText } = renderWithProviders(<ActivityScreen />)

  expect(getByText('Page 1 of 3')).toBeTruthy()
  expect(getByLabelText('Previous page').props.accessibilityState.disabled).toBe(true)

  fireEvent.press(getByLabelText('Next page'))

  expect(getByText('Page 2 of 3')).toBeTruthy()
  expect(getByLabelText('Previous page').props.accessibilityState.disabled).toBe(false)
})


// Complete the collapse immediately: this test covers the deletion response,
// not the animation clock.
jest.mock('@/src/components/activity/DeletingRow', () => ({
  DeletingRow: ({ children, active, onDone }: { children: ReactNode; active: boolean; onDone: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => { if (active) onDone() }, [active])
    return children
  },
}))

it.each([[409, 'This transaction was updated'], [404, 'This transaction is already deleted']])('opens a full-screen message on delete status %s', (status, title) => {
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })
  mockDelete.mockReset().mockImplementation((_params, options) => options.onError(new ExpenseWriteError(Number(status), 'Raw API error')))
  const screen = renderWithProviders(<ActivityScreen />)
  fireEvent.press(screen.getByText('Item 1'))
  fireEvent.press(screen.getByText('Delete'))
  fireEvent.press(screen.getByText('Delete'))
  expect(screen.getByText(String(title))).toBeTruthy()
  expect(screen.queryByText('Raw API error')).toBeNull()
  fireEvent.press(screen.getByText('Back to transactions'))
  expect(screen.queryByText(String(title))).toBeNull()
  expect(mockDelete).toHaveBeenCalledTimes(1)
})

describe('multi-select delete', () => {
  beforeEach(() => {
    mockUseExpensesPage.mockReturnValue({
      data: pageResult({ rows: [row(1, '2026-06-01'), row(2, '2026-06-02')], total: 2 }),
      isLoading: false,
      error: null,
    })
  })

  it('long-press starts selection, select all, then deletes each row after one confirm', async () => {
    mockDeleteAsync.mockReset().mockResolvedValue(undefined)
    const screen = renderWithProviders(<ActivityScreen />)
    fireEvent(screen.getByText('Item 1'), 'longPress')
    expect(screen.getByText('1 selected')).toBeTruthy()
    fireEvent.press(screen.getByText('Select all'))
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Delete selected'))
    expect(screen.getByText('Delete 2 transactions')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByText('Delete'))
    })
    expect(mockDeleteAsync).toHaveBeenCalledTimes(2)
    expect(mockDeleteAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'row-1' }))
    expect(mockDeleteAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'row-2' }))
    expect(screen.getByText('Activity')).toBeTruthy()
  })

  it('selects one of two same-item rows logged in the same second', () => {
    const twin = { ...row(1, '2026-06-01'), id: 'row-1b' }
    mockUseExpensesPage.mockReturnValue({
      data: pageResult({ rows: [row(1, '2026-06-01'), twin], total: 2 }),
      isLoading: false,
      error: null,
    })
    const screen = renderWithProviders(<ActivityScreen />)
    fireEvent(screen.getAllByText('Item 1')[0], 'longPress')
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('drops the selection header as soon as the delete is confirmed, before requests settle', async () => {
    let settle!: () => void
    mockDeleteAsync.mockReset().mockImplementation(() => new Promise<void>((resolve) => { settle = resolve }))
    const screen = renderWithProviders(<ActivityScreen />)
    fireEvent(screen.getByText('Item 1'), 'longPress')
    fireEvent.press(screen.getByLabelText('Delete selected'))
    await act(async () => {
      fireEvent.press(screen.getByText('Delete'))
    })
    expect(screen.getByText('Activity')).toBeTruthy()
    expect(screen.queryByText('1 selected')).toBeNull()
    await act(async () => settle())
  })

  it('tapping the only selected row ends selection without opening the action sheet', () => {
    const screen = renderWithProviders(<ActivityScreen />)
    fireEvent(screen.getByText('Item 1'), 'longPress')
    fireEvent.press(screen.getByText('Item 1'))
    expect(screen.getByText('Activity')).toBeTruthy()
    expect(screen.queryByText('Edit')).toBeNull()
  })

  it('drops the selection when the search changes', () => {
    const screen = renderWithProviders(<ActivityScreen />)
    fireEvent(screen.getByText('Item 1'), 'longPress')
    expect(screen.getByText('1 selected')).toBeTruthy()
    fireEvent.changeText(screen.getByPlaceholderText('Search transactions'), 'x')
    expect(screen.getByText('Activity')).toBeTruthy()
  })

  it('brings failed rows back, still selected, with a friendly message', async () => {
    mockDeleteAsync.mockReset()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ExpenseWriteError(409, 'Raw API error'))
    const screen = renderWithProviders(<ActivityScreen />)
    fireEvent(screen.getByText('Item 1'), 'longPress')
    fireEvent.press(screen.getByText('Select all'))
    fireEvent.press(screen.getByLabelText('Delete selected'))
    await act(async () => {
      fireEvent.press(screen.getByText('Delete'))
    })
    expect(screen.getByText('This transaction was updated')).toBeTruthy()
    expect(screen.queryByText('Raw API error')).toBeNull()
    fireEvent.press(screen.getByText('Back to transactions'))
    expect(screen.getByText('1 selected')).toBeTruthy()
    expect(screen.getByText('Item 2')).toBeTruthy()
  })
})

it('keeps saved transactions on screen while offline', () => {
  mockOnline = false
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: new Error('Network request failed') })
  const { getByText, queryByText } = renderWithProviders(<ActivityScreen />)
  expect(getByText('Item 1')).toBeTruthy()
  expect(queryByText("You're offline")).toBeNull()
})

it('keeps saved transactions on screen when a refresh fails online', () => {
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: new Error('Failed to load: 503') })
  const { getByText, queryByText } = renderWithProviders(<ActivityScreen />)
  expect(getByText('Item 1')).toBeTruthy()
  expect(queryByText("Couldn't load transactions")).toBeNull()
})

it('shows the offline screen only when there is nothing saved to show', async () => {
  mockOnline = false
  mockUseExpensesPage.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Network request failed') })
  const { findByText } = renderWithProviders(<ActivityScreen />)
  expect(await findByText("You're offline")).toBeTruthy()
})
