import { act, renderHook, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { useRecentCategories } from './useRecentCategories'
import { setActiveBudget } from '@/src/lib/activeBudget'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))

let logoutHandler: (() => void) | null = null
let mockUid: string | null = 'user_a'
jest.mock('@/src/api/accessMode', () => ({
  currentUserId: () => mockUid,
  accessMode: {
    subscribeLogout: (fn: () => void) => {
      logoutHandler = fn
      return () => { logoutHandler = null }
    },
  },
}))

const get = SecureStore.getItemAsync as jest.Mock
const set = SecureStore.setItemAsync as jest.Mock
const del = SecureStore.deleteItemAsync as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  logoutHandler = null
  mockUid = 'user_a'
  setActiveBudget(null)
})

it('restores the stored recents on mount', async () => {
  get.mockResolvedValueOnce(JSON.stringify(['Fuel', 'Food']))
  const { result } = renderHook(() => useRecentCategories())

  await waitFor(() => expect(result.current.recents).toEqual(['Fuel', 'Food']))
  expect(get).toHaveBeenCalledWith('mc-recent-categories-user_a')
})

it('records a pick at the front and persists it', async () => {
  const { result } = renderHook(() => useRecentCategories())
  await waitFor(() => expect(get).toHaveBeenCalled())

  act(() => result.current.record('Groceries'))

  await waitFor(() => expect(result.current.recents).toEqual(['Groceries']))
  expect(set).toHaveBeenCalledWith('mc-recent-categories-user_a', JSON.stringify(['Groceries']))
})

it('clears recents on logout so the next account starts fresh', async () => {
  get.mockResolvedValueOnce(JSON.stringify(['Food']))
  const { result } = renderHook(() => useRecentCategories())
  await waitFor(() => expect(result.current.recents).toEqual(['Food']))

  act(() => logoutHandler?.())

  await waitFor(() => expect(result.current.recents).toEqual([]))
  expect(del).toHaveBeenCalledWith('mc-recent-categories-user_a')
})

it('keeps each budget its own recents, and swaps them on a switch', async () => {
  get.mockImplementation(async (key: string) => (key === 'mc-recent-categories-user_a-sp_trip' ? JSON.stringify(['Hotel']) : JSON.stringify(['Fuel'])))
  const { result } = renderHook(() => useRecentCategories())
  await waitFor(() => expect(result.current.recents).toEqual(['Fuel']))

  act(() => setActiveBudget('sp_trip'))
  await waitFor(() => expect(result.current.recents).toEqual(['Hotel']))

  act(() => result.current.record('Snorkel'))
  await waitFor(() => expect(set).toHaveBeenCalledWith('mc-recent-categories-user_a-sp_trip', JSON.stringify(['Snorkel', 'Hotel'])))
  get.mockReset().mockResolvedValue(null)
})

it("never shows another account's personal recents, even after signing out from a shared budget", async () => {
  get.mockImplementation(async (key: string) => (key === 'mc-recent-categories-user_a' ? JSON.stringify(['Fuel']) : null))
  setActiveBudget('sp_home')
  const first = renderHook(() => useRecentCategories())
  await waitFor(() => expect(get).toHaveBeenCalledWith('mc-recent-categories-user_a-sp_home'))
  act(() => logoutHandler?.())
  first.unmount()

  mockUid = 'user_b'
  setActiveBudget(null)
  const { result } = renderHook(() => useRecentCategories())
  await waitFor(() => expect(get).toHaveBeenCalledWith('mc-recent-categories-user_b'))
  expect(result.current.recents).toEqual([])
  get.mockReset().mockResolvedValue(null)
})
