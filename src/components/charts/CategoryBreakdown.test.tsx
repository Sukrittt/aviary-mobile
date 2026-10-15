import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { CategoryBreakdown } from './CategoryBreakdown'
import type { BreakdownRow } from '@/src/lib/monthly'
import { categoryTint } from '@/src/lib/emoji'
import { lightTokens } from '@/src/theme/tokens'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: mockPush }),
}))

const rows: BreakdownRow[] = [
  { key: 'Investments', label: 'Investments', icon: 'TrendUp', spent: 40000, assigned: 40000, assignedIsCarried: false, pct: 80 },
  { key: 'Cook', label: 'Cook', icon: 'CookingPot', spent: 8000, assigned: 8000, assignedIsCarried: false, pct: 16 },
  { key: 'Travel', label: 'Travel', icon: 'Scooter', spent: 2000, assigned: 3000, assignedIsCarried: false, pct: 4 },
]

const groupRows: BreakdownRow[] = [
  { key: 'Savings', label: 'Savings', icon: 'PiggyBank', spent: 40000, assigned: 40000, assignedIsCarried: false, pct: 80 },
  { key: 'Everyday', label: 'Everyday', icon: 'Basket', spent: 10000, assigned: 11000, assignedIsCarried: false, pct: 20 },
]

const categoryGroupMap = new Map([
  ['Investments', 'Savings'],
  ['Cook', 'Everyday'],
  ['Travel', 'Everyday'],
])

function renderBreakdown(
  monthLabel = 'September 2026',
  selectedKey: string | null = null,
  mode: 'category' | 'group' = 'category',
) {
  const onSelectKey = jest.fn()
  const onModeChange = jest.fn()
  const result = renderWithProviders(
    <CategoryBreakdown
      rows={mode === 'category' ? rows : groupRows}
      categoryRows={rows}
      groupRows={groupRows}
      categoryGroupMap={categoryGroupMap}
      mode={mode}
      onModeChange={onModeChange}
      selectedKey={selectedKey}
      onSelectKey={onSelectKey}
      comparison={null}
      leftover={1000}
      monthLabel={monthLabel}
    />,
  )
  act(() => jest.advanceTimersByTime(500))
  return { ...result, onSelectKey, onModeChange }
}

beforeEach(() => {
  jest.useFakeTimers()
  mockPush.mockClear()
})

afterEach(() => jest.useRealTimers())

