import * as SecureStore from 'expo-secure-store'
import { readThemePreference } from './pref'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn() }))

it.each([null, 'invalid'])('uses light for an absent or invalid saved preference: %s', async (stored) => {
  ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(stored)
  await expect(readThemePreference()).resolves.toBe('light')
})

it.each(['light', 'dark', 'system'])('keeps the saved %s preference for headless widgets', async (stored) => {
  ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(stored)
  await expect(readThemePreference()).resolves.toBe(stored)
})
