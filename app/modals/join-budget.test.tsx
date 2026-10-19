import { act, fireEvent, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { renderWithProviders, createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import JoinBudgetModal from './join-budget'
import { budgetsKey } from '@/src/hooks/useBudgetSpaces'
import { BudgetRefusedError, joinBudget, previewJoin } from '@/src/api/spaces'
import { switchBudget } from '@/src/lib/budgetSwitch'

const mockBack = jest.fn()
let mockParams: { code?: string } = {}
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }), useLocalSearchParams: () => mockParams }))
jest.mock('@/src/api/accessMode', () => ({ currentUserId: () => 'u1', accessMode: { subscribeLogout: () => () => {}, subscribe: () => () => {} } }))
jest.mock('@/src/lib/budgetSwitch', () => ({ switchBudget: jest.fn(async () => {}) }))
jest.mock('@/src/api/spaces', () => ({
  ...jest.requireActual('@/src/api/spaces'),
  getBudgets: jest.fn(async () => ({ budgets: [], count: 1, limit: 5, activeId: 'u1' })),
  previewJoin: jest.fn(),
  joinBudget: jest.fn(async () => ({ spaceId: 'sp_home', already: false })),
}))

const personal = { id: 'u1', name: 'Personal', emoji: '🐦', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: true, members: [] }
const ok = { status: 'ok', budget: { id: 'sp_home', name: 'Home', emoji: '🏠' }, inviter: 'Priya', members: 2 }

function setup({ count = 1, budgets = [personal] as unknown[] } = {}) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(budgetsKey, { budgets, count, limit: 5, activeId: 'u1' })
  return renderWithProviders(<JoinBudgetModal />, { queryClient })
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockParams = {}
  await AsyncStorage.clear()
})

it('cleans what you type, previews the invite, joins, opens it and shows the intro once', async () => {
  ;(previewJoin as jest.Mock).mockResolvedValue(ok)
  const utils = setup()
  fireEvent.changeText(utils.getByLabelText('Invite code'), 'ab-12 cd')
  expect(utils.getByLabelText('Invite code').props.value).toBe('AB12CD')
  expect(await utils.findByText('Join Home budget?')).toBeTruthy()
  expect(utils.getByText('Your own budget stays exactly as it is.')).toBeTruthy()
  expect(previewJoin).toHaveBeenCalledWith('AB12CD')

  jest.useFakeTimers()
  fireEvent.press(utils.getByText('Join Home'))
  await waitFor(() => expect(joinBudget).toHaveBeenCalledWith('AB12CD'))
  await act(async () => { jest.advanceTimersByTime(1200) })
  jest.useRealTimers()
  await waitFor(() => expect(switchBudget).toHaveBeenCalledWith(expect.anything(), 'u1', 'sp_home'))
  expect(await utils.findByText('You and Priya share this budget')).toBeTruthy()
  fireEvent.press(utils.getByText('Next'))
  expect(utils.getByText('Switch budgets from here')).toBeTruthy()
  fireEvent.press(utils.getByText('Got it'))
  expect(mockBack).toHaveBeenCalled()
  expect(await AsyncStorage.getItem('aviary-budget-intro:sp_home')).toBe('1')
})

it('opens a link with the code already in', async () => {
  mockParams = { code: 'zz99zz' }
  ;(previewJoin as jest.Mock).mockResolvedValue(ok)
  const utils = setup()
  expect(await utils.findByText('Join Home budget?')).toBeTruthy()
  expect(previewJoin).toHaveBeenCalledWith('ZZ99ZZ')
})

it.each([
  ['at your budget limit', { count: 5 }, ok, "You're at 5 budgets. Leave one to join."],
  ['the budget is full', {}, { ...ok, members: 6 }, 'Home is full. 6 people is the most a budget can have.'],
  ['the invite expired', {}, { ...ok, status: 'expired' }, 'This invite has expired. Ask Priya for a new one.'],
  ['the invite was cancelled', {}, { ...ok, status: 'cancelled' }, 'This invite has expired. Ask Priya for a new one.'],
  ['the code is wrong', {}, { status: 'not_found' }, "That code doesn't match an invite. Check it and try again."],
])('says why when %s', async (_, opts, preview, copy) => {
  mockParams = { code: 'AB12CD' }
  ;(previewJoin as jest.Mock).mockResolvedValue(preview)
  const utils = setup(opts)
  expect(await utils.findByText(copy)).toBeTruthy()
  expect(utils.queryByText('Join Home')).toBeNull()
})

it('explains a refusal from the join itself', async () => {
  mockParams = { code: 'AB12CD' }
  ;(previewJoin as jest.Mock).mockResolvedValue(ok)
  ;(joinBudget as jest.Mock).mockRejectedValueOnce(new BudgetRefusedError(409, 'FULL'))
  const utils = setup()
  fireEvent.press(await utils.findByText('Join Home'))
  expect(await utils.findByText('Home is full. 6 people is the most a budget can have.')).toBeTruthy()
})

it("just opens a budget you're already in", async () => {
  mockParams = { code: 'AB12CD' }
  ;(previewJoin as jest.Mock).mockResolvedValue(ok)
  const utils = setup({ budgets: [personal, { ...personal, id: 'sp_home', name: 'Home', personal: false }] })
  fireEvent.press(await utils.findByText('Open Home'))
  await waitFor(() => expect(switchBudget).toHaveBeenCalledWith(expect.anything(), 'u1', 'sp_home'))
  await waitFor(() => expect(mockBack).toHaveBeenCalled())
  expect(joinBudget).not.toHaveBeenCalled()
})
