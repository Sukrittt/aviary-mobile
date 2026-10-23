import { act, fireEvent, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import { renderWithProviders, createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import JoinBudgetModal, { whoIsIn } from './join-budget'
import { budgetsKey } from '@/src/hooks/useBudgetSpaces'
import { BudgetRefusedError, getBudgets, joinBudget, previewJoin } from '@/src/api/spaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { signalOnboarded } from '@/src/api/onboardingSignal'

const mockBack = jest.fn()
const mockReplace = jest.fn()
let mockParams: { code?: string; fresh?: string } = {}
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace }), useLocalSearchParams: () => mockParams }))
jest.mock('@/src/api/onboardingSignal', () => ({ signalOnboarded: jest.fn() }))
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
  ;(getBudgets as jest.Mock).mockResolvedValue({ budgets: [], count: 1, limit: 5, activeId: 'u1' })
  mockParams = {}
  await AsyncStorage.clear()
})

it('cleans what you type, previews the invite, joins, opens it and welcomes you', async () => {
  ;(previewJoin as jest.Mock).mockResolvedValue(ok)
  const member = (userId: string, name: string, role: string) => ({ userId, name, avatarUrl: null, role, joinedAt: null })
  ;(getBudgets as jest.Mock).mockResolvedValue({
    budgets: [personal, { ...personal, id: 'sp_home', name: 'Home', personal: false, members: [member('u2', 'Priya Shah', 'owner'), member('u1', 'Rahul Rao', 'member')] }],
    count: 2, limit: 5, activeId: 'u1',
  })
  const utils = setup()
  fireEvent.changeText(utils.getByLabelText('Invite code'), 'ab-12 cd')
  expect(utils.getByLabelText('Invite code').props.value).toBe('AB12CD')
  expect(['A', 'B', '1', '2', 'C', 'D'].map((c, i) => utils.getByTestId(`code-tile-${i}`).findByProps({ children: c }))).toHaveLength(6)
  expect(await utils.findByText('Priya invited you to Home')).toBeTruthy()
  expect(utils.getByText('2 people already in')).toBeTruthy()
  expect(utils.getByText('Your own budget stays exactly as it is.')).toBeTruthy()
  expect(previewJoin).toHaveBeenCalledWith('AB12CD')

  jest.useFakeTimers()
  fireEvent.press(utils.getByText('Join Home'))
  await waitFor(() => expect(joinBudget).toHaveBeenCalledWith('AB12CD'))
  await act(async () => { jest.advanceTimersByTime(1200) })
  jest.useRealTimers()
  await waitFor(() => expect(switchBudget).toHaveBeenCalledWith(expect.anything(), 'u1', 'sp_home'))
  expect(await utils.findByText("You're in, Rahul")).toBeTruthy()
  expect(utils.getByText("Everything anyone logs in Home lands here, and you'll see who added what.")).toBeTruthy()
  expect(utils.getByText('P')).toBeTruthy()
  expect(utils.getByTestId('welcome-you')).toBeTruthy()
  fireEvent.press(utils.getByText("Let's go"))
  expect(mockBack).toHaveBeenCalled()
})

it('still welcomes you when switching budgets swaps the cache out from under the preview', async () => {
  ;(previewJoin as jest.Mock).mockResolvedValue(ok)
  ;(switchBudget as jest.Mock).mockImplementationOnce(async (qc) => qc.removeQueries({ queryKey: ['join'] }))
  const utils = setup()
  fireEvent.changeText(utils.getByLabelText('Invite code'), 'AB12CD')
  jest.useFakeTimers()
  fireEvent.press(await utils.findByText('Join Home'))
  await waitFor(() => expect(joinBudget).toHaveBeenCalled())
  await act(async () => { jest.advanceTimersByTime(1200) })
  jest.useRealTimers()
  expect(await utils.findByTestId('budget-welcome')).toBeTruthy()
})

it('words an invite with no inviter name without one', async () => {
  ;(previewJoin as jest.Mock).mockResolvedValue({ ...ok, inviter: null })
  const utils = setup()
  fireEvent.changeText(utils.getByLabelText('Invite code'), 'AB12CD')
  expect(await utils.findByText("You're invited to Home")).toBeTruthy()
  jest.useFakeTimers()
  fireEvent.press(utils.getByText('Join Home'))
  await waitFor(() => expect(joinBudget).toHaveBeenCalled())
  await act(async () => { jest.advanceTimersByTime(1200) })
  jest.useRealTimers()
  expect(await utils.findByText("You're in")).toBeTruthy()
})

