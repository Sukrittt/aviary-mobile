import { fireEvent, waitFor } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { fontFamily } from '@/src/theme/fonts'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'
import { onOnboarded } from '@/src/api/onboardingSignal'
import { updateUser } from '@/src/api/account'
import { completeOnboarding } from '@/src/api/billing'
import { slide } from '@/src/test-utils/slide'

// The usual setup steps, as on a binary without the file picker; setup.import.test.tsx covers the import.
jest.mock('@/src/lib/filePicker', () => ({ canPickFiles: false, pickFile: jest.fn() }))

jest.mock('@/src/api/account', () => ({ updateUser: jest.fn(async patch => patch), getUser: jest.fn(async () => ({ email: 'a@b.com', emailVerified: true })) }))
jest.mock('@/src/api/billing', () => ({
  completeOnboarding: jest.fn(async () => ({ onboardedAt: '2026-09-18T12:00:00.000Z', access: {} })),
}))
jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(async () => []),
  updateBudget: jest.fn(async () => ({})),
}))
jest.mock('@/src/api/groups', () => ({ addGroup: jest.fn(async () => ({})), updateGroup: jest.fn(async () => ({})) }))
jest.mock('@/src/api/categories', () => ({ addCategory: jest.fn(async () => ({})) }))
const mockAddExpense = jest.fn(async (_row: object) => ({}))
jest.mock('@/src/hooks/useExpenses', () => ({ useAddExpense: () => ({ mutateAsync: mockAddExpense }) }))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ currencyCode: 'MXN' }] }))
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Rigid: 'rigid' },
}))

it('defaults to the device region currency, shown as a chip on the income step', () => {
  const { getByText, getByLabelText, queryByText, unmount } = renderWithProviders(<SetupScreen />)
  expect(getByText('What lands each month?')).toBeTruthy()
  expect(queryByText('Choose your currency')).toBeNull()
  expect(getByLabelText('Currency, Mexican Peso. Change it')).toBeTruthy()
  expect(getByText('MXN')).toBeTruthy()
  unmount()
})

it('changes currency from the chip, keeps it on back, saves it with onboarding, then goes straight Home', async () => {
  const onFinished = jest.fn()
  const unsubscribe = onOnboarded(onFinished)
  const { getByText, findByText, getByLabelText, getByRole, queryByText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByLabelText('Currency, Mexican Peso. Change it'))
  fireEvent.changeText(getByLabelText('Search currencies'), 'USD')
  fireEvent.press(getByLabelText('US Dollar, USD, $'))
  expect(getByLabelText('Currency, US Dollar. Change it')).toBeTruthy()
  jest.mocked(Haptics.selectionAsync).mockClear()
  fireEvent.press(getByText('$50,000'))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
  jest.mocked(Haptics.selectionAsync).mockClear()
  fireEvent.press(getByText('Build my own budget'))
  expect(getByText('Add your own group')).toHaveStyle({ fontFamily: fontFamily.bodyBold })
  fireEvent.press(getByLabelText('Go back'))
  expect(getByLabelText('Currency, US Dollar. Change it')).toBeTruthy()
  fireEvent.press(getByText('Continue'))
  fireEvent.press(getByText('Continue'))
  expect(getByText('Default alerts: 50% · 90% · 100%')).toBeTruthy()
  fireEvent.press(getByText('Continue'))
  jest.mocked(Haptics.selectionAsync).mockClear()
  const suggestedSplit = getByRole('button', { name: 'Suggested split' })
  fireEvent(suggestedSplit, 'pressIn')
  fireEvent(suggestedSplit, 'pressOut')
  fireEvent.press(suggestedSplit)
  fireEvent.press(getByText('Split evenly'))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2)
  fireEvent.press(getByText('Rent'))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(3)
  jest.mocked(Haptics.impactAsync).mockClear()
  fireEvent.press(getByText('Done'))
  slide(getByLabelText('Slide to finish setup'))
  expect(Haptics.impactAsync).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Rigid)
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ currencyCode: 'USD' }), { timeout: 3000 })
  // The trial's start instant is the server's, so the app no longer sends an
  // onboardedAt at all — it asks the server to complete onboarding.
  await waitFor(() => expect(completeOnboarding).toHaveBeenCalled())
  expect(await findByText('Log your first expense', {}, { timeout: 3000 })).toBeTruthy()
  fireEvent.press(getByText('Skip for now'))
  await waitFor(() => expect(getByText('Continue')).toBeTruthy(), { timeout: 3000 })
  expect(getByText('Monthly income')).toBeTruthy()
  expect(getByText('Groups')).toBeTruthy()
  expect(getByText('Categories')).toBeTruthy()
  expect(queryByText('First expense')).toBeNull()
  expect(getByText('Your first 30 days are free. No card, nothing to cancel.')).toBeTruthy()
  expect(onFinished).not.toHaveBeenCalled()
  const impacts = jest.mocked(Haptics.impactAsync).mock.calls.length
  fireEvent.press(getByText('Continue'))
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(impacts + 1)
  // No extras or heard-from screens any more: those wait on Home.
  expect(onFinished).toHaveBeenCalledTimes(1)
  expect(queryByText('Want any extras?')).toBeNull()
  expect(queryByText('Where did you hear about us?')).toBeNull()
  unsubscribe()
  unmount()
})
