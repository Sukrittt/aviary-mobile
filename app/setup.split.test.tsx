import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'
import { getSplitBuckets } from '@/src/api/categories'

jest.mock('@/src/api/account', () => ({
  getUser: jest.fn(async () => ({ onboardedAt: null })),
  updateUser: jest.fn(async (patch) => patch),
}))
jest.mock('@/src/api/billing', () => ({ completeOnboarding: jest.fn() }))
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

function toCategoriesStep() {
  const utils = renderWithProviders(<SetupScreen />)
  fireEvent.press(utils.getByText('Continue')) // currency
  fireEvent.press(utils.getByText('₹50,000'))
  fireEvent.press(utils.getByText('Build my own budget')) // income
  fireEvent.press(utils.getByText('Continue')) // groups
  return utils
}

it('splits the defaults 50/30/20 without asking Jev', async () => {
  const { getByText, getAllByText, findByText } = toCategoriesStep()
  fireEvent.press(getByText('Continue'))
  expect(await findByText('Finish setup')).toBeTruthy()
  expect(getSplitBuckets).not.toHaveBeenCalled()
  // No savings picked by default, so needs and wants keep their 50:30 ratio:
  // 31,250 and 18,750 before rounding, the leftover landing on the biggest
  // share (Eating out, the only want).
  expect(getByText('₹31,100')).toBeTruthy()
  expect(getAllByText('₹18,900')).toHaveLength(2)
  expect(getByText('Needs 62.5%')).toBeTruthy()
  expect(getByText('Wants 37.5%')).toBeTruthy()
  expect(getAllByText('Need')).toHaveLength(3)
  expect(getAllByText('Want')).toHaveLength(1)
})

it('asks Jev about a category the user named and uses its tag', async () => {
  ;(getSplitBuckets as jest.Mock).mockResolvedValue({ 'index fund': 'savings' })
  const { getByText, queryByText, getByDisplayValue, findByText } = toCategoriesStep()
  fireEvent.changeText(getByDisplayValue('Utilities'), 'Index fund')
  fireEvent.press(getByText('Continue'))
  expect(await findByText('Finish setup')).toBeTruthy()
  expect(getSplitBuckets).toHaveBeenCalledWith([{ name: 'Index fund', group: 'Essentials' }])
  // Savings now gets its 20%: 10,000 of 50,000.
  expect(getByText('₹10,000')).toBeTruthy()
  expect(getByText('Savings')).toBeTruthy()
  expect(getByText('Savings 20%')).toBeTruthy()
  expect(queryByText(/^· /)).toBeNull()
})

it('explains the split: a note for the missing bucket and a sheet on tap', async () => {
  const { getByText, findByText } = toCategoriesStep()
  fireEvent.press(getByText('Continue'))
  expect(await findByText('Finish setup')).toBeTruthy()
  expect(getByText('No savings yet, so needs and wants share it.')).toBeTruthy()
  fireEvent.press(getByText('Needs 62.5%'))
  expect(await findByText('How we split it')).toBeTruthy()
  expect(getByText('50%')).toBeTruthy()
})
