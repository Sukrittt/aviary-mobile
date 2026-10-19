import { act, renderHook } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { useActivityView } from './useActivityView'

jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => null),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))

const get = SecureStore.getItem as jest.Mock
const set = SecureStore.setItemAsync as jest.Mock

beforeEach(() => jest.clearAllMocks())

it('has no choice when nothing is stored', () => {
  const { result } = renderHook(() => useActivityView())
  expect(result.current[0]).toBeNull()
})

it('restores a stored feed choice', () => {
  get.mockReturnValueOnce('feed')
  const { result } = renderHook(() => useActivityView())
  expect(result.current[0]).toBe('feed')
})

it('remembers a switch', async () => {
  const { result } = renderHook(() => useActivityView())
  act(() => result.current[1]('feed'))
  expect(result.current[0]).toBe('feed')
  expect(set).toHaveBeenCalledWith('mc-activity-view', 'feed')
})

// The first render already has it, so Activity never flashes the feed before a stored list.
it('restores a stored list choice on the first render', () => {
  get.mockReturnValueOnce('list')
  const { result } = renderHook(() => useActivityView())
  expect(result.current[0]).toBe('list')
})
