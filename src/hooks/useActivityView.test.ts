import { act, renderHook, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { useActivityView } from './useActivityView'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))

const get = SecureStore.getItemAsync as jest.Mock
const set = SecureStore.setItemAsync as jest.Mock

beforeEach(() => jest.clearAllMocks())

it('has no choice when nothing is stored', async () => {
  const { result } = renderHook(() => useActivityView())
  await waitFor(() => expect(get).toHaveBeenCalled())
  expect(result.current[0]).toBeNull()
})

it('restores a stored feed choice', async () => {
  get.mockResolvedValueOnce('feed')
  const { result } = renderHook(() => useActivityView())
  await waitFor(() => expect(result.current[0]).toBe('feed'))
})

it('remembers a switch', async () => {
  const { result } = renderHook(() => useActivityView())
  act(() => result.current[1]('feed'))
  expect(result.current[0]).toBe('feed')
  expect(set).toHaveBeenCalledWith('mc-activity-view', 'feed')
})

it('restores a stored list choice', async () => {
  get.mockResolvedValueOnce('list')
  const { result } = renderHook(() => useActivityView())
  await waitFor(() => expect(result.current[0]).toBe('list'))
})
