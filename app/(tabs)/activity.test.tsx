import { AlertHost } from '@/src/components/ui/AlertHost'
import { ExpenseWriteError } from '@/src/lib/expenseConflict'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { act, fireEvent, waitFor, within } from '@testing-library/react-native'
import { Image, Keyboard, StyleSheet } from 'react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { ExpensesPage, ExpensesPageParams } from '@/src/api/expenses'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as pending from '@/src/lib/pendingExpenses'
import ActivityScreen from './activity'

const mockUseExpensesPage = jest.fn()
const mockDelete = jest.fn()
const mockDeleteAsync = jest.fn()
const mockPush = jest.fn()
let mockDuplicates: unknown[] = []
const mockUseExpensesFeed = jest.fn()
const mockPrefetchFeed = jest.fn()
let mockUser: { activityFeed?: boolean } = {}
let mockRecent: { has_photo?: boolean }[] = []

jest.mock('@/src/hooks/useExpenses', () => ({
  useExpensesPage: (params: ExpensesPageParams) => mockUseExpensesPage(params),
  useDeleteExpense: () => ({ mutate: mockDelete, mutateAsync: mockDeleteAsync }),
  prefetchExpensesPage: jest.fn(),
  prefetchExpensesFeed: (...args: unknown[]) => mockPrefetchFeed(...args),
  useDuplicates: () => ({ data: mockDuplicates }),
  useExpensesFeed: () => mockUseExpensesFeed(),
  // CategoryPickerSheet (rendered inside a BottomSheet) reads the base,
  // unpaginated hook for its autosuggest word map — unrelated to this
  // screen's own paginated fetch, so a static empty result is enough.
  useExpenses: () => ({ data: [], isLoading: false, error: null }),
  useRecentExpenses: () => ({ data: mockRecent, isLoading: false, error: null }),
}))


let mockIncomes: Record<string, unknown>[] = []
jest.mock('@/src/hooks/useUser', () => ({ useUser: () => ({ data: mockUser }) }))
let mockImporting = false
jest.mock('@/src/components/home/ImportBanner', () => ({ useImportInProgress: () => mockImporting }))
jest.mock('@/src/hooks/useIncomes', () => ({ useIncomes: () => ({ data: mockIncomes }) }))
jest.mock('@/src/hooks/useAccounts', () => ({ useAccounts: () => ({ data: [] }), liveAccounts: () => [] }))

jest.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [], isLoading: false, error: null }),
  useCategoryTint: () => () => ({ bg: '#eee', ink: '#333' }),
}))

jest.mock('@/src/hooks/useGroups', () => ({
  useGroups: () => ({ data: [], isLoading: false, error: null }),
  useGroupIcons: () => new Map(),
}))

// One-person budget by default: who-logged-what stays out of the way.
let mockSpaces: Record<string, unknown> = { budgets: [], active: null, multi: false }
jest.mock('@/src/hooks/useBudgetSpaces', () => ({ useBudgetSpaces: () => mockSpaces }))
jest.mock('@/src/api/accessMode', () => ({ ...jest.requireActual('@/src/api/accessMode'), currentUserId: () => 'u1' }))

let mockOnline = true
jest.mock('@/src/lib/netStatus', () => ({ useOnline: () => mockOnline, isOnline: () => mockOnline, readLastSynced: async () => null }))

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
  mockUseExpensesFeed.mockReturnValue({ data: { pages: [pageResult({})] }, isLoading: false, isError: false, hasNextPage: false })
  mockIncomes = []
  mockUseExpensesPage.mockReset()
  mockPush.mockReset()
  mockDuplicates = []
  mockOnline = true
  mockSpaces = { budgets: [], active: null, multi: false }
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

