import { act } from '@testing-library/react-native'
import { renderWithProviders, createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import { BudgetAccessWatcher } from './BudgetAccessWatcher'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { setActiveBudget } from '@/src/lib/activeBudget'
import { emitBudgetAccess } from '@/src/lib/budgetAccess'
import { setPendingJoinCode } from '@/src/lib/pendingJoin'
import { Alert } from '@/src/components/ui/AlertHost'

const mockPush = jest.fn()
let mockList: { data: unknown; isFetchedAfterMount: boolean }
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/src/api/accessMode', () => ({ currentUserId: () => 'u1', accessMode: { subscribeLogout: () => () => {}, subscribe: () => () => {} } }))
jest.mock('@/src/lib/budgetSwitch', () => ({ switchBudget: jest.fn(async () => {}) }))
jest.mock('@/src/lib/notifications', () => ({ setNotificationBudgetSwitch: jest.fn() }))
jest.mock('@/src/hooks/useBudgetSpaces', () => ({ useBudgetList: () => mockList }))

const home = { id: 'sp_home', name: 'Home', emoji: '🏠', role: 'member', ownerId: 'u2', personal: false, readOnly: true, members: [{ userId: 'u2', name: 'Priya', role: 'owner' }] }

beforeEach(() => {
  jest.clearAllMocks()
  setActiveBudget(null)
  mockList = { data: { budgets: [home], count: 1, limit: 5, activeId: 'sp_home' }, isFetchedAfterMount: true }
})

it("lands someone with no personal budget in the server's pick", () => {
  renderWithProviders(<BudgetAccessWatcher />)
  expect(switchBudget).toHaveBeenCalledWith(expect.anything(), 'u1', 'sp_home')
})

it('waits for a fresh list before second-guessing the saved budget', () => {
  mockList = { ...mockList, isFetchedAfterMount: false }
  renderWithProviders(<BudgetAccessWatcher />)
  expect(switchBudget).not.toHaveBeenCalled()
})

it('explains a read-only write in words, never the paywall', () => {
  setActiveBudget('sp_home')
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(['spaces'], mockList.data)
  renderWithProviders(<BudgetAccessWatcher />, { queryClient })
  act(() => emitBudgetAccess({ kind: 'read_only' }))
  expect(alert).toHaveBeenCalledWith('This budget is read-only', "Priya's plan has lapsed. You can view and export everything; logging comes back once they renew.", [{ text: 'Got it' }], { sticky: true })
  expect(mockPush).not.toHaveBeenCalled()
})

it('opens an invite link that came in before sign-in, then any later one', () => {
  setActiveBudget('sp_home')
  setPendingJoinCode('ab12cd')
  renderWithProviders(<BudgetAccessWatcher />)
  expect(mockPush).toHaveBeenCalledWith('/modals/join-budget?code=AB12CD')
  act(() => setPendingJoinCode('ZZ99ZZ'))
  expect(mockPush).toHaveBeenLastCalledWith('/modals/join-budget?code=ZZ99ZZ')
})
