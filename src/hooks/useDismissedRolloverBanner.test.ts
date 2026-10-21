import { act, renderHook, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { useDismissedRolloverBanner } from './useDismissedRolloverBanner'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))

const get = SecureStore.getItemAsync as jest.Mock
const set = SecureStore.setItemAsync as jest.Mock

beforeEach(() => jest.clearAllMocks())

it('starts unknown (null) before the stored value has loaded, so callers do not flash the banner', () => {
  get.mockReturnValueOnce(new Promise(() => {}))
  const { result } = renderHook(() => useDismissedRolloverBanner('2026-08'))
  expect(result.current[0]).toBe(null)
})

it('starts undismissed when nothing is stored for the month', async () => {
  const { result } = renderHook(() => useDismissedRolloverBanner('2026-08'))
  await waitFor(() => expect(result.current[0]).toBe(false))
})

it('restores a stored dismissal on mount', async () => {
  get.mockResolvedValueOnce('1')
  const { result } = renderHook(() => useDismissedRolloverBanner('2026-08'))

  await waitFor(() => expect(result.current[0]).toBe(true))
})

it('persists a dismissal under the month key', async () => {
  const { result } = renderHook(() => useDismissedRolloverBanner('2026-08'))
  await waitFor(() => expect(get).toHaveBeenCalled())

  act(() => result.current[1](true))

  await waitFor(() => expect(set).toHaveBeenCalledWith('mc-rollover-dismissed-2026-08', '1'))
})

it('does not overwrite the stored value before it has loaded', async () => {
  get.mockReturnValueOnce(new Promise(() => {}))
  renderHook(() => useDismissedRolloverBanner('2026-08'))

  await act(async () => {})
  expect(set).not.toHaveBeenCalled()
})

it('keys the dismissal by month, so a new month starts fresh', async () => {
  const { result, rerender } = renderHook(({ month }: { month: string }) => useDismissedRolloverBanner(month), {
    initialProps: { month: '2026-08' },
  })
  await waitFor(() => expect(get).toHaveBeenCalledWith('mc-rollover-dismissed-2026-08'))
  act(() => result.current[1](true))
  await waitFor(() => expect(result.current[0]).toBe(true))

  get.mockResolvedValueOnce(null)
  rerender({ month: '2026-09' })

  await waitFor(() => expect(get).toHaveBeenCalledWith('mc-rollover-dismissed-2026-09'))
  await waitFor(() => expect(result.current[0]).toBe(false))
})

it("ignores a late read for a key it's moved off", async () => {
  let resolveOld!: (v: string | null) => void
  get.mockReturnValueOnce(new Promise((r) => (resolveOld = r))).mockResolvedValueOnce(null)
  const { result, rerender } = renderHook(({ k }) => useDismissedRolloverBanner(k), { initialProps: { k: 'a' } })
  rerender({ k: 'b' })
  await waitFor(() => expect(result.current[0]).toBe(false))
  await act(async () => resolveOld('1'))
  expect(result.current[0]).toBe(false)
})
