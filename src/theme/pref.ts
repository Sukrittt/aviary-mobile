// Shared with the widgets' headless task handler, which has no ThemeProvider
// to read from — it goes straight to SecureStore.
import * as SecureStore from 'expo-secure-store'

export type ThemePreference = 'light' | 'dark' | 'system'
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light'

export const THEME_PREF_KEY = 'mc-theme-pref'

export async function readThemePreference(): Promise<ThemePreference> {
  const stored = await SecureStore.getItemAsync(THEME_PREF_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return DEFAULT_THEME_PREFERENCE
}
