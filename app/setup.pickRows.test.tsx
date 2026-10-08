import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'

jest.mock('@/src/api/account', () => ({
  getUser: jest.fn(async () => ({ onboardedAt: null })),
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

function toGroupsStep() {
  const utils = renderWithProviders(<SetupScreen />)
  fireEvent.press(utils.getByText('Continue')) // currency
  fireEvent.press(utils.getByText('₹50,000'))
  fireEvent.press(utils.getByText('Pick my own groups and categories')) // income
  return utils
}

it('keeps a new group unchecked until it has a name', () => {
  const { getByText, getByLabelText, getAllByPlaceholderText } = toGroupsStep()
  fireEvent.press(getByText('Add your own group'))
  expect(getByLabelText('Select Group name')).not.toBeChecked()
  fireEvent.press(getByLabelText('Select Group name'))
  expect(getByLabelText('Select Group name')).not.toBeChecked()
  expect(getByText('Give this group a name first.')).toBeTruthy()
  const input = getAllByPlaceholderText('Group name').at(-1)!
  fireEvent.changeText(input, 'Pets')
  expect(getByLabelText('Deselect Pets')).toBeChecked()
  fireEvent.changeText(input, '')
  expect(getByLabelText('Select Group name')).not.toBeChecked()
})

it('never lets two checked groups share a name', () => {
  const { getByText, getByLabelText, getByDisplayValue, getAllByDisplayValue, getAllByLabelText } = toGroupsStep()
  fireEvent.changeText(getByDisplayValue('Savings'), 'essentials')
  fireEvent.press(getByLabelText('Select essentials'))
  expect(getByLabelText('Select essentials')).not.toBeChecked()
  expect(getByText("You've already got a group called essentials.")).toBeTruthy()

  fireEvent.changeText(getByDisplayValue('Lifestyle'), 'Essentials')
  expect(getAllByLabelText('Select Essentials')).toHaveLength(1)
  fireEvent.changeText(getAllByDisplayValue('Essentials')[1], 'Fun')
  expect(getByLabelText('Deselect Fun')).toBeChecked()
})

it('never lets two checked categories share a name, even across groups', () => {
  const { getByText, getByLabelText, getByDisplayValue } = toGroupsStep()
  fireEvent.press(getByText('Continue')) // groups
  fireEvent.changeText(getByDisplayValue('Shopping'), 'rent')
  fireEvent.press(getByLabelText('Select rent'))
  expect(getByLabelText('Select rent')).not.toBeChecked()
  expect(getByText("You've already got a category called rent.")).toBeTruthy()
})

it('picks a group emoji from the sheet instead of cycling', () => {
  const { getByText, getByLabelText, queryByText } = toGroupsStep()

  fireEvent.press(getByLabelText('Change emoji for Essentials'))
  expect(getByText('Pick an emoji for Essentials')).toBeTruthy()
  fireEvent.press(getByLabelText('🐶'))
  expect(queryByText('Pick an emoji for Essentials')).toBeNull()
  expect(getByLabelText('Change emoji for Essentials')).toHaveTextContent('🐶')
})

it('renames a category from the assign sheet, keeping the old name on a blank or clashing one', () => {
  const { getByText, getByLabelText, queryByText } = toGroupsStep()
  fireEvent.press(getByText('Continue')) // groups
  fireEvent.press(getByText('Continue')) // categories

  fireEvent.press(getByText('Rent'))
  fireEvent.changeText(getByLabelText('Category name'), 'Home rent')
  fireEvent.press(getByText('Done'))
  expect(getByText('Home rent')).toBeTruthy()
  expect(queryByText('Rent')).toBeNull()

  fireEvent.press(getByText('Home rent'))
  fireEvent.changeText(getByLabelText('Category name'), 'groceries')
  fireEvent.press(getByText('Done'))
  expect(getByText('Home rent')).toBeTruthy()
  expect(getByText("You've already got a category called groceries.")).toBeTruthy()

  fireEvent.press(getByText('Home rent'))
  fireEvent.changeText(getByLabelText('Category name'), '  ')
  fireEvent.press(getByText('Done'))
  expect(getByText('Home rent')).toBeTruthy()
})

it('changes a category emoji from the assign sheet', () => {
  const { getByText, getByLabelText, queryByLabelText } = toGroupsStep()
  fireEvent.press(getByText('Continue')) // groups
  fireEvent.press(getByText('Continue')) // categories

  fireEvent.press(getByText('Rent'))
  fireEvent.press(getByLabelText('Change emoji for Rent'))
  fireEvent.press(getByLabelText('🐶'))
  expect(queryByLabelText('🐶')).toBeNull()
  expect(getByLabelText('Change emoji for Rent')).toHaveTextContent('🐶')
  fireEvent.press(getByText('Done'))
  expect(getByText('🐶')).toBeTruthy()
})
