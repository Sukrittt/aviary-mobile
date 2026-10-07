import AsyncStorage from '@react-native-async-storage/async-storage'
import * as StoreReview from 'expo-store-review'
import { ASK_EVERY_MS, MIN_LOGS, recordLogAndMaybeAsk } from './reviewPrompt'

jest.mock('expo-store-review', () => ({
  hasAction: jest.fn(),
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
}))

const NOW = 1_800_000_000_000

/** Logs `n` expenses and returns whether the last one asked. */
async function logTimes(n: number, now = NOW) {
  let asked = false
  for (let i = 0; i < n; i++) asked = await recordLogAndMaybeAsk(now)
  return asked
}

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.clearAllMocks()
  ;(StoreReview.hasAction as jest.Mock).mockResolvedValue(true)
  ;(StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(true)
  ;(StoreReview.requestReview as jest.Mock).mockResolvedValue(undefined)
})

it(`asks on the ${MIN_LOGS}th logged expense, not before`, async () => {
  expect(await logTimes(MIN_LOGS - 1)).toBe(false)
  expect(StoreReview.requestReview).not.toHaveBeenCalled()

  expect(await logTimes(1)).toBe(true)
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1)
})

it('asks at most once every 90 days', async () => {
  expect(await logTimes(MIN_LOGS)).toBe(true)
  expect(await logTimes(1, NOW + ASK_EVERY_MS - 1)).toBe(false)
  expect(await logTimes(1, NOW + ASK_EVERY_MS)).toBe(true)
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(2)
})

it('joins a call already in flight instead of counting or asking twice', async () => {
  await logTimes(MIN_LOGS - 1)
  const [a, b] = await Promise.all([recordLogAndMaybeAsk(NOW), recordLogAndMaybeAsk(NOW)])
  expect([a, b]).toEqual([true, true])
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1)
  expect(await AsyncStorage.getItem('mc-review-log-count')).toBe(String(MIN_LOGS))
})

it("doesn't ask when the device can't show the flow", async () => {
  ;(StoreReview.hasAction as jest.Mock).mockResolvedValue(false)
  expect(await logTimes(MIN_LOGS)).toBe(false)
  expect(StoreReview.requestReview).not.toHaveBeenCalled()
})

// With a playStoreUrl configured hasAction() is true even without the native
// module, and requestReview() would open the Play listing instead of the sheet.
it("doesn't fall back to opening the store listing", async () => {
  ;(StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(false)
  expect(await logTimes(MIN_LOGS)).toBe(false)
  expect(StoreReview.requestReview).not.toHaveBeenCalled()
})

it('swallows a requestReview failure and still starts the 90-day wait', async () => {
  ;(StoreReview.requestReview as jest.Mock).mockRejectedValue(new Error('boom'))
  await expect(logTimes(MIN_LOGS)).resolves.toBe(false)
  expect(await logTimes(1, NOW + 1)).toBe(false)
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1)
})

it('swallows a storage failure', async () => {
  jest.spyOn(AsyncStorage, 'multiGet').mockRejectedValueOnce(new Error('disk'))
  await expect(recordLogAndMaybeAsk(NOW)).resolves.toBe(false)
})
