import { Alert } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'
import { onOnboarded } from '@/src/api/onboardingSignal'
import { getUser } from '@/src/api/account'
import { completeOnboarding } from '@/src/api/billing'
import { updateBudget } from '@/src/api/budgets'
import { addGroup } from '@/src/api/groups'
import { addCategory } from '@/src/api/categories'
import { ImportFailure } from '@/src/api/imports'
import { track } from '@/src/lib/analytics'
import { slide } from '@/src/test-utils/slide'

// Setup finished on another device (say, the web) while this one sat mid-wizard.
// Saving here must not write a second budget over it.

const mockPreview = jest.fn()
jest.mock('@/src/api/imports', () => ({
  ...jest.requireActual('@/src/api/imports'),
  previewImport: (...a: unknown[]) => mockPreview(...a),
  commitImport: jest.fn(),
}))
jest.mock('@/src/lib/filePicker', () => ({
  canPickFiles: true,
  pickFile: jest.fn(async () => ({ uri: 'file:///ynab.zip', name: 'ynab.zip', size: 10 })),
}))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn(), startTimer: () => () => 42 }))
jest.mock('@/src/api/account', () => ({
  updateUser: jest.fn(async (patch) => patch),
  getUser: jest.fn(async () => ({ email: 'a@b.com', emailVerified: true, onboardedAt: '2026-10-19T09:00:00.000Z' })),
}))
jest.mock('@/src/api/billing', () => ({ completeOnboarding: jest.fn(async () => ({})) }))
jest.mock('@/src/api/budgets', () => ({ getBudgets: jest.fn(async () => []), updateBudget: jest.fn(async () => ({})) }))
jest.mock('@/src/api/groups', () => ({ addGroup: jest.fn(async () => ({})), updateGroup: jest.fn(async () => ({})) }))
jest.mock('@/src/api/categories', () => ({ addCategory: jest.fn(async () => ({})) }))
const mockAddExpense = jest.fn(async (_row: object) => ({}))
jest.mock('@/src/hooks/useExpenses', () => ({ useAddExpense: () => ({ mutateAsync: mockAddExpense }) }))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('@/src/hooks/useUser', () => ({ useUpdateUser: () => ({ mutate: jest.fn() }) }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ currencyCode: 'INR' }] }))

let unsubscribe = () => {}
const onFinished = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  // Tap the alert's only button straight away.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[0]?.onPress?.())
  unsubscribe = onOnboarded(onFinished)
})
afterEach(() => unsubscribe())

it('finishing setup after another device already did writes nothing and goes Home', async () => {
  const { getByText, getByLabelText } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Start fresh')) // how to start
  fireEvent.press(getByText('₹50,000'))
  slide(getByLabelText('Slide to finish setup'))
  await waitFor(() => expect(onFinished).toHaveBeenCalledWith({ elsewhere: true }))
  expect(Alert.alert).toHaveBeenCalledWith('You’re already set up', expect.any(String), expect.any(Array), expect.anything())
  expect(addGroup).not.toHaveBeenCalled()
  expect(addCategory).not.toHaveBeenCalled()
  expect(updateBudget).not.toHaveBeenCalled()
  expect(completeOnboarding).not.toHaveBeenCalled()
})

it('a not-yet-onboarded account still saves as usual', async () => {
  jest.mocked(getUser).mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: null } as never)
  const { getByText, getByLabelText } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Start fresh'))
  fireEvent.press(getByText('₹50,000'))
  slide(getByLabelText('Slide to finish setup'))
  await waitFor(() => expect(completeOnboarding).toHaveBeenCalled(), { timeout: 3000 })
  expect(Alert.alert).not.toHaveBeenCalled()
})

it('a retry after this device\'s own lost completion finishes setup, not "another device"', async () => {
  // First save: completion lands on the server but its response is lost, and so is the confirming read.
  jest.mocked(getUser)
    .mockResolvedValueOnce({ email: 'a@b.com', emailVerified: true, onboardedAt: null } as never)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: '2026-10-19T09:00:00.000Z' } as never)
  jest.mocked(completeOnboarding).mockRejectedValueOnce(new Error('response lost'))
  const { getByText, findByText, getByLabelText } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Start fresh'))
  fireEvent.press(getByText('₹50,000'))
  slide(getByLabelText('Slide to finish setup'))
  await findByText(/Couldn't confirm your setup/, undefined, { timeout: 3000 })

  slide(getByLabelText('Slide to finish setup'))
  await waitFor(() => expect(track).toHaveBeenCalledWith('onboarding_completed', expect.objectContaining({ recovered_after_error: true })), { timeout: 3000 })
  expect(Alert.alert).not.toHaveBeenCalled()
  expect(onFinished).not.toHaveBeenCalledWith({ elsewhere: true })
})

it('an import refused as already onboarded goes Home instead of a dead-end message', async () => {
  mockPreview.mockRejectedValue(new ImportFailure('already_onboarded'))
  const { getByText, getByLabelText } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Switching apps? Bring your data'))
  fireEvent.press(getByLabelText('YNAB'))
  fireEvent.press(getByLabelText('Choose your export file'))
  await waitFor(() => expect(onFinished).toHaveBeenCalledWith({ elsewhere: true }))
})