it('says the history is on its way while an import is still booking, not to log a first expense', () => {
  mockUseExpensesPage.mockReturnValue({
    data: pageResult({ rows: [], total: 0, totalAmount: 0 }),
    isLoading: false,
    error: null,
  })
  mockImporting = true
  const { getByText, queryByText } = renderWithProviders(<ActivityScreen />)
  expect(getByText('Your history is on its way')).toBeTruthy()
  expect(queryByText('Log an expense')).toBeNull()
  mockImporting = false
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

it('asks for 30 rows a page but mounts them a screenful at a time', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(i + 1, '2026-06-01'))
  mockUseExpensesPage.mockImplementation((params: ExpensesPageParams) => ({
    data: params.limit === 1 ? pageResult({}) : pageResult({ rows, total: 30 }),
    isLoading: false,
    error: null,
  }))

  const { getByText, queryByText } = renderWithProviders(<ActivityScreen />)

  expect(mockUseExpensesPage.mock.calls.some(([p]) => p.limit === 30)).toBe(true)
  expect(getByText('Item 10')).toBeTruthy()
  expect(queryByText('Item 11')).toBeNull()
  await waitFor(() => expect(getByText('Item 30')).toBeTruthy())
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

it('steps back to the new last page when its only row is deleted', () => {
  let pageCount = 3
  // The screen is memoized, so the refetch reaches it the way react-query's
  // does: through a subscription the hook reads, not a parent re-render.
  const Refetched = createContext(0)
  mockUseExpensesPage.mockImplementation((params: ExpensesPageParams) => {
    useContext(Refetched)
    if (params.limit === 1) return { data: pageResult({}), isLoading: false, error: null }
    const page = params.page
    return {
      data: pageResult({
        rows: page > pageCount ? [] : [row(page, `2026-06-0${page}`)],
        total: pageCount,
        page,
        pageCount,
        totalAmount: 100 * pageCount,
      }),
      isLoading: false,
      error: null,
    }
  })

  let refetch = () => {}
  function Harness() {
    const [tick, setTick] = useState(0)
    refetch = () => setTick((n) => n + 1)
    return <Refetched.Provider value={tick}><ActivityScreen /></Refetched.Provider>
  }
  const { getByText, getByLabelText } = renderWithProviders(<Harness />)
  fireEvent.press(getByLabelText('Next page'))
  fireEvent.press(getByLabelText('Next page'))
  expect(getByText('Page 3 of 3')).toBeTruthy()

  // The refetch after deleting page 3's only row: page 3 is gone.
  pageCount = 2
  act(() => refetch())

  expect(getByText('Page 2 of 2')).toBeTruthy()
  expect(getByText('Item 2')).toBeTruthy()
})


// Complete the collapse immediately: this test covers the deletion response,
// not the animation clock. `mockCollapsing` holds it mid-collapse instead.
let mockCollapsing = false
jest.mock('@/src/components/activity/DeletingRow', () => ({
  DeletingRow: ({ children, active, onDone }: { children: ReactNode; active: boolean; onDone: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => { if (active && !mockCollapsing) onDone() }, [active])
    return children
  },
}))

// Taps a list row open into its detail page. Deleting from there closes the
// page before handing off, so wait out its close.
const rowRect = { currentTarget: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 120, 390, 64) } }
function openRow(screen: ReturnType<typeof renderWithProviders>, item: string) {
  fireEvent.press(screen.getByText(item), rowRect)
}
async function deleteRow(screen: ReturnType<typeof renderWithProviders>, item: string) {
  openRow(screen, item)
  fireEvent.press(screen.getByLabelText('Delete'))
  await act(() => new Promise((r) => setTimeout(r, 300)))
  // A blocked delete never opens the confirm.
  const confirm = screen.queryAllByText('Delete').at(-1)
  if (confirm) fireEvent.press(confirm)
}

it.each([[409, 'This transaction was updated'], [404, 'This transaction is already deleted']])('opens a full-screen message on delete status %s', async (status, title) => {
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })
  mockDelete.mockReset().mockImplementation((_params, options) => options.onError(new ExpenseWriteError(Number(status), 'Raw API error')))
  const screen = renderWithProviders(<ActivityScreen />)
  await deleteRow(screen, 'Item 1')
  expect(screen.getByText(String(title))).toBeTruthy()
  expect(screen.queryByText('Raw API error')).toBeNull()
  fireEvent.press(screen.getByText('Back to transactions'))
  expect(screen.queryByText(String(title))).toBeNull()
  expect(mockDelete).toHaveBeenCalledTimes(1)
})

it('asks before deleting, and Cancel keeps the row', async () => {
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })
  mockDelete.mockReset()
  const screen = renderWithProviders(<ActivityScreen />)
  openRow(screen, 'Item 1')
  fireEvent.press(screen.getByLabelText('Delete'))
  await act(() => new Promise((r) => setTimeout(r, 300)))
  expect(screen.getByText('Delete transaction')).toBeTruthy()
  expect(screen.getByText(/will move to Archive/)).toBeTruthy()
  fireEvent.press(screen.getByText('Cancel'))
  expect(mockDelete).not.toHaveBeenCalled()
  expect(screen.queryByText('Undo')).toBeNull()
})

