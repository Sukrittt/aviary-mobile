import { Share } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders, createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import BudgetMembersScreen from './budget-members'
import { budgetsKey } from '@/src/hooks/useBudgetSpaces'
import { cancelInvite, createInvite, deleteBudget, getBudgetMembers, getBudgets, removeMember, setNotifyOthers } from '@/src/api/spaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { setActiveBudget } from '@/src/lib/activeBudget'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }), useLocalSearchParams: () => ({ id: 'sp_home' }) }))
let mockUid = 'u2'
jest.mock('@/src/api/accessMode', () => ({ currentUserId: () => mockUid, accessMode: { subscribeLogout: () => () => {}, subscribe: () => () => {} } }))
jest.mock('@/src/lib/budgetSwitch', () => ({ switchBudget: jest.fn(async () => {}) }))
jest.mock('@/src/api/spaces', () => ({
  ...jest.requireActual('@/src/api/spaces'),
  getBudgets: jest.fn(),
  getBudgetMembers: jest.fn(),
  createInvite: jest.fn(async () => ({ code: 'AB12CD', url: 'https://www.useaviary.com/join/AB12CD', expiresAt: '2026-10-27T00:00:00Z' })),
  cancelInvite: jest.fn(async () => {}),
  removeMember: jest.fn(async () => {}),
  setNotifyOthers: jest.fn(async () => {}),
  deleteBudget: jest.fn(async () => {}),
  updateBudget: jest.fn(async () => ({})),
}))

const m = (userId: string, name: string, role: 'owner' | 'member') => ({ userId, name, avatarUrl: null, role, joinedAt: '2026-10-01T00:00:00Z' })
const members = [m('u2', 'Priya Shah', 'owner'), m('u1', 'Rahul Verma', 'member')]
const home = { id: 'sp_home', name: 'Home', emoji: '🏠', ownerId: 'u2', currencyCode: 'INR', personal: false, members }
const personal = { id: 'u1', name: 'Personal', emoji: '🐦', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: true, members: [] }

function setup(role: 'owner' | 'member') {
  mockUid = role === 'owner' ? 'u2' : 'u1'
  const list = { budgets: [personal, { ...home, role }], count: 2, limit: 5, activeId: 'u1' }
  ;(getBudgets as jest.Mock).mockResolvedValue({ ...list, budgets: [personal] })
  ;(getBudgetMembers as jest.Mock).mockResolvedValue({ members, role, notifyOthers: false, ...(role === 'owner' && { invites: [{ code: 'OLD111', url: 'https://www.useaviary.com/join/OLD111', expiresAt: '2026-10-25T00:00:00Z' }] }) })
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(budgetsKey, list)
  return renderWithProviders(<BudgetMembersScreen />, { queryClient })
}

let share: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
  setActiveBudget(null)
})

describe('as the owner', () => {
  it('invites through the share sheet and shows the code big', async () => {
    const utils = setup('owner')
    expect(await utils.findByText('Rahul Verma')).toBeTruthy()
    expect(utils.getByText('Owner · Joined 1 Oct 2026')).toBeTruthy()
    fireEvent.press(utils.getByTestId('invite'))
    await waitFor(() => expect(createInvite).toHaveBeenCalledWith('sp_home'))
    expect(share).toHaveBeenCalledWith({ message: 'Join our Home budget on Aviary: https://www.useaviary.com/join/AB12CD · Code AB12CD' })
    expect((await utils.findByTestId('invite-code')).props.children).toBe('AB12CD')
  })

  it('shares or cancels a pending invite', async () => {
    const utils = setup('owner')
    fireEvent.press(await utils.findByLabelText('Share OLD111 again'))
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('Code OLD111') })
    fireEvent.press(utils.getByLabelText('Cancel OLD111'))
    await waitFor(() => expect(cancelInvite).toHaveBeenCalledWith('sp_home', 'OLD111'))
  })

  it('removes someone after saying what happens', async () => {
    const utils = setup('owner')
    fireEvent.press(await utils.findByLabelText('Remove Rahul Verma'))
    expect(utils.getByText('Rahul loses access to Home. What they logged stays.')).toBeTruthy()
    fireEvent.press(utils.getAllByText('Remove').at(-1)!)
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('sp_home', 'u1'))
  })

  it('deletes only once the name is typed', async () => {
    const utils = setup('owner')
    expect(utils.queryByTestId('leave-budget')).toBeNull()
    fireEvent.press(await utils.findByTestId('delete-budget'))
    expect(utils.getByText(/You can restore it for 30 days\./)).toBeTruthy()
    expect(utils.getByRole('button', { name: 'Delete budget', disabled: true })).toBeTruthy()
    fireEvent.changeText(utils.getByLabelText('Budget name to confirm'), 'Home')
    fireEvent.press(utils.getAllByText('Delete budget').at(-1)!)
    await waitFor(() => expect(deleteBudget).toHaveBeenCalledWith('sp_home', 'Home'))
  })
})

describe('as a member', () => {
  it("can't invite or remove, and leaves into another budget", async () => {
    setActiveBudget('sp_home')
    const utils = setup('member')
    expect(await utils.findByText('Rahul Verma (you)')).toBeTruthy()
    expect(utils.queryByTestId('invite')).toBeNull()
    expect(utils.queryByText('Remove')).toBeNull()
    expect(utils.queryByTestId('delete-budget')).toBeNull()
    fireEvent.press(utils.getByTestId('leave-budget'))
    expect(utils.getByText("You'll lose access to Home budget. Expenses you logged stay in it.")).toBeTruthy()
    fireEvent.press(utils.getAllByText('Leave budget').at(-1)!)
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('sp_home', 'me'))
    await waitFor(() => expect(switchBudget).toHaveBeenCalledWith(expect.anything(), 'u1', 'u1'))
    expect(mockBack).toHaveBeenCalled()
  })

  it('turns on hearing about what others log', async () => {
    const utils = setup('member')
    const toggle = await utils.findByLabelText('Tell me when others log')
    expect(toggle.props.accessibilityState.checked).toBe(false)
    fireEvent.press(toggle)
    await waitFor(() => expect(setNotifyOthers).toHaveBeenCalledWith('sp_home', true))
  })
})
