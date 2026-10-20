import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders, createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import NewBudgetModal from './new-budget'
import { budgetsKey } from '@/src/hooks/useBudgetSpaces'
import { createBudget, BudgetLimitError } from '@/src/api/spaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { Alert } from '@/src/components/ui/AlertHost'

const mockBack = jest.fn()
const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack, dismissTo: mockDismissTo }) }))
let mockImportProps: { skipAsk?: boolean; onDone: () => void; onFresh: () => void } | null = null
jest.mock('@/src/components/onboarding/ImportFlow', () => ({
  ImportFlow: (props: NonNullable<typeof mockImportProps>) => {
    mockImportProps = props
    return null
  },
}))
jest.mock('@/src/api/accessMode', () => ({ currentUserId: () => 'u1', accessMode: { subscribeLogout: () => () => {}, subscribe: () => () => {} } }))
jest.mock('@/src/lib/budgetSwitch', () => ({ switchBudget: jest.fn(async () => {}) }))
jest.mock('@/src/api/spaces', () => ({
  ...jest.requireActual('@/src/api/spaces'),
  getBudgets: jest.fn(),
  createBudget: jest.fn(async () => ({ id: 'sp_new' })),
}))

const personal = { id: 'u1', name: 'Personal', emoji: '🐦', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: true, members: [] }

function setup(count = 1) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(budgetsKey, { budgets: [personal], count, limit: 5, activeId: 'u1' })
  return renderWithProviders(<NewBudgetModal />, { queryClient })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

it('creates the budget with a copy of the current categories, then opens it', async () => {
  const utils = setup()
  fireEvent.changeText(utils.getByLabelText('Budget name'), '  Goa trip ')
  fireEvent.press(utils.getByLabelText('Airplane'))
  fireEvent.press(utils.getByText('Create budget'))
  await waitFor(() => expect(createBudget).toHaveBeenCalledWith({ name: 'Goa trip', icon: 'Airplane', currencyCode: 'INR', copyCategories: true }))
  await act(async () => { jest.advanceTimersByTime(1200) })
  expect(switchBudget).toHaveBeenCalledWith(expect.anything(), 'u1', 'sp_new')
  expect(mockBack).toHaveBeenCalled()
})

it('starts empty when you turn off copying', async () => {
  const utils = setup()
  fireEvent.changeText(utils.getByLabelText('Budget name'), 'Home')
  fireEvent(utils.getByLabelText('Copy categories from Personal'), 'press')
  fireEvent.press(utils.getByText('Create budget'))
  await waitFor(() => expect(createBudget).toHaveBeenCalledWith(expect.objectContaining({ copyCategories: false })))
})

it('explains the limit instead of offering the form', () => {
  const utils = setup(5)
  expect(utils.getByText('5 of 5 budgets')).toBeTruthy()
  expect(utils.queryByLabelText('Budget name')).toBeNull()
})

it('says so kindly when the server says the limit was hit meanwhile', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  ;(createBudget as jest.Mock).mockRejectedValueOnce(new BudgetLimitError('x'))
  const utils = setup()
  fireEvent.changeText(utils.getByLabelText('Budget name'), 'Home')
  fireEvent.press(utils.getByText('Create budget'))
  await waitFor(() => expect(alert).toHaveBeenCalledWith("You're at your budget limit", expect.stringContaining('Contact us')))
})

describe('bringing in history', () => {
  beforeEach(() => {
    mockImportProps = null
  })

  async function toImport() {
    const utils = setup()
    fireEvent.changeText(utils.getByLabelText('Budget name'), 'Home')
    fireEvent.press(utils.getByLabelText('Bring in history from another app'))
    // The import brings its own categories and currency.
    expect(utils.queryByLabelText('Copy categories from Personal')).toBeNull()
    fireEvent.press(utils.getByText('Create budget'))
    await waitFor(() => expect(createBudget).toHaveBeenCalledWith({ name: 'Home', icon: 'House', currencyCode: 'INR', copyCategories: false, import: true }))
    await act(async () => { jest.advanceTimersByTime(1200) })
    return utils
  }

  it('opens the new budget, then runs the import in it and lands Home', async () => {
    const utils = await toImport()
    expect(switchBudget).toHaveBeenCalledWith(expect.anything(), 'u1', 'sp_new')
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockImportProps?.skipAsk).toBe(true)
    act(() => mockImportProps!.onDone())
    expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)')
    expect(utils.getByText('Start fresh instead')).toBeTruthy()
  })

  it('"Start fresh instead" leaves the empty budget open and goes Home', async () => {
    const utils = await toImport()
    fireEvent.press(utils.getByText('Start fresh instead'))
    expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)')
  })
})
