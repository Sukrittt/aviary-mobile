import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { verifyEmailChange } from '@/src/api/account'
import CodeScreen from './code'

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ email: 'a@b.co', mode: 'change-email' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}))
jest.mock('@/src/api/magicAuth', () => ({ sendMagicAuthCode: jest.fn(), verifyMagicAuthCode: jest.fn() }))
jest.mock('@/src/api/account', () => ({ resendEmailCode: jest.fn(), verifyEmailChange: jest.fn() }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

it('unlocks the numpad and explains when the verify request fails', async () => {
  ;(verifyEmailChange as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))
  const { getByText, findByText } = renderWithProviders(<CodeScreen />)
  for (const d of '123456') fireEvent.press(getByText(d))

  expect(await findByText("Couldn't check the code. Check your connection and try again.")).toBeTruthy()
  // Unlocked: a fresh digit lands instead of being swallowed by the disabled pad.
  fireEvent.press(getByText('7'))
  await waitFor(() => expect(verifyEmailChange).toHaveBeenCalledTimes(1))
  expect(() => getByText('Network request failed')).toThrow()
})
