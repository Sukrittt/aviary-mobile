import * as Reanimated from 'react-native-reanimated'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { setActiveBudget } from '@/src/lib/activeBudget'
import { renderWithProviders, createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import { BudgetSwitcherSheet } from './BudgetSwitcherSheet'
import { BudgetChip } from './BudgetChip'
import { MoveExpenseSheet } from './MoveExpenseSheet'
import { budgetsKey } from '@/src/hooks/useBudgetSpaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { getBudgetCategories, moveExpense, type Budget, type BudgetList } from '@/src/api/spaces'
import type { ExpenseRow } from '@/src/types'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }))
jest.mock('@/src/api/accessMode', () => ({ currentUserId: () => 'u1', accessMode: { subscribeLogout: () => () => {}, subscribe: () => () => {} } }))
jest.mock('@/src/lib/budgetSwitch', () => ({ switchBudget: jest.fn(async () => {}) }))
jest.mock('@/src/api/spaces', () => ({
  getBudgets: jest.fn(),
  getBudgetCategories: jest.fn(async () => [{ name: 'Groceries', group: 'Needs' }, { name: 'Rent', group: 'Needs' }]),
  moveExpense: jest.fn(async () => ({ version: 3 })),
  restoreBudget: jest.fn(async () => {}),
}))

const personal: Budget = { id: 'u1', name: 'Personal', emoji: '🐦', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: true, members: [] }
const home: Budget = {
  id: 'sp_home', name: 'Home', emoji: '🏠', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: false,
  members: [
    { userId: 'u1', name: 'Priya', avatarUrl: null, role: 'owner', joinedAt: null },
    { userId: 'u2', name: 'Rahul', avatarUrl: null, role: 'member', joinedAt: null },
  ],
}

function withBudgets(list: Partial<BudgetList>) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(budgetsKey, { budgets: [personal], count: 1, limit: 5, activeId: 'u1', ...list })
  return queryClient
}

beforeEach(() => jest.clearAllMocks())

describe('BudgetChip', () => {
  it('names the open budget and opens the switcher', () => {
    const utils = renderWithProviders(<BudgetChip />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    expect(utils.getByTestId('budget-chip')).toHaveTextContent('Personal')
    // Our icon, not the emoji the budget was made with.
    expect(utils.getByTestId('budget-icon-Bird')).toBeTruthy()
    expect(utils.queryByText('🐦')).toBeNull()
    fireEvent.press(utils.getByTestId('budget-chip'))
    expect(utils.getByText('Your budgets')).toBeTruthy()
  })
})

describe('BudgetChip name', () => {
  afterEach(() => {
    jest.useRealTimers()
    setActiveBudget(null)
  })
  const nameShown = (utils: ReturnType<typeof renderWithProviders>) => utils.getByTestId('budget-chip-name', { includeHiddenElements: true }).props.accessibilityElementsHidden !== true

  it('shows the name on load, then folds to the icon, and says it again on a switch', () => {
    jest.useFakeTimers()
    const utils = renderWithProviders(<BudgetChip />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    expect(nameShown(utils)).toBe(true)
    act(() => jest.advanceTimersByTime(2500))
    expect(nameShown(utils)).toBe(false)
    // Still named for a screen reader once it's just the icon.
    expect(utils.getByTestId('budget-chip').props.accessibilityLabel).toBe('Personal budget')
    act(() => setActiveBudget('sp_home'))
    expect(nameShown(utils)).toBe(true)
    expect(utils.getByTestId('budget-chip')).toHaveTextContent('Home')
    act(() => jest.advanceTimersByTime(2500))
    expect(nameShown(utils)).toBe(false)
  })
})

describe('BudgetChip splash', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    setActiveBudget(null)
  })

  it('splashes around the chip as it folds to the icon, not before', () => {
    jest.useFakeTimers()
    const utils = renderWithProviders(<BudgetChip />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    expect(utils.queryByTestId('budget-chip-splash', { includeHiddenElements: true })).toBeNull()
    act(() => jest.advanceTimersByTime(2300))
    expect(utils.getByTestId('budget-chip-splash', { includeHiddenElements: true })).toBeTruthy()
    // Gone once it's played, so nothing lingers over the header.
    act(() => jest.advanceTimersByTime(2000))
    expect(utils.queryByTestId('budget-chip-splash', { includeHiddenElements: true })).toBeNull()
  })

  it('stays still with reduced motion', () => {
    jest.useFakeTimers()
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true)
    const utils = renderWithProviders(<BudgetChip />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    act(() => jest.advanceTimersByTime(2300))
    expect(utils.queryByTestId('budget-chip-splash', { includeHiddenElements: true })).toBeNull()
  })
})