it('sends both deletes when a second starts while the first is still collapsing', async () => {
  mockUseExpensesPage.mockReturnValue({ data: pageResult({ rows: [row(1, '2026-06-01'), row(2, '2026-06-02')], total: 2 }), isLoading: false, error: null })
  mockDelete.mockReset()
  const screen = renderWithProviders(<ActivityScreen />)
  await deleteRow(screen, 'Item 1')
  await deleteRow(screen, 'Item 2')
  const ids = mockDelete.mock.calls.map(([vars]) => vars.id)
  expect(ids.sort()).toEqual(['row-1', 'row-2'])
})

it('opens a tapped row into its detail page, with Edit handing off to the edit form', () => {
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })
  mockPush.mockReset()
  const screen = renderWithProviders(<ActivityScreen />)
  openRow(screen, 'Item 1')
  expect(screen.getByText('Category')).toBeTruthy()
  expect(screen.getByLabelText('Close')).toBeTruthy()
  fireEvent.press(screen.getByText('Edit'))
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/modals/log-expense', params: expect.objectContaining({ id: 'row-1' }) }))
  expect(screen.queryByText('Category')).toBeNull()
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

describe('income', () => {
  const income = (id: string, date: string, label: string) => ({
    id, version: 0, date, amount: '50000', label, notes: '', account_id: '', recurring_id: '', source: 'recurring', counted: 'monthly', created_at: '',
  })

  it('slots income in by date, signed, and opens Income when tapped', () => {
    mockIncomes = [income('i1', '2026-06-02', 'Salary')]
    mockUseExpensesPage.mockReturnValue({ data: pageResult({ rows: [row(1, '2026-06-03'), row(2, '2026-06-01')], total: 2 }), isLoading: false, error: null })
    const screen = renderWithProviders(<ActivityScreen />)
    const labels = screen.getAllByText(/^(Item \d|Salary)$/).map((n) => n.props.children)
    expect(labels).toEqual(['Item 1', 'Salary', 'Item 2'])
    expect(screen.getByText('+₹50,000')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Salary, income. Open Income'))
    expect(mockPush).toHaveBeenCalledWith('/account/income')
  })

  it('still shows income in a period with no spending', () => {
    // No spending anchors "this month" on today.
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    mockIncomes = [income('i1', date, 'Salary')]
    mockUseExpensesPage.mockReturnValue({ data: pageResult({ rows: [], total: 0, totalAmount: 0 }), isLoading: false, error: null })
    const screen = renderWithProviders(<ActivityScreen />)
    expect(screen.getByText('Salary')).toBeTruthy()
    expect(screen.queryByText('Your story starts here')).toBeNull()
  })
})

it('blocks the screen while offline, even with saved transactions', async () => {
  mockOnline = false
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })
  const { findByText, queryByText } = renderWithProviders(<ActivityScreen />)
  expect(await findByText("You're offline")).toBeTruthy()
  expect(queryByText('Item 1')).toBeNull()
})

it('keeps saved transactions on screen when a refresh fails online', () => {
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: new Error('Failed to load: 503') })
  const { getByText, queryByText } = renderWithProviders(<ActivityScreen />)
  expect(getByText('Item 1')).toBeTruthy()
  expect(queryByText("Couldn't load transactions")).toBeNull()
})

it('shows the offline screen when there is nothing saved to show', async () => {
  mockOnline = false
  mockUseExpensesPage.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Network request failed') })
  const { findByText } = renderWithProviders(<ActivityScreen />)
  expect(await findByText("You're offline")).toBeTruthy()
})

it('shows the screen-shaped skeleton on a first load, not a loading phrase', () => {
  mockUseExpensesPage.mockReturnValue({ data: undefined, isLoading: true, error: null })
  const { getByTestId, getByRole, queryByText } = renderWithProviders(<ActivityScreen />)
  expect(getByTestId('tab-skeleton')).toBeTruthy()
  expect(getByRole('header', { name: 'Activity' })).toBeTruthy()
  expect(queryByText(/…/)).toBeNull()
})

