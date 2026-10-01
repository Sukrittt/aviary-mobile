import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import WelcomeScreen from './welcome'

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

it('shows the sign-in error', () => {
  mockSignInState = { pending: false, done: false, error: "Google sign-in didn't work. Try again." }
  const { getByText } = renderWithProviders(<WelcomeScreen />)
  expect(getByText("Google sign-in didn't work. Try again.")).toBeTruthy()
})
