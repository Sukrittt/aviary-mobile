import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import * as Haptics from 'expo-haptics'
import WelcomeScreen from './welcome'

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))

const mockSignIn = jest.fn()
let mockSignInState = { pending: false, done: false, error: null as string | null }
jest.mock('@/src/api/useSignIn', () => ({
  useSignIn: () => ({ signIn: mockSignIn, ...mockSignInState }),
}))

beforeEach(() => {
  mockPush.mockClear()
  mockSignIn.mockClear()
  ;(Haptics.impactAsync as jest.Mock).mockClear()
  mockSignInState = { pending: false, done: false, error: null }
})

it('starts Google sign-in from the welcome screen', () => {
  const { getByText } = renderWithProviders(<WelcomeScreen />)
  fireEvent.press(getByText('Continue with Google'))
  expect(mockSignIn).toHaveBeenCalledTimes(1)
})

it('still offers email sign-in alongside Google', () => {
  const { getByText } = renderWithProviders(<WelcomeScreen />)
  fireEvent.press(getByText('Continue with email'))
  expect(mockPush).toHaveBeenCalledWith('/(auth)/email')
})

it('locks both buttons while Google sign-in is in flight', () => {
  mockSignInState = { pending: true, done: false, error: null }
  const { getByText } = renderWithProviders(<WelcomeScreen />)
  fireEvent.press(getByText('Signing in…'))
  fireEvent.press(getByText('Continue with email'))
  expect(mockSignIn).not.toHaveBeenCalled()
  expect(mockPush).not.toHaveBeenCalled()
})

it('dims the Google button while sign-in is in flight', () => {
  mockSignInState = { pending: true, done: false, error: null }
  const { getByRole } = renderWithProviders(<WelcomeScreen />)
  const google = getByRole('button', { name: /Signing in…/ })
  expect(google).toBeDisabled()
  expect(google).toHaveStyle({ opacity: 0.6 })
})

it('shows the sign-in error', () => {
  mockSignInState = { pending: false, done: false, error: "Google sign-in didn't work. Try again." }
  const { getByText } = renderWithProviders(<WelcomeScreen />)
  expect(getByText("Google sign-in didn't work. Try again.")).toBeTruthy()
})

it('taps a light haptic on both sign-in buttons', () => {
  const { getByText } = renderWithProviders(<WelcomeScreen />)
  fireEvent.press(getByText('Continue with Google'))
  fireEvent.press(getByText('Continue with email'))
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(2)
})
