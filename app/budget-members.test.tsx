import { Share } from 'react-native'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders, createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import BudgetMembersScreen from './budget-members'
import { budgetsKey } from '@/src/hooks/useBudgetSpaces'
import { cancelInvite, createInvite, deleteBudget, transferBudget, getBudgetMembers, getBudgets, removeMember, setNotifyOthers } from '@/src/api/spaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { setActiveBudget } from '@/src/lib/activeBudget'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }), useLocalSearchParams: () => ({ id: mockId }) }))
let mockId = 'sp_home'
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
  transferBudget: jest.fn(async () => {}),
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
  mockId = 'sp_home'
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

  it('drops a cancelled invite at once, and brings it back if the cancel fails', async () => {
    const utils = setup('owner')
    let fail: (e: Error) => void = () => {}
    ;(cancelInvite as jest.Mock).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    fireEvent.press(await utils.findByLabelText('Cancel OLD111'))
    await waitFor(() => expect(utils.queryByLabelText('Cancel OLD111')).toBeNull())
    await act(async () => fail(new Error('offline')))
    expect(await utils.findByLabelText('Cancel OLD111')).toBeTruthy()
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

  it('takes the name in any case, as the server does', async () => {
    const utils = setup('owner')
    fireEvent.press(await utils.findByTestId('delete-budget'))
    fireEvent.changeText(utils.getByLabelText('Budget name to confirm'), 'home')
    fireEvent.press(utils.getAllByText('Delete budget').at(-1)!)
    await waitFor(() => expect(deleteBudget).toHaveBeenCalledWith('sp_home', 'home'))
  })
})

describe('handing over', () => {
  it('tells unnamed members apart by when they joined', async () => {
    mockUid = 'u2'
    const unnamed = [members[0], { ...members[1], name: null }]
    ;(getBudgetMembers as jest.Mock).mockResolvedValue({ members: unnamed, role: 'owner', notifyOthers: false })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(budgetsKey, { budgets: [personal, { ...home, role: 'owner', members: unnamed }], count: 2, limit: 5, activeId: 'u1' })
    const utils = renderWithProviders(<BudgetMembersScreen />, { queryClient })
    fireEvent.press(await utils.findByTestId('transfer-owner'))
    expect(utils.getByLabelText('Make them the owner')).toBeTruthy()
    expect(utils.getAllByText('Joined 1 Oct 2026').length).toBe(1)
  })

  it('warns before handing the budget to someone without a plan', async () => {
    // Billing follows the owner, so this would lock the budget for everyone.
    mockUid = 'u2'
    ;(getBudgetMembers as jest.Mock).mockResolvedValue({ members: [members[0], { ...members[1], lapsed: true }], role: 'owner', notifyOthers: false })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(budgetsKey, { budgets: [personal, { ...home, role: 'owner' }], count: 2, limit: 5, activeId: 'u1' })
    const utils = renderWithProviders(<BudgetMembersScreen />, { queryClient })
    fireEvent.press(await utils.findByTestId('transfer-owner'))
    expect(utils.getByText('Not subscribed')).toBeTruthy()
    fireEvent.press(utils.getByLabelText('Make Rahul Verma the owner'))
    expect(utils.getByText(/Rahul isn't subscribed, so Home goes read-only for everyone/)).toBeTruthy()
  })

  it('makes a member the owner after saying what changes, then refreshes the list', async () => {
    jest.useFakeTimers()
    const utils = setup('owner')
    fireEvent.press(await utils.findByTestId('transfer-owner'))
    fireEvent.press(utils.getByLabelText('Make Rahul Verma the owner'))
    expect(utils.getByText('Make Rahul the owner of Home?')).toBeTruthy()
    expect(utils.getByText("Rahul's plan covers Home from now on, and only they can invite, remove or delete. You stay in it.")).toBeTruthy()
    fireEvent.press(utils.getByTestId('confirm-transfer'))
    await waitFor(() => expect(transferBudget).toHaveBeenCalledWith('sp_home', 'u1'))
    await waitFor(() => expect(getBudgets).toHaveBeenCalled())
    await act(async () => { jest.advanceTimersByTime(1200) })
    expect(utils.queryByText('Make Rahul the owner of Home?')).toBeNull()
    jest.useRealTimers()
  })

  it('keeps the personal budget out of it', () => {
    mockUid = 'u1'
    ;(getBudgetMembers as jest.Mock).mockResolvedValue({ members: [], role: 'owner', notifyOthers: false })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(budgetsKey, { budgets: [personal], count: 1, limit: 5, activeId: 'u1' })
    mockId = 'u1'
    const utils = renderWithProviders(<BudgetMembersScreen />, { queryClient })
    expect(utils.getByText('Your personal budget stays yours.')).toBeTruthy()
    expect(utils.queryByTestId('transfer-owner')).toBeNull()
  })
})

describe('as a member', () => {
  it('calls you "You" when your account has no name, not "Someone (you)"', async () => {
    setActiveBudget('sp_home')
    mockUid = 'u1'
    const unnamed = members.map((x) => ({ ...x, name: null }))
    ;(getBudgetMembers as jest.Mock).mockResolvedValue({ members: unnamed, role: 'member', notifyOthers: false })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(budgetsKey, { budgets: [personal, { ...home, role: 'member', members: unnamed }], count: 2, limit: 5, activeId: 'u1' })
    const utils = renderWithProviders(<BudgetMembersScreen />, { queryClient })
    expect(await utils.findByText('You')).toBeTruthy()
    expect(utils.queryByText('Someone (you)')).toBeNull()
    expect(utils.getByText('Someone')).toBeTruthy()
  })

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