describe('feed view', () => {
  beforeEach(() => {
    mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })
    mockDelete.mockReset()
    mockUser = { activityFeed: true }
  })
  afterEach(() => {
    mockUser = {}
  })

  it('stays on the list with no switch until the feed is turned on in Features', () => {
    mockUser = {}
    const screen = renderWithProviders(<ActivityScreen />)
    expect(screen.getByText('1 transaction')).toBeTruthy()
    expect(screen.queryByLabelText('Show as feed')).toBeNull()
  })

  it('loads with the feed skeleton on the feed, and the list skeleton on the list', () => {
    mockUseExpensesPage.mockReturnValue({ data: undefined, isLoading: true, error: null })
    expect(renderWithProviders(<ActivityScreen />).getByLabelText('Loading your feed')).toBeTruthy()
    mockUser = {}
    expect(renderWithProviders(<ActivityScreen />).queryByLabelText('Loading your feed')).toBeNull()
  })

  it('opens on the feed once turned on, and switches to the list and back', () => {
    const screen = renderWithProviders(<ActivityScreen />)
    expect(screen.getByLabelText('Item 1, Food. View details')).toBeTruthy()
    expect(screen.queryByText('1 transaction')).toBeNull()
    fireEvent.press(screen.getByLabelText('Show as list'))
    expect(screen.getByText('1 transaction')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Show as feed'))
    expect(screen.getByLabelText('Item 1, Food. View details')).toBeTruthy()
  })

  // Rebuilding the other view on every switch took up to 1.5s on a phone.
  it('keeps both views mounted across a switch, the hidden one out of reach', () => {
    jest.useFakeTimers()
    const screen = renderWithProviders(<ActivityScreen />)
    const hidden = { includeHiddenElements: true }
    // Only the feed mounts with the tab, which preloads at launch; the list follows a moment later.
    expect(screen.queryByText('1 transaction', hidden)).toBeNull()
    act(() => jest.advanceTimersByTime(1000))
    jest.useRealTimers()
    // Then it's there under the feed, just hidden from touch and screen readers.
    const listFooter = screen.getByText('1 transaction', hidden)
    expect(screen.queryByText('1 transaction')).toBeNull()
    const card = screen.getByLabelText('Item 1, Food. View details')
    fireEvent.press(screen.getByLabelText('Show as list'))
    expect(screen.getByText('1 transaction')).toBe(listFooter)
    expect(screen.queryByLabelText('Item 1, Food. View details')).toBeNull()
    fireEvent.press(screen.getByLabelText('Show as feed'))
    expect(screen.getByLabelText('Item 1, Food. View details')).toBe(card)
  })

  // Hidden, a mounted feed still watched its query and refetched its photos on every write.
  it('unmounts the feed once it is turned off in Features', () => {
    const screen = renderWithProviders(<ActivityScreen />)
    expect(screen.getByLabelText('Item 1, Food. View details')).toBeTruthy()
    mockUser = { activityFeed: false }
    fireEvent.press(screen.getAllByLabelText('Filter transactions')[0])
    expect(screen.queryByLabelText('Item 1, Food. View details', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByText('1 transaction')).toBeTruthy()
  })

  // The view switched away from only hides, so a search field in it kept typing off screen.
  it('lets go of the keyboard when switching views', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss')
    const screen = renderWithProviders(<ActivityScreen />)
    fireEvent.press(screen.getByLabelText('Show as list'))
    expect(dismiss).toHaveBeenCalledTimes(1)
    dismiss.mockRestore()
  })

  it('warms the feed while the list is up, so the switch reads from cache', () => {
    mockPrefetchFeed.mockClear()
    const screen = renderWithProviders(<ActivityScreen />)
    expect(mockPrefetchFeed).not.toHaveBeenCalled()
    fireEvent.press(screen.getByLabelText('Show as list'))
    expect(mockPrefetchFeed).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ page: expect.anything() }))
  })

  // Switching budgets drops every query nothing is watching, the warmed feed included.
  it('warms the feed again after a budget switch', () => {
    const home = { id: 'b-home', name: 'Home', personal: true, members: [] }
    const trip = { id: 'b-trip', name: 'Trip', personal: false, members: [] }
    mockSpaces = { budgets: [home, trip], active: home, multi: true }
    const screen = renderWithProviders(<ActivityScreen />)
    fireEvent.press(screen.getByLabelText('Show as list'))
    mockPrefetchFeed.mockClear()
    mockSpaces = { budgets: [home, trip], active: trip, multi: true }
    // Any re-render picks up the switch; opening the filters changes nothing the prefetch reads.
    fireEvent.press(screen.getByLabelText('Filter transactions'))
    expect(mockPrefetchFeed).toHaveBeenCalledTimes(1)
  })

  describe('with a photo and no choice in Features', () => {
    beforeEach(() => {
      mockUser = {}
      mockRecent = [{ has_photo: true }]
    })
    afterEach(() => {
      mockRecent = []
    })

    it('offers the switch but stays on the list, with a tip that opens the feed', async () => {
      const screen = renderWithProviders(<ActivityScreen />)
      expect(screen.getByText('1 transaction')).toBeTruthy()
      expect(screen.getByLabelText('Show as feed')).toBeTruthy()
      fireEvent.press(await screen.findByLabelText('Try the feed'))
      expect(screen.getByLabelText('Item 1, Food. View details')).toBeTruthy()
      expect(screen.queryByLabelText('Try the feed')).toBeNull()
    })

    it('keeps the switch hidden once turned off in Features', () => {
      mockUser = { activityFeed: false }
      const screen = renderWithProviders(<ActivityScreen />)
      expect(screen.queryByLabelText('Show as feed')).toBeNull()
      expect(screen.queryByLabelText('Try the feed')).toBeNull()
    })
  })

  // The same expense is a row in the list under the feed too; only the one on
  // screen may collapse and send the delete, or it went out twice.
  it('sends a delete from the feed once, with the list mounted underneath', () => {
    jest.useFakeTimers()
    const screen = renderWithProviders(<ActivityScreen />)
    act(() => jest.advanceTimersByTime(1000))
    jest.useRealTimers()
    expect(screen.getByText('1 transaction', { includeHiddenElements: true })).toBeTruthy()
    fireEvent(screen.getByLabelText('Item 1, Food. View details'), 'longPress')
    fireEvent.press(screen.getByText('Delete'))
    fireEvent.press(screen.getAllByText('Delete').at(-1)!)
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })

  // The hidden view's row stops collapsing, and the other view may not have
  // the expense loaded to collapse it there.
  it('sends a delete still collapsing when the view switches', () => {
    mockCollapsing = true
    mockDelete.mockReset()
    try {
      const screen = renderWithProviders(<ActivityScreen />)
      fireEvent(screen.getByLabelText('Item 1, Food. View details'), 'longPress')
      fireEvent.press(screen.getByText('Delete'))
      fireEvent.press(screen.getAllByText('Delete').at(-1)!)
      expect(mockDelete).not.toHaveBeenCalled()
      fireEvent.press(screen.getByLabelText('Show as list'))
      expect(mockDelete).toHaveBeenCalledTimes(1)
      fireEvent.press(screen.getByLabelText('Show as feed'))
      expect(mockDelete).toHaveBeenCalledTimes(1)
    } finally {
      mockCollapsing = false
    }
  })

  it('deletes from the feed after the confirm', () => {
    const screen = renderWithProviders(<ActivityScreen />)
    fireEvent(screen.getByLabelText('Item 1, Food. View details'), 'longPress')
    fireEvent.press(screen.getByText('Delete'))
    expect(mockDelete).not.toHaveBeenCalled()
    fireEvent.press(screen.getAllByText('Delete').at(-1)!)
    expect(mockDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'row-1' }), expect.anything())
  })
})

