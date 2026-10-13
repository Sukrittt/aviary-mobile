import { fireEvent, render as rtlRender } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { ThemeProvider } from '@/src/theme/ThemeProvider'
import { PrivacyProvider } from '@/src/context/PrivacyContext'
import RecurringExpensesScreen from './recurring'
import type { RecurringExpenseRow } from '@/src/types'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))

const mockUseRecurringExpenses = jest.fn()
jest.mock('@/src/hooks/useRecurringExpenses', () => ({
  useRecurringExpenses: () => mockUseRecurringExpenses(),
}))

// Counts PopIn mounts: a remounted row replays its pop-in from opacity 0.
const mockPopInMounts = jest.fn()
jest.mock('@/src/components/shared/PopIn', () => {
  const { useEffect } = jest.requireActual('react')
  return {
    PopIn: ({ children }: { children: React.ReactNode }) => {
      useEffect(() => mockPopInMounts(), [])
      return children
    },
  }
})

jest.mock('@/src/lib/netStatus', () => ({ useOnline: () => true }))

function row(overrides: Partial<RecurringExpenseRow>): RecurringExpenseRow {
  return {
    id: 'r1',
    item: 'Rent',
    amount_inr: '25000',
    category: 'Housing',
    notes: '',
    payment_method: 'bank',
    frequency: 'monthly',
    start_date: '2026-09-15',
    end_date: '',
    next_run_date: '2026-09-15',
    status: 'active',
    created_at: '2026-09-07T10:00:00',
    ...overrides,
  }
}

function render(rows: RecurringExpenseRow[]) {
  mockUseRecurringExpenses.mockReturnValue({ data: rows, isLoading: false })
  return renderWithProviders(<RecurringExpensesScreen />)
}

beforeEach(() => {
  mockPush.mockClear()
  mockPopInMounts.mockClear()
  mockUseRecurringExpenses.mockReset()
})

describe('empty state', () => {
  it('explains what the screen is for when nothing repeats yet', () => {
    const { getByText } = render([])
    expect(getByText('Nothing repeating yet')).toBeTruthy()
    expect(getByText('Set it once, forget it')).toBeTruthy()
  })
})

describe('header total', () => {
  it('normalizes each cadence to a single monthly figure', () => {
    const { getByText, getByLabelText } = render([
      row({ id: 'a', item: 'Rent', amount_inr: '600', frequency: 'monthly' }),
      row({ id: 'b', item: 'Insurance', amount_inr: '1200', frequency: 'yearly' }), // 100/mo
      row({ id: 'c', item: 'Coffee', amount_inr: '10', frequency: 'daily' }), // 300/mo
    ])
    // 600 + 100 + 300 = 1000, shown in the hero now, not the header subtitle.
    // The hero's AmountText animates, so its digits render as separate nodes —
    // read it back via the odometer's accessibilityLabel instead of getByText.
    expect(getByText('3 active')).toBeTruthy()
    expect(getByLabelText('₹1,000')).toBeTruthy()
  })

  it('leaves paused rows out of the active count and the total', () => {
    const { getByText, getByLabelText } = render([
      row({ id: 'a', item: 'Rent', amount_inr: '400', status: 'active' }),
      row({ id: 'b', item: 'Gym', amount_inr: '999', status: 'paused' }),
    ])
    expect(getByText('1 active')).toBeTruthy()
    expect(getByLabelText('₹400')).toBeTruthy()
  })
})

