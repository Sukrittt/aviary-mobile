import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'
import { track } from '@/src/lib/analytics'
import { completeOnboarding } from '@/src/api/billing'
import { getUser } from '@/src/api/account'

jest.mock('@/src/lib/analytics', () => ({ track: jest.fn(), startTimer: () => () => 7 }))
jest.mock('@/src/api/account', () => ({
  getUser: jest.fn(async () => ({ email: 'tester@example.com', emailVerified: true, onboardedAt: null })),
  updateUser: jest.fn(async (patch) => patch),
}))
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

const mockTrack = track as jest.Mock
const eventsNamed = (name: string) => mockTrack.mock.calls.filter(([event]) => event === name).map(([, props]) => props)

beforeEach(() => jest.clearAllMocks())

function walkToFinish() {
  const screen = renderWithProviders(<SetupScreen />)
  const { getByText, getByLabelText } = screen
  fireEvent.press(getByText('Continue')) // currency
  fireEvent.press(getByText('₹50,000'))
  fireEvent.press(getByText('Continue')) // income
  fireEvent.press(getByLabelText('Go back'))
  fireEvent.press(getByText('Continue')) // income, again
  fireEvent.press(getByText('Continue')) // groups
  fireEvent.press(getByText('Continue')) // categories
  fireEvent.press(getByText('Finish setup'))
  return screen
}

it('reports every step of the wizard, the back tap, and the finish', async () => {
  const { getByText, unmount } = walkToFinish()
  await waitFor(() => expect(getByText('Continue')).toBeTruthy(), { timeout: 3000 })

  expect(eventsNamed('onboarding_started')).toHaveLength(1)
  expect(eventsNamed('onboarding_step_viewed').map((p) => p.step_name)).toEqual([
    'currency', 'income', 'groups', 'income', 'groups', 'categories', 'assign',
  ])
  expect(eventsNamed('onboarding_back_tapped')).toEqual([{ from_step: 2, step_name: 'groups' }])

  const completed = eventsNamed('onboarding_step_completed')
  expect(completed.map((p) => p.step_name)).toEqual(['currency', 'income', 'income', 'groups', 'categories', 'assign'])
  expect(completed[0]).toEqual({ step: 0, step_name: 'currency', seconds_on_step: 7, currency: 'INR' })
  expect(completed[1]).toMatchObject({ step_name: 'income', used_quick_pick: true })
  expect(completed[3]).toMatchObject({ step_name: 'groups', groups_selected: 2, groups_added: 0, groups_renamed: 0 })
  expect(completed[4]).toMatchObject({ step_name: 'categories', categories_selected: 4 })
  expect(completed[5]).toMatchObject({ step_name: 'assign', edited_split: false })

  expect(eventsNamed('onboarding_completed')).toEqual([
    { total_seconds: 7, groups_count: 2, categories_count: 4, currency: 'INR' },
  ])
  expect(eventsNamed('onboarding_failed')).toHaveLength(0)
  unmount()
})

it('reports a failed save, and never counts it as a finished step', async () => {
  ;(completeOnboarding as jest.Mock).mockRejectedValueOnce(new Error('503'))
  const { getByText, unmount } = walkToFinish()
  await waitFor(() => expect(getByText("Couldn't confirm your setup. Check your connection and try again. If it already saved, reopening the app will continue to your budget.")).toBeTruthy())

  expect(eventsNamed('onboarding_failed')).toEqual([{ reason: 'save_failed' }])
  expect(eventsNamed('onboarding_completed')).toHaveLength(0)
  expect(eventsNamed('onboarding_step_completed').map((p) => p.step_name)).not.toContain('assign')
  unmount()
})

it('continues to success when the final response failed after onboarding was committed', async () => {
  ;(completeOnboarding as jest.Mock).mockRejectedValueOnce(new Error('503'))
  ;(getUser as jest.Mock).mockResolvedValueOnce({
    email: 'tester@example.com',
    emailVerified: true,
    onboardedAt: '2026-09-23T20:37:26.618Z',
  })

  const { getByText, queryByText, unmount } = walkToFinish()
  await waitFor(() => expect(getByText('Continue')).toBeTruthy(), { timeout: 3000 })

  expect(queryByText("Couldn't confirm your setup. Check your connection and try again. If it already saved, reopening the app will continue to your budget.")).toBeNull()
  expect(eventsNamed('onboarding_failed')).toHaveLength(0)
  expect(eventsNamed('onboarding_completed')).toEqual([
    {
      total_seconds: 7,
      groups_count: 2,
      categories_count: 4,
      currency: 'INR',
      recovered_after_error: true,
    },
  ])
  expect(eventsNamed('onboarding_step_completed').map((p) => p.step_name)).toContain('assign')
  unmount()
})

it('shows the real save step in the Finish button while saving', async () => {
  let finish!: () => void
  ;(completeOnboarding as jest.Mock).mockReturnValueOnce(new Promise((resolve) => {
    finish = () => resolve({ onboardedAt: '2026-09-18T12:00:00.000Z', access: {} })
  }))
  const { getByText, findByText, unmount } = walkToFinish()
  expect(getByText('Creating your envelopes…')).toBeTruthy()
  expect(await findByText('Starting your budget…', {}, { timeout: 3000 })).toBeTruthy()
  finish()
  await waitFor(() => expect(getByText('Continue')).toBeTruthy(), { timeout: 3000 })
  unmount()
})