describe('who logged what', () => {
  const member = (userId: string, name: string, role: 'owner' | 'member') => ({ userId, name, avatarUrl: null, role, joinedAt: null })
  const home = { id: 'sp_home', name: 'Home', emoji: '🏠', role: 'member', ownerId: 'u2', currencyCode: 'INR', personal: false, members: [member('u2', 'Priya', 'owner'), member('u1', 'Rahul', 'member')] }
  const rows = [{ ...row(1, '2026-06-01'), created_by: null }, { ...row(2, '2026-06-01'), created_by: 'u1' }]

  it('changes nothing in a one-person budget', () => {
    mockUseExpensesPage.mockReturnValue({ data: pageResult({ rows, total: 2 }), isLoading: false, error: null })
    const screen = renderWithProviders(<ActivityScreen />)
    expect(screen.queryByText('Mine')).toBeNull()
    expect(screen.queryByTestId('logged-by')).toBeNull()
  })

  it('marks each row with who logged it, and Mine keeps only yours', () => {
    mockSpaces = { budgets: [home], active: home, multi: true }
    mockUseExpensesPage.mockReturnValue({ data: pageResult({ rows, total: 2 }), isLoading: false, error: null })
    const screen = renderWithProviders(<ActivityScreen />)
    expect(screen.getByLabelText('Added by Priya')).toBeTruthy()
    expect(screen.getByLabelText('Added by Rahul')).toBeTruthy()
    // Everyone/Mine lives in the filter sheet, not on the page.
    expect(screen.queryByText('Mine')).toBeNull()
    fireEvent.press(screen.getByLabelText('Filter transactions'))
    fireEvent.press(screen.getByText('Mine'))
    expect(screen.queryByText('Item 1')).toBeNull()
    expect(screen.getByText('Item 2')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Remove Mine filter'))
    expect(screen.getByText('Item 1')).toBeTruthy()
  })

  it('pins the face to the corner of the category icon, photo and all', () => {
    const withPhoto = { ...home, members: [{ ...member('u2', 'Priya', 'owner'), avatarUrl: 'https://img/priya.png' }, member('u1', 'Rahul', 'member')] }
    mockSpaces = { budgets: [withPhoto], active: withPhoto, multi: true }
    mockUseExpensesPage.mockReturnValue({ data: pageResult({ rows, total: 2 }), isLoading: false, error: null })
    const screen = renderWithProviders(<ActivityScreen />)
    const priya = within(screen.getAllByTestId('row-icon')[0]).getByTestId('logged-by')
    expect(StyleSheet.flatten(priya.props.style)).toMatchObject({ position: 'absolute' })
    expect(screen.UNSAFE_getAllByType(Image).some((img) => img.props.source?.uri === 'https://img/priya.png')).toBe(true)
  })

  it('says who added it on the detail page', () => {
    mockSpaces = { budgets: [home], active: home, multi: true }
    mockUseExpensesPage.mockReturnValue({ data: pageResult({ rows, total: 2 }), isLoading: false, error: null })
    const screen = renderWithProviders(<ActivityScreen />)
    openRow(screen, 'Item 1')
    expect(screen.getByText('Added by')).toBeTruthy()
    expect(screen.getByText('Priya')).toBeTruthy()
  })
})

describe('expenses that failed to sync', () => {
  // The real queue (AsyncStorage is mocked in jest.setup.js), so this goes
  // through the same failed list the drain writes to.
  async function failOne(clientId: string) {
    await pending.enqueue({ client_id: clientId, item: 'Chai', amount_inr: '20', category: 'Food', date: '2026-06-01', timestamp: '2026-06-01T10:00:00' }, 'u1', false, 'u1')
    await pending.bumpAttempts(clientId, 1, 'u1')
  }

  beforeEach(async () => {
    await AsyncStorage.clear()
    mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })
  })

  it('shows a row for them that opens the entry in Log Expense', async () => {
    await failOne('c1')
    await failOne('c2')
    const screen = renderWithProviders(<ActivityScreen />)

    fireEvent.press(await screen.findByText("2 expenses couldn't be saved"))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/modals/log-expense',
      params: expect.objectContaining({ failedClientId: 'c1', item: 'Chai', amountInr: '20', category: 'Food' }),
    })
  })

  it('says nothing when none failed', async () => {
    const screen = renderWithProviders(<ActivityScreen />)
    await act(async () => {})
    expect(screen.queryByText(/couldn't be saved/)).toBeNull()
  })
})

