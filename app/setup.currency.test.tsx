import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'
import { onOnboarded } from '@/src/api/onboardingSignal'
import { updateUser } from '@/src/api/account'
import { completeOnboarding } from '@/src/api/billing'

jest.mock('@/src/api/account', () => ({ updateUser: jest.fn(async patch => patch) }))
jest.mock('@/src/api/billing', () => ({
  completeOnboarding: jest.fn(async () => ({ onboardedAt: '2026-09-18T12:00:00.000Z', access: {} })),
}))
jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(async () => []),
  updateBudget: jest.fn(async () => ({})),
}))
jest.mock('@/src/api/groups', () => ({ addGroup: jest.fn(async () => ({})) }))
jest.mock('@/src/api/categories', () => ({ addCategory: jest.fn(async () => ({})) }))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))

it('selects currency before income, preserves it on back, and saves it with onboarding', async () => {
  const onFinished = jest.fn()
  const unsubscribe = onOnboarded(onFinished)
  const { getByText, getByLabelText, unmount } = renderWithProviders(<SetupScreen />)
  expect(getByText('Choose your currency')).toBeTruthy()
  fireEvent.changeText(getByLabelText('Search currencies'), 'USD')
  fireEvent.press(getByLabelText('US Dollar, USD, $'))
  fireEvent.press(getByText('Continue'))
  expect(getByText('What lands each month?')).toBeTruthy()
  fireEvent.press(getByLabelText('Go back'))
  expect(getByLabelText('Selected currency, US Dollar, USD')).toBeTruthy()
  fireEvent.press(getByText('Continue'))
  fireEvent.press(getByText('$50,000'))
  fireEvent.press(getByText('Continue'))
  fireEvent.press(getByText('Continue'))
  fireEvent.press(getByText('Continue'))
  fireEvent.press(getByText('Finish setup'))
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ currencyCode: 'USD' }))
  // The trial's start instant is the server's, so the app no longer sends an
  // onboardedAt at all — it asks the server to complete onboarding.
  await waitFor(() => expect(completeOnboarding).toHaveBeenCalled())
  await waitFor(() => expect(getByText('Continue')).toBeTruthy())
  expect(onFinished).not.toHaveBeenCalled()
  fireEvent.press(getByText('Continue'))
  expect(onFinished).toHaveBeenCalledTimes(1)
  unsubscribe()
  unmount()
})
