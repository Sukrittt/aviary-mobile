import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { CategoryBreakdown } from './CategoryBreakdown'
import type { BreakdownRow } from '@/src/lib/monthly'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: mockPush }),
}))

const rows: BreakdownRow[] = [
  { key: 'Investments', label: 'Investments', emoji: '📈', spent: 40000, assigned: 40000, assignedIsCarried: false, pct: 80 },
  { key: 'Cook', label: 'Cook', emoji: '🧑‍🍳', spent: 8000, assigned: 8000, assignedIsCarried: false, pct: 16 },
  { key: 'Travel', label: 'Travel', emoji: '🛵', spent: 2000, assigned: 3000, assignedIsCarried: false, pct: 4 },
]

const groupRows: BreakdownRow[] = [
  { key: 'Savings', label: 'Savings', emoji: '💰', spent: 40000, assigned: 40000, assignedIsCarried: false, pct: 80 },
  { key: 'Everyday', label: 'Everyday', emoji: '🧺', spent: 10000, assigned: 11000, assignedIsCarried: false, pct: 20 },
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