describe('allocation bar', () => {
  it('sums active rows per category, sorted descending, excluding paused rows', () => {
    const { getByText, queryByText } = render([
      row({ id: 'a', item: 'Rent', category: '🏠 Housing', amount_inr: '300', status: 'active' }),
      row({ id: 'b', item: 'Netflix', category: '📱 Subscriptions', amount_inr: '900', status: 'active' }),
      row({ id: 'c', item: 'Old gym', category: '🏋️ Fitness', amount_inr: '9999', status: 'paused' }),
    ])
    expect(getByText('Subscriptions')).toBeTruthy()
    expect(getByText('Housing')).toBeTruthy()
    expect(queryByText('Fitness')).toBeNull()
    expect(getByText('75.0%')).toBeTruthy() // 900 / 1200
    expect(getByText('25.0%')).toBeTruthy() // 300 / 1200
  })

  it('renders no allocation card when there are no active rows', () => {
    const { queryByText } = render([row({ id: 'a', item: 'Gym', status: 'paused' })])
    expect(queryByText('Housing')).toBeNull()
  })
})

describe('due labels', () => {
  const TODAY = '2026-09-08'
  const TOMORROW = '2026-09-09'
  const LATER = '2026-09-20'

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 8, 8)) // Tue 8 Sep 2026, matches jest.config.js TZ=UTC
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('reads a today due date as Due today', () => {
    const { getByText } = render([row({ next_run_date: TODAY })])
    expect(getByText('Due today')).toBeTruthy()
  })

  it('reads a tomorrow due date as Due tomorrow', () => {
    const { getByText } = render([row({ next_run_date: TOMORROW })])
    expect(getByText('Due tomorrow')).toBeTruthy()
  })

  it('reads a further-out due date as Next on', () => {
    const { getByText } = render([row({ next_run_date: LATER })])
    expect(getByText('Next on 20 Sep')).toBeTruthy()
  })
})

describe('rows', () => {
  // Pinned so "Next on 15 Sep" (vs. "Due today"/"Due tomorrow") doesn't flip
  // depending on what today actually is relative to row()'s fixture date.
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 8, 1)) // matches jest.config.js TZ=UTC
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows the server-computed next run date, cadence and category', () => {
    const { getByText } = render([row({})])
    expect(getByText('Next on 15 Sep')).toBeTruthy()
    expect(getByText('Every month')).toBeTruthy()
    expect(getByText('· Housing')).toBeTruthy()
  })

  it('labels a paused row and a finished one instead of a next date', () => {
    const { getByText } = render([
      row({ id: 'a', item: 'Gym', status: 'paused' }),
      row({ id: 'b', item: 'Course', status: 'ended' }),
    ])
    expect(getByText('Paused')).toBeTruthy()
    expect(getByText('Finished')).toBeTruthy()
  })

  it('splits active rows from paused and finished ones', () => {
    const { getByText } = render([
      row({ id: 'a', item: 'Rent', status: 'active' }),
      row({ id: 'b', item: 'Gym', status: 'paused' }),
    ])
    expect(getByText('ACTIVE')).toBeTruthy()
    expect(getByText('PAUSED AND FINISHED')).toBeTruthy()
  })

  it('opens the edit modal for the row that was tapped', () => {
    const { getByText } = render([row({ id: 'r7', item: 'Rent' })])
    fireEvent.press(getByText('Rent'))
    expect(mockPush).toHaveBeenCalledWith('/modals/recurring-expense?id=r7')
  })
})

it('the add button opens the modal with no id, so it starts blank', () => {
  const { getByText } = render([])
  fireEvent.press(getByText('Add'))
  expect(mockPush).toHaveBeenCalledWith('/modals/recurring-expense')
})

it('keeps each row mounted when the screen re-renders, so PopIn does not replay', () => {
  mockUseRecurringExpenses.mockReturnValue({ data: [row({ id: 'a', item: 'Rent' })], isLoading: false })
  const qc = createTestQueryClient()
  const tree = () => (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <PrivacyProvider>
          <RecurringExpensesScreen />
        </PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
  const { getByText, rerender } = rtlRender(tree())
  expect(getByText('Rent')).toBeTruthy()
  const mountsBefore = mockPopInMounts.mock.calls.length
  expect(mountsBefore).toBe(1)
  // Same tree, fresh elements: the screen re-renders with the same rows, like a refetch would.
  rerender(tree())
  expect(mockPopInMounts.mock.calls.length).toBe(mountsBefore)
})
