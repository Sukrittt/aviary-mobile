import AsyncStorage from '@react-native-async-storage/async-storage'
import { takeUpiShareTip } from './upiShareTip'

const bank = { android: true, paidWith: 'bank', shared: false }

beforeEach(() => AsyncStorage.clear())

it('shows once, on the first bank log', async () => {
  expect(await takeUpiShareTip(bank)).toBe(true)
  expect(await takeUpiShareTip(bank)).toBe(false)
})

it('waits out card and cash spends, and iOS', async () => {
  expect(await takeUpiShareTip({ ...bank, paidWith: 'credit_card' })).toBe(false)
  expect(await takeUpiShareTip({ ...bank, paidWith: 'cash' })).toBe(false)
  expect(await takeUpiShareTip({ ...bank, android: false })).toBe(false)
  expect(await takeUpiShareTip(bank)).toBe(true)
})

it('is used up by a log that came in by sharing', async () => {
  expect(await takeUpiShareTip({ ...bank, shared: true })).toBe(false)
  expect(await takeUpiShareTip(bank)).toBe(false)
})
