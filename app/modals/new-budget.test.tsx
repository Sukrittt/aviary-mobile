import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders, createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import NewBudgetModal from './new-budget'
import { budgetsKey } from '@/src/hooks/useBudgetSpaces'
import { createBudget, BudgetLimitError } from '@/src/api/spaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { Alert } from '@/src/components/ui/AlertHost'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }))
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
  fireEvent.press(utils.getByLabelText('✈️'))
  fireEvent.press(utils.getByText('Create budget'))
  await waitFor(() => expect(createBudget).toHaveBeenCalledWith({ name: 'Goa trip', emoji: '✈️', currencyCode: 'INR', copyCategories: true }))
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
