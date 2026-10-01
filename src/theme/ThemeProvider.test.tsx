import { Text } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { render, screen, waitFor, act } from '@testing-library/react-native'
import { accessMode, clearAccess, persistSession } from '../api/accessMode'
import { ThemeProvider, useTheme } from './ThemeProvider'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))

// The device is in dark mode, so a preference reset to 'system' would render 'dark'.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'dark',
}))

function SchemeProbe() {
  const { scheme } = useTheme()
  return <Text>{scheme}</Text>
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key === 'mc-theme-pref' ? 'light' : null),
  )
})

it('defaults to light on a dark-mode device when no preference is saved', async () => {
  ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
  render(<ThemeProvider><SchemeProbe /></ThemeProvider>)
  expect(screen.getByText('light')).toBeTruthy()
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText('light')).toBeTruthy()
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
})

it.each(['dark', 'system'])('preserves the saved %s preference', async (preference) => {
  ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(preference)
  render(<ThemeProvider><SchemeProbe /></ThemeProvider>)
  await waitFor(() => expect(screen.getByText('dark')).toBeTruthy())
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
})

it('keeps the stored theme preference across a logout', async () => {
  render(
    <ThemeProvider>
      <SchemeProbe />
    </ThemeProvider>,
  )
  await waitFor(() => expect(screen.getByText('light')).toBeTruthy())

  await act(async () => {
    await persistSession({ accessToken: 'a.b.c', refreshToken: 'r1', expiresAt: Date.now() + 3_600_000 })
    await clearAccess()
  })

  expect(screen.getByText('light')).toBeTruthy()
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith('mc-theme-pref')
})

it('does not subscribe to logout at all', async () => {
  const subscribeSpy = jest.spyOn(accessMode, 'subscribeLogout')
  render(
    <ThemeProvider>
      <SchemeProbe />
    </ThemeProvider>,
  )
  // Let the SecureStore restore settle, so its setState isn't left outside act().
  await waitFor(() => expect(screen.getByText('light')).toBeTruthy())
  expect(subscribeSpy).not.toHaveBeenCalled()
  subscribeSpy.mockRestore()
})