describe('CategoryBreakdown filtering', () => {
  it('keeps rows laid out but invisible until the entrance reveal is armed', () => {
    const onSelectKey = jest.fn()
    const screen = renderWithProviders(
      <CategoryBreakdown
        rows={rows}
        categoryRows={rows}
        groupRows={groupRows}
        categoryGroupMap={categoryGroupMap}
        mode="category"
        onModeChange={jest.fn()}
        selectedKey={null}
        onSelectKey={onSelectKey}
        comparison={null}
        leftover={1000}
        monthLabel="September 2026"
      />,
    )

    expect(screen.getByTestId('breakdown-reveal-content').props.style).toContainEqual({ opacity: 0 })
    act(() => jest.advanceTimersByTime(500))
    expect(screen.getByTestId('breakdown-reveal-content').props.style).toContainEqual({ opacity: 1 })
  })

  it('shows the snoozing bird instead of an empty donut when nothing was spent', () => {
    const screen = renderWithProviders(
      <CategoryBreakdown
        rows={[]}
        categoryRows={[]}
        groupRows={[]}
        categoryGroupMap={new Map()}
        mode="category"
        onModeChange={jest.fn()}
        selectedKey={null}
        onSelectKey={jest.fn()}
        comparison={null}
        leftover={85500}
        monthLabel="October 2026"
      />,
    )

    expect(screen.getByTestId('breakdown-empty')).toBeTruthy()
    expect(screen.getByText('Nothing spent yet')).toBeTruthy()
    expect(screen.queryByTestId('breakdown-reveal-content')).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: 'Log an expense' }))
    expect(mockPush).toHaveBeenCalledWith('/modals/log-expense')
  })

  it('hides the snoozing bird while data is still loading', () => {
    const screen = renderWithProviders(
      <CategoryBreakdown
        rows={[]}
        categoryRows={[]}
        groupRows={[]}
        categoryGroupMap={new Map()}
        mode="category"
        onModeChange={jest.fn()}
        selectedKey={null}
        onSelectKey={jest.fn()}
        comparison={null}
        leftover={0}
        monthLabel="October 2026"
        loading
      />,
    )

    expect(screen.queryByTestId('breakdown-empty')).toBeNull()
    expect(screen.queryByText('Nothing spent yet')).toBeNull()
  })

  it('renders an icon-only filter action beside the card title when all items are active', () => {
    const screen = renderBreakdown()

    expect(screen.getByText('Where it went')).toBeTruthy()
    expect(screen.getByLabelText('Filter chart')).toBeTruthy()
    expect(screen.queryByText('Filter')).toBeNull()
  })

  it('keeps edits as a draft until Apply and then reports hidden items', () => {
    const screen = renderBreakdown()
    fireEvent.press(screen.getByLabelText('Filter chart'))
    fireEvent.press(screen.getByRole('checkbox', { name: 'Investments' }))

    // The chart copy behind the modal is unchanged while the choice is a draft.
    expect(screen.getAllByText('Investments').length).toBeGreaterThan(0)

    fireEvent.press(screen.getByRole('button', { name: 'Apply' }))
    act(() => jest.advanceTimersByTime(250))

    expect(screen.getByLabelText('Filter chart, 2 categories active')).toBeTruthy()
    expect(screen.queryByText('Investments')).toBeNull()
    expect(screen.getByText('Filtered total')).toBeTruthy()
  })

  it('discards draft edits on Cancel', () => {
    const screen = renderBreakdown()
    fireEvent.press(screen.getByLabelText('Filter chart'))
    fireEvent.press(screen.getByRole('checkbox', { name: 'Investments' }))
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByLabelText('Filter chart')).toBeTruthy()
    expect(screen.getAllByText('Investments').length).toBeGreaterThan(0)
  })

  it('toggles all checks and requires at least one included item', () => {
    const screen = renderBreakdown()
    fireEvent.press(screen.getByLabelText('Filter chart'))
    expect(screen.getByText('Deselect all')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Deselect all categories'))

    expect(screen.getByText('Keep at least one item in the chart.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply' }).props.accessibilityState.disabled).toBe(true)

    fireEvent.press(screen.getByLabelText('Select all categories'))
    expect(screen.getByRole('checkbox', { name: 'Investments' }).props.accessibilityState.checked).toBe(true)
    expect(screen.getByText('Deselect all')).toBeTruthy()
  })

  it('filters categories by category group from the group tab', () => {
    const screen = renderBreakdown()
    fireEvent.press(screen.getByLabelText('Filter chart'))
    fireEvent.press(screen.getByRole('tab', { name: 'Groups' }))
    fireEvent.press(screen.getByRole('checkbox', { name: 'Everyday' }))
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }))
    act(() => jest.advanceTimersByTime(250))

    expect(screen.onModeChange).toHaveBeenCalledWith('group')
    expect(screen.getByLabelText('Filter chart, 1 category active')).toBeTruthy()
    expect(screen.queryByText('Cook')).toBeNull()
    expect(screen.queryByText('Travel')).toBeNull()
    expect(screen.getAllByText('Investments').length).toBeGreaterThan(0)
  })

  it('switches to the category view when applying a category filter', () => {
    const screen = renderBreakdown('September 2026', null, 'group')
    fireEvent.press(screen.getByLabelText('Filter chart'))
    fireEvent.press(screen.getByRole('tab', { name: 'Categories' }))
    fireEvent.press(screen.getByRole('checkbox', { name: 'Investments' }))
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.onModeChange).toHaveBeenCalledWith('category')
  })

  it('clears a highlighted category when Apply excludes it', () => {
    const screen = renderBreakdown('September 2026', 'Investments')
    fireEvent.press(screen.getByLabelText('Filter chart'))
    fireEvent.press(screen.getByRole('checkbox', { name: 'Investments' }))
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }))
    act(() => jest.advanceTimersByTime(250))

    expect(screen.onSelectKey).toHaveBeenCalledWith(null)
  })
})

