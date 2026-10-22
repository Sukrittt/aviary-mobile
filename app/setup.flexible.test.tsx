import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'
import { updateBudget } from '@/src/api/budgets'
import { addCategory, getSplitBuckets } from '@/src/api/categories'
import { addGroup, updateGroup } from '@/src/api/groups'
import { track } from '@/src/lib/analytics'
import { INCOME_CATEGORY } from '@/src/lib/envelope'
import { slide } from '@/src/test-utils/slide'

// The usual setup steps, as on a binary without the file picker; setup.import.test.tsx covers the import.
jest.mock('@/src/lib/filePicker', () => ({ canPickFiles: false, pickFile: jest.fn() }))

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
jest.mock('@/src/api/groups', () => ({ addGroup: jest.fn(async () => ({})), updateGroup: jest.fn(async () => ({})) }))
jest.mock('@/src/api/categories', () => ({
  addCategory: jest.fn(async () => ({})),
  getSplitBuckets: jest.fn(async () => ({})),
}))
const mockAddExpense = jest.fn(async (_row: object) => ({}))
jest.mock('@/src/hooks/useExpenses', () => ({ useAddExpense: () => ({ mutateAsync: mockAddExpense }) }))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))

beforeEach(() => jest.clearAllMocks())

const PICK_OWN = 'Build my own budget'
// What each envelope was assigned, keyed by its category label.
const assigned = (): Record<string, number> =>
  Object.fromEntries(
    (updateBudget as jest.Mock).mock.calls.map(([, category, body]) => [category, Number(body.assigned)]),
  )
const stepsDone = () =>
  (track as jest.Mock).mock.calls.filter(([e]) => e === 'onboarding_step_completed').map(([, p]) => p)
const completed = () =>
  (track as jest.Mock).mock.calls.filter(([e]) => e === 'onboarding_completed').map(([, p]) => p)

it('finishes from the income step on the starter budget, income split the suggested way', async () => {
  const { getByText, queryByText, getByLabelText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('₹50,000'))
  slide(getByLabelText('Slide to finish setup'))
  await waitFor(() => expect(completed()).toHaveLength(1), { timeout: 3000 })

  // Plain names; icons travel separately.
  expect((addGroup as jest.Mock).mock.calls.map(([name]) => name)).toEqual(['Essentials', 'Lifestyle'])
  // Default groups' icons follow their names, so there's nothing to update.
  expect(updateGroup).not.toHaveBeenCalled()
  expect(addCategory).toHaveBeenCalledTimes(4)
  expect(addCategory).toHaveBeenCalledWith('Rent', 'Essentials', 'House')
  expect(addCategory).toHaveBeenCalledWith('Eating out', 'Lifestyle', 'BowlFood')
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
  expect(getByText('You can add it from Home any time')).toBeTruthy()
  fireEvent.press(getByText('Skip for now'))
  // Nothing was budgeted, so the first expense has no envelope money to move.
  expect(await findByText('Log your first expense', {}, { timeout: 3000 })).toBeTruthy()
  expect(getByText('Nothing budgeted here yet')).toBeTruthy()
  fireEvent.press(getByText('Skip for now'))
  expect(await findByText('Not set yet')).toBeTruthy()
  expect(mockAddExpense).not.toHaveBeenCalled()

  const rows = assigned()
  expect(Object.keys(rows)).toHaveLength(5)
  expect(Object.values(rows).every((v) => v === 0)).toBe(true)
  expect(completed()[0]).toMatchObject({ customized: false, skipped_income: true })
  unmount()
})

it('picks its own categories without income, finishing at the categories step', async () => {
  const { getByText, queryByText, getByLabelText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText(PICK_OWN))
  fireEvent.press(getByText('Continue')) // groups
  slide(getByLabelText('Slide to finish setup')) // categories
  await waitFor(() => expect(completed()).toHaveLength(1), { timeout: 3000 })
  expect(queryByText('Assign your money')).toBeNull()
  expect(completed()[0]).toMatchObject({ customized: true, skipped_income: true })
  unmount()
})

