import { QueryClient, QueryObserver } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { switchBudget } from './budgetSwitch'
import { activeBudgetId, setActiveBudget } from './activeBudget'
import { setOnline } from './netStatus'

// A plain in-memory mockStore standing in for the sealed one.
const mockStore = new Map<string, unknown>()
jest.mock('./encryptedStorage', () => ({
  readEncrypted: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  writeEncrypted: jest.fn(async (k: string, v: unknown) => void mockStore.set(k, v)),
}))
jest.mock('@/src/api/accessMode', () => ({ currentUserId: () => 'user_a' }))

let qc: QueryClient
beforeEach(async () => {
  mockStore.clear()
  await AsyncStorage.clear()
  setActiveBudget(null)
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, staleTime: Infinity } } })
})
afterEach(() => qc.clear())

it("swaps the screens' data for the other budget's and back, with no network", async () => {
  qc.setQueryData(['budgets'], ['personal row'])
  await switchBudget(qc, 'user_a', 'sp_home')
  expect(activeBudgetId()).toBe('sp_home')
  // Nothing of the personal budget's left on screen.
  expect(qc.getQueryData(['budgets'])).toBeUndefined()

  qc.setQueryData(['budgets'], ['home row'])
  await switchBudget(qc, 'user_a', 'user_a')
  expect(activeBudgetId()).toBeNull()
  expect(qc.getQueryData(['budgets'])).toEqual(['personal row'])

  await switchBudget(qc, 'user_a', 'sp_home')
  expect(qc.getQueryData(['budgets'])).toEqual(['home row'])
})

it('refreshes what a mounted screen shows, not just the cache', async () => {
  // A screen's useQuery stays mounted through a switch: it must get the opened budget's data.
  const observer = new QueryObserver(qc, { queryKey: ['budgets'], queryFn: async () => [`rows of ${activeBudgetId() ?? 'personal'}`] })
  const unsubscribe = observer.subscribe(() => {})
  await new Promise((r) => setTimeout(r, 0))
  expect(observer.getCurrentResult().data).toEqual(['rows of personal'])
  await switchBudget(qc, 'user_a', 'sp_home')
  await new Promise((r) => setTimeout(r, 0))
  expect(observer.getCurrentResult().data).toEqual(['rows of sp_home'])
  unsubscribe()
})

it('keeps the budget list across a switch, so the switcher never blinks', async () => {
  qc.setQueryData(['spaces'], { budgets: [1, 2] })
  await switchBudget(qc, 'user_a', 'sp_home')
  expect(qc.getQueryData(['spaces'])).toEqual({ budgets: [1, 2] })
})

it('remembers the budget on this device', async () => {
  await switchBudget(qc, 'user_a', 'sp_home')
  expect(JSON.parse((await AsyncStorage.getItem('aviary-active-budget'))!)).toEqual({ uid: 'user_a', spaceId: 'sp_home' })
  await switchBudget(qc, 'user_a', 'user_a')
  expect(await AsyncStorage.getItem('aviary-active-budget')).toBeNull()
})

it('does nothing when asked for the budget already open', async () => {
  qc.setQueryData(['budgets'], ['personal row'])
  await switchBudget(qc, 'user_a', 'user_a')
  expect(qc.getQueryData(['budgets'])).toEqual(['personal row'])
})

it('refetches the opened budget once the network comes back, after a switch made offline', async () => {
  setOnline(false)
  setOnline(false)
  await switchBudget(qc, 'user_a', 'sp_home')
  const invalidate = jest.spyOn(qc, 'invalidateQueries')
  setOnline(true)
  expect(invalidate).toHaveBeenCalled()
})