describe('BudgetSwitcherSheet', () => {
  it('lists every budget, ticks the open one, and badges the ones you own and share', () => {
    const utils = renderWithProviders(<BudgetSwitcherSheet visible onClose={() => {}} />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    expect(utils.getByTestId('budget-row-u1').props.accessibilityState).toEqual({ checked: true })
    expect(utils.getByTestId('budget-row-sp_home').props.accessibilityState).toEqual({ checked: false })
    // Only the shared one: a solo budget is obviously yours.
    expect(utils.getAllByText('Owner')).toHaveLength(1)
    expect(utils.getByTestId('budget-icon-House')).toBeTruthy()
    expect(utils.queryByText('🏠')).toBeNull()
  })

  it('tags a read-only budget', () => {
    const utils = renderWithProviders(<BudgetSwitcherSheet visible onClose={() => {}} />, { queryClient: withBudgets({ budgets: [personal, { ...home, role: 'member', readOnly: true }], count: 2 }) })
    expect(utils.getByText('Read-only')).toBeTruthy()
  })

  it('switches to the budget you tap, then tells the opener', async () => {
    const onSwitch = jest.fn()
    const utils = renderWithProviders(<BudgetSwitcherSheet visible onClose={() => {}} onSwitch={onSwitch} />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    fireEvent.press(utils.getByTestId('budget-row-sp_home'))
    await waitFor(() => expect(onSwitch).toHaveBeenCalledWith('sp_home'))
  })

  it('switches to the budget you tap', () => {
    const onClose = jest.fn()
    const utils = renderWithProviders(<BudgetSwitcherSheet visible onClose={onClose} />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    fireEvent.press(utils.getByTestId('budget-row-sp_home'))
    expect(switchBudget).toHaveBeenCalledWith(expect.anything(), 'u1', 'sp_home')
    expect(onClose).toHaveBeenCalled()
  })

  it('offers "New budget" below the limit', () => {
    const utils = renderWithProviders(<BudgetSwitcherSheet visible onClose={() => {}} />, { queryClient: withBudgets({}) })
    fireEvent.press(utils.getByTestId('new-budget'))
    expect(mockPush).toHaveBeenCalledWith('/modals/new-budget')
  })

  it('offers "Join with a code" beside it, and each budget\'s members', () => {
    const utils = renderWithProviders(<BudgetSwitcherSheet visible onClose={() => {}} />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    fireEvent.press(utils.getByTestId('join-budget'))
    expect(mockPush).toHaveBeenCalledWith('/modals/join-budget')
    fireEvent.press(utils.getByLabelText('Home members and settings'))
    expect(mockPush).toHaveBeenLastCalledWith('/budget-members?id=sp_home')
  })

  it('brings back a budget deleted in the last 30 days', async () => {
    const { restoreBudget } = jest.requireMock('@/src/api/spaces')
    const deleted = [{ id: 'sp_trip', name: 'Goa', emoji: '✈️', deletedAt: '', deletedBy: 'Priya', canRestore: true }]
    const utils = renderWithProviders(<BudgetSwitcherSheet visible onClose={() => {}} />, { queryClient: withBudgets({ deleted }) })
    expect(utils.getByText('Goa · Deleted')).toBeTruthy()
    expect(utils.getByTestId('budget-icon-Airplane')).toBeTruthy()
    fireEvent.press(utils.getByLabelText('Restore Goa'))
    expect(restoreBudget).toHaveBeenCalledWith('sp_trip')
  })

  it('says "5 of 5 budgets" at the limit, and where to ask for more', () => {
    const utils = renderWithProviders(<BudgetSwitcherSheet visible onClose={() => {}} />, { queryClient: withBudgets({ budgets: [personal, home], count: 5, limit: 5 }) })
    expect(utils.queryByTestId('new-budget')).toBeNull()
    expect(utils.getByText('5 of 5 budgets')).toBeTruthy()
    // Join still works at the limit: it doesn't add one of yours.
    expect(utils.getByTestId('join-budget')).toBeTruthy()
    fireEvent.press(utils.getByText('Contact us'))
    expect(mockPush).toHaveBeenCalledWith('/account/feedback')
  })
})

describe('MoveExpenseSheet', () => {
  const expense = { id: 'e1', version: 2, item: 'Milk', category: 'Groceries' } as ExpenseRow

  it('moves the expense to the budget and category picked, preselecting the same category', async () => {
    const utils = renderWithProviders(<MoveExpenseSheet expense={expense} onClose={() => {}} />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    fireEvent.press(utils.getByTestId('move-budget-sp_home'))
    await waitFor(() => expect(getBudgetCategories).toHaveBeenCalledWith('sp_home'))
    await waitFor(() => expect(utils.getByText('Groceries').parent?.parent?.props.accessibilityState).toEqual({ checked: true }))
    fireEvent.press(utils.getByTestId('move-confirm'))
    await waitFor(() => expect(moveExpense).toHaveBeenCalledWith({ id: 'e1', version: 2, to: 'sp_home', category: 'Groceries' }))
  })

  it('never offers the budget it is already in', () => {
    const utils = renderWithProviders(<MoveExpenseSheet expense={expense} onClose={() => {}} />, { queryClient: withBudgets({ budgets: [personal, home], count: 2 }) })
    expect(utils.queryByTestId('move-budget-u1')).toBeNull()
  })
})
