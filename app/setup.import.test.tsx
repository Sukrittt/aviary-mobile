import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'
import { completeOnboarding } from '@/src/api/billing'
import { track } from '@/src/lib/analytics'

const mockPreview = jest.fn()
const mockCommit = jest.fn()
jest.mock('@/src/api/imports', () => ({
  ...jest.requireActual('@/src/api/imports'),
  previewImport: (...a: unknown[]) => mockPreview(...a),
  commitImport: (...a: unknown[]) => mockCommit(...a),
}))
jest.mock('@/src/lib/filePicker', () => ({
  canPickFiles: true,
  pickFile: jest.fn(async () => ({ uri: 'file:///ynab.zip', name: 'ynab.zip', size: 10 })),
}))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn(), startTimer: () => () => 42 }))
jest.mock('@/src/api/account', () => ({ updateUser: jest.fn(async (patch) => patch), getUser: jest.fn(async () => ({})) }))
jest.mock('@/src/api/billing', () => ({ completeOnboarding: jest.fn(async () => ({})) }))
jest.mock('@/src/api/budgets', () => ({ getBudgets: jest.fn(async () => []), updateBudget: jest.fn(async () => ({})) }))
jest.mock('@/src/api/groups', () => ({ addGroup: jest.fn(async () => ({})), updateGroup: jest.fn(async () => ({})) }))
jest.mock('@/src/api/categories', () => ({ addCategory: jest.fn(async () => ({})) }))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('@/src/hooks/useUser', () => ({ useUpdateUser: () => ({ mutate: jest.fn() }) }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ currencyCode: 'INR' }] }))

beforeEach(() => jest.clearAllMocks())

it('asks about switching first, and back from currency returns to the question', () => {
  const { getByText, getByLabelText } = renderWithProviders(<SetupScreen />)
  expect(getByText('How do you want to start?')).toBeTruthy()
  fireEvent.press(getByText('Start fresh'))
  expect(getByText('Choose your currency')).toBeTruthy()
  fireEvent.press(getByLabelText('Go back'))
  expect(getByText('How do you want to start?')).toBeTruthy()
})

it('an import lands on the celebration with its history still coming in, onboarded by the server', async () => {
  jest.useFakeTimers()
  mockPreview.mockResolvedValue({
    importId: 'imp1', app: 'ynab', filename: 'ynab.zip', direction: 'negative_spend', directionSource: 'column',
    currency: 'USD', hasCurrency: false, counts: { expense: 40, income: 3, from: '2026-07-01', to: '2026-10-01' },
    skipped: {}, otherCurrencies: [], droppedOverCap: 0, samples: [], groups: ['Essentials'],
    categories: [{ source: 'Rent', name: 'Rent', group: 'Essentials', monthly: 1200 }],
    accounts: [], droppedAccounts: [], salary: null, budgetTotal: 1200,
  })
  mockCommit.mockResolvedValue({ importId: 'imp1', total: 43, groupCount: 1, categoryCount: 1, income: 0 })
  const { getByText, getByLabelText, findByText } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Bring my budget over'))
  fireEvent.press(getByLabelText('YNAB'))
  fireEvent.press(getByLabelText('Choose your export file'))
  fireEvent.press(await findByText('Looks right, set me up'))
  await waitFor(() => expect(mockCommit).toHaveBeenCalled())
  act(() => jest.advanceTimersByTime(1100))
  expect(await findByText('Your history is still coming in. Close the app if you like, we’ll let you know when it’s done.')).toBeTruthy()
  expect(completeOnboarding).not.toHaveBeenCalled()
  expect(track).toHaveBeenCalledWith('onboarding_completed', expect.objectContaining({ imported: true, currency: 'USD' }))
  jest.useRealTimers()
})