it('lets the assign step finish with money left over', async () => {
  const { getByText, findByText, getAllByText, getByLabelText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('₹50,000'))
  fireEvent.press(getByText(PICK_OWN))
  fireEvent.press(getByText('Continue')) // groups
  fireEvent.press(getByText('Continue')) // categories
  await findByText('Assign your money')
  fireEvent.press(getByText('Rent'))
  fireEvent.press(getAllByText('1').at(-1)!)
  fireEvent.press(getByText('Done'))
  expect(getByText(/left\. It'll wait in Ready to Assign$/)).toBeTruthy()
  slide(getByLabelText('Slide to finish setup'))
  await waitFor(() => expect(completed()).toHaveLength(1), { timeout: 3000 })
  expect(assigned()['Rent']).toBe(1)
  unmount()
})

// Edits made on the custom path stay, so going back can't finish them
// through the starter path and report them as not customized.
it('stays on the custom path after going back from the groups step', () => {
  const { getByText, queryByText, getByLabelText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('₹50,000'))
  fireEvent.press(getByText(PICK_OWN))
  expect(getByText('Group your money')).toBeTruthy()
  fireEvent.press(getByLabelText('Go back'))
  expect(queryByText(PICK_OWN)).toBeNull()
  fireEvent.press(getByText('Continue'))
  expect(getByText('Group your money')).toBeTruthy()
  unmount()
})

it('logs a real first expense against the starter budget and lands on done with it', async () => {
  const { getByText, getAllByText, findByText, getByLabelText, getByTestId, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('₹50,000'))
  slide(getByLabelText('Slide to finish setup'))
  expect(await findByText('Log your first expense', {}, { timeout: 3000 })).toBeTruthy()
  // Opens on the first want, with what the suggested split gave it.
  const eatingOut = assigned()['Eating out']
  expect(getByLabelText('Go back').props.accessibilityState).toMatchObject({ disabled: true })
  expect(getByTestId('first-expense-envelope')).toHaveTextContent(new RegExp(`Eating out.*₹${eatingOut.toLocaleString('en-IN')} left`))
  fireEvent.press(getAllByText('2').at(-1)!)
  fireEvent.press(getAllByText('5').at(-1)!)
  fireEvent.press(getAllByText('0').at(-1)!)
  // The envelope moves as the amount is typed, before anything is saved.
  expect(getByTestId('first-expense-envelope')).toHaveTextContent(new RegExp(`₹${(eatingOut - 250).toLocaleString('en-IN')} left`))
  expect(getByText(`₹250 of ₹${eatingOut.toLocaleString('en-IN')} spent`)).toBeTruthy()
  expect(mockAddExpense).not.toHaveBeenCalled()
  fireEvent.press(getByText('Log it'))
  await waitFor(() => expect(mockAddExpense).toHaveBeenCalledWith({ item: 'Eating out', amount_inr: '250', category: 'Eating out', payment_method: 'bank', source: 'manual' }))
  expect(await findByText('₹250 · Eating out', {}, { timeout: 3000 })).toBeTruthy()
  expect(getByText('Your first expense is in. You’ll see it on Home.')).toBeTruthy()
  expect(getByText('Your first 30 days are free. No card, nothing to cancel.')).toBeTruthy()
  expect(stepsDone().map((p) => p.step_name)).toEqual(['income', 'first_expense'])
  expect(stepsDone()[1]).toMatchObject({ step: 4, logged: true })
  unmount()
})

it('keeps the first expense on screen with a written error when it fails to save', async () => {
  mockAddExpense.mockRejectedValueOnce(new Error('Failed to add expense: 503'))
  const { getByText, getAllByText, findByText, getByLabelText, queryByText, unmount } = renderWithProviders(<SetupScreen />)
  fireEvent.press(getByText('₹50,000'))
  slide(getByLabelText('Slide to finish setup'))
  await findByText('Log your first expense', {}, { timeout: 3000 })
  fireEvent.press(getAllByText('9').at(-1)!)
  fireEvent.press(getByText('Log it'))
  expect(await findByText('Couldn’t save that. Check your connection and try again.')).toBeTruthy()
  expect(queryByText(/503/)).toBeNull()
  expect(stepsDone().map((p) => p.step_name)).toEqual(['income'])
  unmount()
})
