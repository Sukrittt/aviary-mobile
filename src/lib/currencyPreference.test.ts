import * as SecureStore from 'expo-secure-store'
import { currentUserId } from '@/src/api/accessMode'
import { deviceCurrency, readCurrencyPreference, writeCurrencyPreference } from './currencyPreference'
jest.mock('@/src/api/accessMode', () => ({ currentUserId: jest.fn(() => 'a') }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => {}) }))
beforeEach(() => jest.clearAllMocks())
it('keeps the offline preference scoped to the account that saved it', async () => {
  await writeCurrencyPreference('USD', 'a')
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('mc-currency-a', 'USD')
  ;(currentUserId as jest.Mock).mockReturnValue('b')
  ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('EUR')
  expect(await readCurrencyPreference()).toBe('EUR')
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith('mc-currency-b')
})
it('falls back to INR for old or unavailable cache values', async () => {
  ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('invalid')
  expect(await readCurrencyPreference()).toBe('INR')
  ;(SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('storage unavailable'))
  expect(await readCurrencyPreference()).toBe('INR')
})
it('trusts an Indian timezone over an en-US locale', () => {
  expect(deviceCurrency('Asia/Kolkata', 'USD')).toBe('INR')
  expect(deviceCurrency('Asia/Calcutta', 'USD')).toBe('INR')
})
it('falls back to the locale currency for other timezones', () => {
  expect(deviceCurrency('America/Mexico_City', 'MXN')).toBe('MXN')
  expect(deviceCurrency('Europe/Berlin', undefined)).toBe('INR')
})
