import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { sendMagicAuthCode } from '@/src/api/magicAuth'
import EmailScreen from './email'

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error' },
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}))
jest.mock('@/src/api/magicAuth', () => ({ sendMagicAuthCode: jest.fn() }))
jest.mock('@/src/api/account', () => ({ changeEmail: jest.fn() }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

it('resets the send button and explains when sending the code throws', async () => {
  ;(sendMagicAuthCode as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))
  const { getByPlaceholderText, getByText, findByText } = renderWithProviders(<EmailScreen />)
  fireEvent.changeText(getByPlaceholderText('you@example.com'), 'a@b.co')
  fireEvent.press(getByText('Send code'))

  expect(await findByText("Couldn't send the code. Check your connection and try again.")).toBeTruthy()
  expect(getByText('Send code')).toBeTruthy()
  expect(mockPush).not.toHaveBeenCalled()
})