it("doesn't cap what you paste, so a code with dashes or spaces still fills all six", () => {
  const utils = setup()
  expect(utils.getByLabelText('Invite code').props.maxLength).toBeUndefined()
})

it('says who is already in', () => {
  expect(whoIsIn(1, 'Priya')).toBe('Just Priya so far')
  expect(whoIsIn(1, null)).toBe('Just the owner so far')
  expect(whoIsIn(4, 'Priya')).toBe('4 people already in')
  expect(whoIsIn(undefined, 'Priya')).toBeNull()
})

it('shakes with an error buzz on a code that matches nothing', async () => {
  const buzz = jest.spyOn(Haptics, 'notificationAsync').mockResolvedValue()
  ;(previewJoin as jest.Mock).mockResolvedValue({ status: 'not_found' })
  const utils = setup()
  fireEvent.changeText(utils.getByLabelText('Invite code'), 'AB12CD')
  expect(await utils.findByText('No invite with that code')).toBeTruthy()
  expect(buzz).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error)
})

it('opens a link with the code already in', async () => {
  mockParams = { code: 'zz99zz' }
  ;(previewJoin as jest.Mock).mockResolvedValue(ok)
  const utils = setup()
  expect(await utils.findByText('Priya invited you to Home')).toBeTruthy()
  expect(previewJoin).toHaveBeenCalledWith('ZZ99ZZ')
})

it.each([
  ['at your budget limit', { count: 5 }, ok, "You're at 5 budgets"],
  ['the budget is full', {}, { ...ok, members: 6 }, 'Home is full'],
  ['the invite expired', {}, { ...ok, status: 'expired' }, 'Ask Priya to send you a fresh one.'],
  ['the invite was cancelled', {}, { ...ok, status: 'cancelled' }, 'Ask Priya to send you a fresh one.'],
  ['the code is wrong', {}, { status: 'not_found' }, 'No invite with that code'],
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
  expect(await utils.findByText('Home is full')).toBeTruthy()
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

it("lets a brand-new account join instead of setting up, and sends it to setup if it backs out", async () => {
  mockParams = { code: 'AB12CD', fresh: '1' }
  ;(previewJoin as jest.Mock).mockResolvedValue(ok)
  const utils = setup()
  expect(await utils.findByText('Priya invited you to Home')).toBeTruthy()
  fireEvent.press(utils.getByRole('button', { name: 'Close' }))
  expect(mockReplace).toHaveBeenCalledWith('/setup')
  expect(signalOnboarded).not.toHaveBeenCalled()

  jest.useFakeTimers()
  fireEvent.press(utils.getByText('Join Home'))
  await waitFor(() => expect(joinBudget).toHaveBeenCalled())
  await act(async () => { jest.advanceTimersByTime(1200) })
  jest.useRealTimers()
  const go = await utils.findByText("Let's go")
  jest.useFakeTimers()
  fireEvent.press(go)
  act(() => { jest.runAllTimers() })
  jest.useRealTimers()
  expect(signalOnboarded).toHaveBeenCalledWith({ elsewhere: true })
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  expect(mockBack).not.toHaveBeenCalled()
})

it("shows where to find the code until there's an invite to show instead", async () => {
  ;(previewJoin as jest.Mock).mockResolvedValue(ok)
  const utils = setup()
  expect(utils.getByTestId('where-to-find')).toBeTruthy()
  expect(utils.getByText("Got the link instead? Tap it and we'll fill this in.")).toBeTruthy()
  fireEvent.changeText(utils.getByLabelText('Invite code'), 'AB12CD')
  expect(await utils.findByText('Priya invited you to Home')).toBeTruthy()
  expect(utils.queryByTestId('where-to-find')).toBeNull()
})

it('clears a wrong code so you can try another', async () => {
  mockParams = { code: 'AB12CD' }
  ;(previewJoin as jest.Mock).mockResolvedValue({ status: 'not_found' })
  const utils = setup()
  fireEvent.press(await utils.findByText('Try another code'))
  expect(utils.getByLabelText('Invite code').props.value).toBe('')
  expect(utils.getByTestId('where-to-find')).toBeTruthy()
})

it('draws the invite card while the code is looked up', async () => {
  ;(previewJoin as jest.Mock).mockReturnValue(new Promise(() => {}))
  const utils = setup()
  fireEvent.changeText(utils.getByLabelText('Invite code'), 'AB12CD')
  expect(await utils.findByLabelText('Looking up your invite')).toBeTruthy()
  expect(utils.queryByTestId('where-to-find')).toBeNull()
})
