import { fireEvent, waitFor } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { fontFamily } from '@/src/theme/fonts'
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
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}))

it('selects currency before income, preserves it on back, and saves it with onboarding', async () => {
  const onFinished = jest.fn()
  const unsubscribe = onOnboarded(onFinished)
  const { getByText, getByLabelText, getByRole, queryByText, unmount } = renderWithProviders(<SetupScreen />)
  expect(getByText('Choose your currency')).toBeTruthy()
  expect(queryByText('1 / 5')).toBeNull()
  fireEvent.changeText(getByLabelText('Search currencies'), 'USD')
  fireEvent.press(getByLabelText('US Dollar, USD, $'))
  fireEvent.press(getByText('Continue'))
  expect(getByText('What lands each month?')).toBeTruthy()
  expect(queryByText('2 / 5')).toBeNull()
  fireEvent.press(getByLabelText('Go back'))
  expect(getByLabelText('Selected currency, US Dollar, USD')).toBeTruthy()
  fireEvent.press(getByText('Continue'))
  fireEvent.press(getByText('$50,000'))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
  jest.mocked(Haptics.selectionAsync).mockClear()
  fireEvent.press(getByText('Build my own budget'))
  expect(getByText('Add your own group')).toHaveStyle({ fontFamily: fontFamily.bodyBold })
  fireEvent.press(getByText('Continue'))
  expect(getByText('Default alerts: 50% · 90% · 100%')).toBeTruthy()
  fireEvent.press(getByText('Continue'))
  const suggestedSplit = getByRole('button', { name: 'Suggested split' })
  fireEvent(suggestedSplit, 'pressIn')
  fireEvent(suggestedSplit, 'pressOut')
  fireEvent.press(suggestedSplit)
  fireEvent.press(getByText('Split evenly'))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(3)
  fireEvent.press(getByText('Rent'))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(4)
  fireEvent.press(getByText('Done'))
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(4)
  fireEvent.press(getByText('Finish setup'))
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(5)
  expect(Haptics.impactAsync).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Light)
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ currencyCode: 'USD' }), { timeout: 3000 })
  // The trial's start instant is the server's, so the app no longer sends an
  // onboardedAt at all — it asks the server to complete onboarding.
  await waitFor(() => expect(completeOnboarding).toHaveBeenCalled())
  await waitFor(() => expect(getByText('Continue')).toBeTruthy(), { timeout: 3000 })
  expect(getByText('Monthly income')).toBeTruthy()
  expect(getByText('Groups')).toBeTruthy()
  expect(getByText('Categories')).toBeTruthy()
  expect(queryByText('Assigned')).toBeNull()
  expect(onFinished).not.toHaveBeenCalled()
  fireEvent.press(getByText('Continue'))
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(6)
  expect(onFinished).toHaveBeenCalledTimes(1)
  unsubscribe()
  unmount()
})
