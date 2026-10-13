import { act, renderHook, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { accessMode } from '@/src/api/accessMode'
import { useTourProgress } from './useTourProgress'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))
// Listeners live in the factory: the hook subscribes at import, before any
// test-file const is initialised.
jest.mock('@/src/api/accessMode', () => {
  const listeners = new Set<() => void>()
  return {
    accessMode: {
      subscribeLogout: (fn: () => void) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
      logout: () => listeners.forEach((fn) => fn()),
    },
  }
})
const logout = (accessMode as unknown as { logout: () => void }).logout

const get = SecureStore.getItemAsync as jest.Mock
const set = SecureStore.setItemAsync as jest.Mock
const del = SecureStore.deleteItemAsync as jest.Mock

beforeEach(() => jest.clearAllMocks())

it('starts with nothing done', async () => {
  const { result } = renderHook(() => useTourProgress())
  await waitFor(() => expect(get).toHaveBeenCalledWith('mc-tour-done'))
  expect(result.current[0].size).toBe(0)
})

it('restores stored chapters on mount', async () => {
  get.mockResolvedValueOnce(JSON.stringify([0, 3]))
  const { result } = renderHook(() => useTourProgress())

  await waitFor(() => expect(result.current[0].has(3)).toBe(true))
  expect(result.current[0].has(0)).toBe(true)
})

it('persists a completed chapter', async () => {
  const { result } = renderHook(() => useTourProgress())
  await waitFor(() => expect(get).toHaveBeenCalled())

  act(() => result.current[1](new Set([2])))

  await waitFor(() => expect(set).toHaveBeenCalledWith('mc-tour-done', JSON.stringify([2])))
})

it('does not overwrite the stored value before it has loaded', async () => {
  get.mockReturnValueOnce(new Promise(() => {}))
  renderHook(() => useTourProgress())

  await act(async () => {})
  expect(set).not.toHaveBeenCalled()
})

it('clears stored progress on sign-out even when the tour is not open', () => {
  logout()
  expect(del).toHaveBeenCalledWith('mc-tour-done')
})

it('resets progress on screen when signing out with the tour open', async () => {
  get.mockResolvedValueOnce(JSON.stringify([0, 3]))
  const { result } = renderHook(() => useTourProgress())
  await waitFor(() => expect(result.current[0].size).toBe(2))

  act(() => logout())

  expect(result.current[0].size).toBe(0)
  expect(del).toHaveBeenCalledWith('mc-tour-done')
})
