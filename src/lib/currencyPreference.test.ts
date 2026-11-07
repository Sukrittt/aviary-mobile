import * as SecureStore from 'expo-secure-store'
import { currentUserId } from '@/src/api/accessMode'
import { isCurrencyCode } from './currencies'
import { TIMEZONE_CURRENCY, deviceCurrency, readCurrencyPreference, writeCurrencyPreference } from './currencyPreference'
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
it('trusts the timezone over an en-US locale', () => {
  expect(deviceCurrency('Asia/Kuala_Lumpur', 'USD')).toBe('MYR')
  expect(deviceCurrency('Asia/Kolkata', 'USD')).toBe('INR')
  expect(deviceCurrency('Asia/Calcutta', 'USD')).toBe('INR')
  expect(deviceCurrency('Europe/London', 'USD')).toBe('GBP')
  expect(deviceCurrency('Asia/Dubai', 'USD')).toBe('AED')
  expect(deviceCurrency('Asia/Singapore', 'USD')).toBe('SGD')
  expect(deviceCurrency('Asia/Dhaka', 'USD')).toBe('BDT')
  expect(deviceCurrency('Europe/Istanbul', 'USD')).toBe('TRY')
  expect(deviceCurrency('Europe/Berlin', 'USD')).toBe('EUR')
  expect(deviceCurrency('America/New_York', 'EUR')).toBe('USD')
  expect(deviceCurrency('America/Mexico_City', 'MXN')).toBe('MXN')
})
it('falls back to the locale currency for unmapped timezones', () => {
  expect(deviceCurrency('Mars/Olympus_Mons', 'EUR')).toBe('EUR')
  expect(deviceCurrency(undefined, undefined)).toBe('INR')
  expect(deviceCurrency('Mars/Olympus_Mons', 'XXX')).toBe('INR')
})
it('maps every zone to a supported currency', () => {
  for (const code of Object.values(TIMEZONE_CURRENCY)) expect(isCurrencyCode(code)).toBe(true)
})