describe('CategoryBreakdown group delta under a partial filter', () => {
  it('sums real previous spend, so a member down to zero keeps the badge finite', () => {
    const categoryRows: BreakdownRow[] = [
      // Nothing this month, ₹1,000 last month: deltaPct -100, the case that used to divide by zero.
      { key: 'Cook', label: 'Cook', icon: null, spent: 0, assigned: 0, assignedIsCarried: false, pct: 0, deltaPct: -100, prevSpent: 1000 },
      { key: 'Travel', label: 'Travel', icon: null, spent: 3000, assigned: 0, assignedIsCarried: false, pct: 75, deltaPct: 200, prevSpent: 1000 },
      { key: 'Fuel', label: 'Fuel', icon: null, spent: 1000, assigned: 0, assignedIsCarried: false, pct: 20, deltaPct: null, prevSpent: 0 },
      { key: 'Investments', label: 'Investments', icon: null, spent: 1000, assigned: 0, assignedIsCarried: false, pct: 20, deltaPct: null, prevSpent: 0 },
    ]
    const groups: BreakdownRow[] = [
      { key: 'Everyday', label: 'Everyday', icon: null, spent: 4000, assigned: 0, assignedIsCarried: false, pct: 80, deltaPct: 100, prevSpent: 2000 },
      { key: 'Savings', label: 'Savings', icon: null, spent: 1000, assigned: 0, assignedIsCarried: false, pct: 20, deltaPct: null, prevSpent: 0 },
    ]
    const screen = renderWithProviders(
      <CategoryBreakdown
        rows={groups}
        categoryRows={categoryRows}
        groupRows={groups}
        categoryGroupMap={new Map([['Cook', 'Everyday'], ['Travel', 'Everyday'], ['Fuel', 'Everyday'], ['Investments', 'Savings']])}
        mode="group"
        onModeChange={jest.fn()}
        selectedKey={null}
        onSelectKey={jest.fn()}
        comparison={null}
        leftover={0}
        monthLabel="September 2026"
      />,
    )
    act(() => jest.advanceTimersByTime(500))
    fireEvent.press(screen.getByLabelText('Filter chart'))
    fireEvent.press(screen.getByRole('tab', { name: 'Categories' }))
    fireEvent.press(screen.getByRole('checkbox', { name: 'Fuel' }))
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }))
    act(() => jest.advanceTimersByTime(250))

    // Cook + Travel: ₹3,000 now vs ₹2,000 before.
    expect(screen.getByText('50%')).toBeTruthy()
  })

  it('counts last month for categories with no spend this month, which have no row', () => {
    // Snacks spent ₹1,000 last month and nothing now, so it only shows up in
    // the group's prevSpent (₹3,000 = Snacks + Travel + Fuel).
    const categoryRows: BreakdownRow[] = [
      { key: 'Travel', label: 'Travel', icon: null, spent: 3000, assigned: 0, assignedIsCarried: false, pct: 60, deltaPct: 200, prevSpent: 1000 },
      { key: 'Fuel', label: 'Fuel', icon: null, spent: 1000, assigned: 0, assignedIsCarried: false, pct: 20, deltaPct: 0, prevSpent: 1000 },
      { key: 'Investments', label: 'Investments', icon: null, spent: 1000, assigned: 0, assignedIsCarried: false, pct: 20, deltaPct: null, prevSpent: 0 },
    ]
    const groups: BreakdownRow[] = [
      { key: 'Everyday', label: 'Everyday', icon: null, spent: 4000, assigned: 0, assignedIsCarried: false, pct: 80, deltaPct: 33, prevSpent: 3000 },
      { key: 'Savings', label: 'Savings', icon: null, spent: 1000, assigned: 0, assignedIsCarried: false, pct: 20, deltaPct: null, prevSpent: 0 },
    ]
    const screen = renderWithProviders(
      <CategoryBreakdown
        rows={groups}
        categoryRows={categoryRows}
        groupRows={groups}
        categoryGroupMap={new Map([['Snacks', 'Everyday'], ['Travel', 'Everyday'], ['Fuel', 'Everyday'], ['Investments', 'Savings']])}
        mode="group"
        onModeChange={jest.fn()}
        selectedKey={null}
        onSelectKey={jest.fn()}
        comparison={null}
        leftover={0}
        monthLabel="September 2026"
      />,
    )
    act(() => jest.advanceTimersByTime(500))
    fireEvent.press(screen.getByLabelText('Filter chart'))
    fireEvent.press(screen.getByRole('tab', { name: 'Categories' }))
    fireEvent.press(screen.getByRole('checkbox', { name: 'Fuel' }))
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }))
    act(() => jest.advanceTimersByTime(250))

    // Travel (+ Snacks at zero): ₹3,000 now vs ₹2,000 before.
    expect(screen.getByText('50%')).toBeTruthy()
  })
})

describe('CategoryBreakdown colours', () => {
  it("colours each wedge with the category's Home icon tint, not its rank", () => {
    const { UNSAFE_root } = renderBreakdown()
    const strokes = UNSAFE_root.findAll((n) => typeof n.props.stroke === 'string').map((n) => n.props.stroke)
    for (const label of ['Investments', 'Cook']) {
      expect(strokes).toContain(categoryTint(label, lightTokens).ink)
    }
  })
})
