import { QueryClient } from '@tanstack/react-query'
import { fallbackBudgetId, handleLostBudget, loggedBy, onlyMine, readOnlyCopy } from './budgetMembership'
import { setActiveBudget } from './activeBudget'
import { switchBudget } from './budgetSwitch'
import { getBudgets, type Budget, type BudgetList } from '@/src/api/spaces'
import { Alert } from '@/src/components/ui/AlertHost'

jest.mock('./budgetSwitch', () => ({ switchBudget: jest.fn(async () => {}) }))
jest.mock('@/src/api/spaces', () => ({ getBudgets: jest.fn() }))
jest.mock('@/src/api/accessMode', () => ({ currentUserId: () => 'u1' }))

const member = (userId: string, name: string, role: 'owner' | 'member' = 'member') => ({ userId, name, avatarUrl: null, role, joinedAt: null })
const personal: Budget = { id: 'u1', name: 'Personal', emoji: '🐦', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: true, members: [member('u1', 'Sukrit', 'owner')] }
const home: Budget = { id: 'sp_home', name: 'Home', emoji: '🏠', role: 'member', ownerId: 'u2', currencyCode: 'INR', personal: false, members: [member('u2', 'Priya Shah', 'owner'), member('u1', 'Sukrit')] }
const list = (over: Partial<BudgetList> = {}): BudgetList => ({ budgets: [personal, home], count: 2, limit: 5, activeId: 'u1', ...over })

let qc: QueryClient
let alert: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  qc.setQueryData(['spaces'], list())
  setActiveBudget('sp_home')
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
})

describe('handleLostBudget', () => {
  it("says you're out, once, however many requests were refused, then opens personal", async () => {
    ;(getBudgets as jest.Mock).mockResolvedValue(list({ budgets: [personal] }))
    await Promise.all([handleLostBudget(qc, 'u1', 'sp_home'), handleLostBudget(qc, 'u1', 'sp_home'), handleLostBudget(qc, 'u1', null)])
    expect(getBudgets).toHaveBeenCalledTimes(1)
    expect(switchBudget).toHaveBeenCalledTimes(1)
    expect(switchBudget).toHaveBeenCalledWith(qc, 'u1', 'u1')
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert).toHaveBeenCalledWith("You're no longer in Home budget.", "You're back in Personal.", undefined, { sticky: true })
  })

  it('names who deleted it', async () => {
    ;(getBudgets as jest.Mock).mockResolvedValue(list({ budgets: [personal], deleted: [{ id: 'sp_home', name: 'Home', emoji: '🏠', deletedAt: '', deletedBy: 'Priya', canRestore: false }] }))
    await handleLostBudget(qc, 'u1', 'sp_home')
    expect(alert).toHaveBeenCalledWith('Home budget was deleted by Priya.', expect.anything(), undefined, { sticky: true })
  })

  it("ignores a refusal for a budget that isn't open", async () => {
    await handleLostBudget(qc, 'u1', 'sp_other')
    expect(getBudgets).not.toHaveBeenCalled()
    expect(alert).not.toHaveBeenCalled()
  })

  it('does nothing when the fresh list says you are still in it', async () => {
    ;(getBudgets as jest.Mock).mockResolvedValue(list())
    await handleLostBudget(qc, 'u1', 'sp_home')
    expect(switchBudget).not.toHaveBeenCalled()
    expect(alert).not.toHaveBeenCalled()
  })
})

it("falls back to the server's pick, then personal, then the first left", () => {
  const trip = { ...home, id: 'sp_trip' }
  expect(fallbackBudgetId(list({ budgets: [home, trip], activeId: 'sp_trip' }), 'sp_home')).toBe('sp_trip')
  expect(fallbackBudgetId(list({ activeId: 'sp_home' }), 'sp_home')).toBe('u1')
  expect(fallbackBudgetId(list({ budgets: [home, trip], activeId: null }), 'sp_home')).toBe('sp_trip')
})

it('reads a null created_by as the owner, for Mine and the avatar', () => {
  const rows = [{ id: 'a', created_by: null }, { id: 'b', created_by: 'u1' }, { id: 'c', created_by: 'u3' }]
  expect(onlyMine(rows, home, 'u1').map((r) => r.id)).toEqual(['b'])
  expect(onlyMine(rows, home, 'u2').map((r) => r.id)).toEqual(['a'])
  expect(loggedBy(rows[0], home)?.name).toBe('Priya Shah')
})

it("names the owner in the read-only copy", () => {
  expect(readOnlyCopy(home)).toBe("Priya's plan has lapsed. You can view and export everything; logging comes back once they renew.")
  expect(readOnlyCopy(null)).toMatch(/^The owner's plan has lapsed\./)
})
