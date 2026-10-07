import AsyncStorage from '@react-native-async-storage/async-storage'
import * as StoreReview from 'expo-store-review'
import { ASK_EVERY_MS, MIN_LOGS, maybeAskForReview, recordExpenseLogged } from './reviewPrompt'

jest.mock('expo-store-review', () => ({
  hasAction: jest.fn(),
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
}))

const NOW = 1_800_000_000_000

async function logTimes(n: number) {
  for (let i = 0; i < n; i++) await recordExpenseLogged()
}

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.clearAllMocks()
  ;(StoreReview.hasAction as jest.Mock).mockResolvedValue(true)
  ;(StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(true)
  ;(StoreReview.requestReview as jest.Mock).mockResolvedValue(undefined)
})

it(`waits for ${MIN_LOGS} logged expenses`, async () => {
  await logTimes(MIN_LOGS - 1)
  expect(await maybeAskForReview(NOW)).toBe(false)
  expect(StoreReview.requestReview).not.toHaveBeenCalled()

  await logTimes(1)
  expect(await maybeAskForReview(NOW)).toBe(true)
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1)
})

it('asks at most once every 90 days', async () => {
  await logTimes(MIN_LOGS)
  expect(await maybeAskForReview(NOW)).toBe(true)
  expect(await maybeAskForReview(NOW + ASK_EVERY_MS - 1)).toBe(false)
  expect(await maybeAskForReview(NOW + ASK_EVERY_MS)).toBe(true)
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(2)
})

it("doesn't ask when the device can't show the flow", async () => {
  await logTimes(MIN_LOGS)
  ;(StoreReview.hasAction as jest.Mock).mockResolvedValue(false)
  expect(await maybeAskForReview(NOW)).toBe(false)
  expect(StoreReview.requestReview).not.toHaveBeenCalled()
})

// With a playStoreUrl configured hasAction() is true even without the native
// module, and requestReview() would open the Play listing instead of the sheet.
it("doesn't fall back to opening the store listing", async () => {
  await logTimes(MIN_LOGS)
  ;(StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(false)
  expect(await maybeAskForReview(NOW)).toBe(false)
  expect(StoreReview.requestReview).not.toHaveBeenCalled()
})

it('swallows a requestReview failure and still starts the 90-day wait', async () => {
  await logTimes(MIN_LOGS)
  ;(StoreReview.requestReview as jest.Mock).mockRejectedValue(new Error('boom'))
  await expect(maybeAskForReview(NOW)).resolves.toBe(false)
  expect(await maybeAskForReview(NOW + 1)).toBe(false)
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1)
})

it('swallows a storage failure', async () => {
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'))
  await expect(recordExpenseLogged()).resolves.toBeUndefined()
  jest.spyOn(AsyncStorage, 'multiGet').mockRejectedValueOnce(new Error('disk'))
  await expect(maybeAskForReview(NOW)).resolves.toBe(false)
})
