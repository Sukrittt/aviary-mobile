import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'
import { updateBudget } from '@/src/api/budgets'
import { addCategory, getSplitBuckets } from '@/src/api/categories'
import { addGroup } from '@/src/api/groups'
import { track } from '@/src/lib/analytics'
import { INCOME_CATEGORY } from '@/src/lib/envelope'

jest.mock('@/src/lib/analytics', () => ({ track: jest.fn(), startTimer: () => () => 7 }))
jest.mock('@/src/api/account', () => ({
  getUser: jest.fn(async () => ({ onboardedAt: null })),
  updateUser: jest.fn(async (patch) => patch),
}))
jest.mock('@/src/api/billing', () => ({
  completeOnboarding: jest.fn(async () => ({ onboardedAt: '2026-10-08T12:00:00.000Z', access: {} })),
}))
jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(async () => []),
  updateBudget: jest.fn(async () => ({})),
}))
jest.mock('@/src/api/groups', () => ({ addGroup: jest.fn(async () => ({})) }))
jest.mock('@/src/api/categories', () => ({
  addCategory: jest.fn(async () => ({})),
  getSplitBuckets: jest.fn(async () => ({})),
}))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))

beforeEach(() => jest.clearAllMocks())

const PICK_OWN = 'Pick my own groups and categories'
// What each envelope was assigned, keyed by its category label.
const assigned = (): Record<string, number> =>
  Object.fromEntries(
    (updateBudget as jest.Mock).mock.calls.map(([, category, body]) => [category, Number(body.assigned)]),
  )
const completed = () =>
  (track as jest.Mock).mock.calls.filter(([e]) => e === 'onboarding_completed').map(([, p]) => p)

it('finishes from the income step on the starter budget, income split the suggested way', async () => {
  const { getByText, queryByText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Continue')) // currency
  fireEvent.press(getByText('₹50,000'))
  fireEvent.press(getByText('Finish setup'))
  await waitFor(() => expect(completed()).toHaveLength(1), { timeout: 3000 })

  expect((addGroup as jest.Mock).mock.calls.map(([name]) => name)).toEqual(['🏠 Essentials', '🎬 Lifestyle'])
  expect(addCategory).toHaveBeenCalledTimes(4)
  // Defaults are known categories, so there's nothing to ask Jev.
  expect(getSplitBuckets).not.toHaveBeenCalled()
  const rows = assigned()
  expect(rows[INCOME_CATEGORY]).toBe(50000)
  const envelopes = Object.entries(rows).filter(([k]) => k !== INCOME_CATEGORY)
  expect(envelopes).toHaveLength(4)
  expect(envelopes.reduce((n, [, v]) => n + v, 0)).toBe(50000)
  expect(completed()).toEqual([
    { total_seconds: 7, groups_count: 2, categories_count: 4, currency: 'INR', customized: false, skipped_income: false },
  ])
  // Never reached the groups step.
  expect(queryByText('Group your money')).toBeNull()
  unmount()
})

it('skips income and still sets up the starter envelopes, all at zero', async () => {
  const { getByText, findByText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Continue')) // currency
  expect(getByText('You can add it from Home any time')).toBeTruthy()
  fireEvent.press(getByText('Skip for now'))
  expect(await findByText('Add it later', {}, { timeout: 3000 })).toBeTruthy()

  const rows = assigned()
  expect(Object.keys(rows)).toHaveLength(5)
  expect(Object.values(rows).every((v) => v === 0)).toBe(true)
  expect(completed()[0]).toMatchObject({ customized: false, skipped_income: true })
  unmount()
})

it('picks its own categories without income, finishing at the categories step', async () => {
  const { getByText, queryByText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Continue')) // currency
  fireEvent.press(getByText(PICK_OWN))
  fireEvent.press(getByText('Continue')) // groups
  fireEvent.press(getByText('Finish setup')) // categories
  await waitFor(() => expect(completed()).toHaveLength(1), { timeout: 3000 })
  expect(queryByText('Assign your money')).toBeNull()
  expect(completed()[0]).toMatchObject({ customized: true, skipped_income: true })
  unmount()
})

it('lets the assign step finish with money left over', async () => {
  const { getByText, findByText, getAllByText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Continue')) // currency
  fireEvent.press(getByText('₹50,000'))
  fireEvent.press(getByText(PICK_OWN))
  fireEvent.press(getByText('Continue')) // groups
  fireEvent.press(getByText('Continue')) // categories
  await findByText('Assign your money')
  fireEvent.press(getByText('Rent'))
  fireEvent.press(getAllByText('1').at(-1)!)
  fireEvent.press(getByText('Done'))
  expect(getByText(/left\. It'll wait in Ready to Assign$/)).toBeTruthy()
  fireEvent.press(getByText('Finish setup'))
  await waitFor(() => expect(completed()).toHaveLength(1), { timeout: 3000 })
  expect(assigned()['🏠 Rent']).toBe(1)
  unmount()
})

// Edits made on the custom path stay, so going back can't finish them
// through the starter path and report them as not customized.
it('stays on the custom path after going back from the groups step', () => {
  const { getByText, queryByText, getByLabelText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('Continue')) // currency
  fireEvent.press(getByText('₹50,000'))
  fireEvent.press(getByText(PICK_OWN))
  expect(getByText('Group your money')).toBeTruthy()
  fireEvent.press(getByLabelText('Go back'))
  expect(queryByText(PICK_OWN)).toBeNull()
  fireEvent.press(getByText('Continue'))
  expect(getByText('Group your money')).toBeTruthy()
  unmount()
})