describe('sync status while online', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })
  })

  it('shows how many are still syncing, and drops it once the queue drains', async () => {
    const queued = (id: string) => ({ client_id: id, item: 'Chai', amount_inr: '20', category: 'Food', date: '2026-06-01', timestamp: '2026-06-01T10:00:00' })
    await pending.enqueue(queued('c1'), 'u1', false, 'u1')
    await pending.enqueue(queued('c2'), 'u1', false, 'u1')
    const screen = renderWithProviders(<ActivityScreen />)
    expect(await screen.findByText('Syncing 2…')).toBeTruthy()

    await act(async () => {
      await pending.remove('c1', 'u1')
      await pending.remove('c2', 'u1')
    })
    await waitFor(() => expect(screen.queryByText(/Syncing/)).toBeNull())
  })
})

it('in a read-only budget, shows the banner and says why instead of deleting', async () => {
  const owner = { userId: 'u2', name: 'Priya Shah', avatarUrl: null, role: 'owner', joinedAt: null }
  const studio = { id: 'sp_studio', name: 'Studio', emoji: '', role: 'member', ownerId: 'u2', currencyCode: 'INR', personal: false, members: [owner], readOnly: true }
  mockSpaces = { budgets: [studio], active: studio, multi: false }
  mockUseExpensesPage.mockReturnValue({ data: pageResult({}), isLoading: false, error: null })
  mockDelete.mockReset()
  const screen = renderWithProviders(<><AlertHost /><ActivityScreen /></>)
  expect(screen.getByTestId('read-only-banner')).toBeTruthy()
  await deleteRow(screen, 'Item 1')
  expect(mockDelete).not.toHaveBeenCalled()
  expect(screen.getByText('This budget is read-only')).toBeTruthy()
})
