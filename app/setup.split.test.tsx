import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'
import { getSplitBuckets } from '@/src/api/categories'

// The usual setup steps, as on a binary without the file picker; setup.import.test.tsx covers the import.
jest.mock('@/src/lib/filePicker', () => ({ canPickFiles: false, pickFile: jest.fn() }))

jest.mock('@/src/api/account', () => ({
  getUser: jest.fn(async () => ({ onboardedAt: null })),
  updateUser: jest.fn(async (patch) => patch),
}))
jest.mock('@/src/api/billing', () => ({ completeOnboarding: jest.fn() }))
jest.mock('@/src/api/budgets', () => ({
  getBudgets: jest.fn(async () => []),
  updateBudget: jest.fn(async () => ({})),
}))
jest.mock('@/src/api/groups', () => ({ addGroup: jest.fn(async () => ({})), updateGroup: jest.fn(async () => ({})) }))
jest.mock('@/src/api/categories', () => ({
  addCategory: jest.fn(async () => ({})),
  getSplitBuckets: jest.fn(async () => ({})),
}))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))

beforeEach(() => jest.clearAllMocks())

function toCategoriesStep() {
  const utils = renderWithProviders(<SetupScreen />)
  fireEvent.press(utils.getByText('Continue')) // currency
  fireEvent.press(utils.getByText('₹50,000'))
  fireEvent.press(utils.getByText('Build my own budget')) // income
  fireEvent.press(utils.getByText('Continue')) // groups
  return utils
}

it('splits the defaults 50/30/20 without asking Jev', async () => {
  const { getByText, getAllByText, queryByText, findByLabelText } = toCategoriesStep()
  fireEvent.press(getByText('Continue'))
  expect(await findByLabelText('Slide to finish setup')).toBeTruthy()
  expect(getSplitBuckets).not.toHaveBeenCalled()
  // No savings picked by default, so needs and wants keep their 50:30 ratio:
  // 31,250 and 18,750 before rounding, the leftover landing on Rent. The same
  // five amounts Web's app/onboarding/split.test.tsx pins.
  for (const amount of ['₹18,100', '₹8,900', '₹4,400']) expect(getByText(amount)).toBeTruthy()
  expect(getAllByText('₹9,300')).toHaveLength(2) // Eating out, Entertainment
  expect(getByText('₹31,400')).toBeTruthy() // Essentials
  expect(getByText('₹18,600')).toBeTruthy() // Lifestyle
  // A review, not a worksheet: no split modes or need/want tags.
  expect(queryByText('Split evenly')).toBeNull()
  expect(queryByText('Need')).toBeNull()
  expect(queryByText('Reset to our suggestion')).toBeNull()
})

it('asks Jev about a category the user named and uses its tag', async () => {
  ;(getSplitBuckets as jest.Mock).mockResolvedValue({ 'index fund': 'savings' })
  const { getByText, getByDisplayValue, findByLabelText } = toCategoriesStep()
  fireEvent.changeText(getByDisplayValue('Utilities'), 'Index fund')
  fireEvent.press(getByText('Continue'))
  expect(await findByLabelText('Slide to finish setup')).toBeTruthy()
  expect(getSplitBuckets).toHaveBeenCalledWith([{ name: 'Index fund', group: 'Essentials' }])
  // Savings now gets its 20%: 10,000 of 50,000.
  expect(getByText('₹10,000')).toBeTruthy()
})

it('offers a reset only once the plan is edited, and it restores our suggestion', async () => {
  const { getByText, getAllByText, queryByText, findByLabelText } = toCategoriesStep()
  fireEvent.press(getByText('Continue'))
  expect(await findByLabelText('Slide to finish setup')).toBeTruthy()
  fireEvent.press(getByText('Rent'))
  fireEvent.press(getAllByText('1').at(-1)!)
  fireEvent.press(getByText('Done'))
  fireEvent.press(getByText('Reset to our suggestion'))
  expect(getByText('₹31,400')).toBeTruthy()
  expect(queryByText('Reset to our suggestion')).toBeNull()
})

it('offers our suggestion in the number pad sheet once the amount differs from it', async () => {
  const { getByText, getAllByText, queryByText, findByText } = toCategoriesStep()
  fireEvent.press(getByText('Continue'))
  expect(await findByText('Here’s your plan')).toBeTruthy()
  fireEvent.press(getByText('Rent'))
  expect(queryByText(/^Our suggestion/)).toBeNull()
  fireEvent.press(getAllByText('1').at(-1)!)
  fireEvent.press(getByText('Our suggestion · ₹18,100'))
  fireEvent.press(getByText('Done'))
  expect(getAllByText('₹18,100').length).toBeGreaterThan(0)
  expect(queryByText('Reset to our suggestion')).toBeNull()
})
