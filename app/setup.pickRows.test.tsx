import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SetupScreen from './setup'

// The usual setup steps, as on a binary without the file picker; setup.import.test.tsx covers the import.
jest.mock('@/src/lib/filePicker', () => ({ canPickFiles: false, pickFile: jest.fn() }))

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
jest.mock('@/src/api/groups', () => ({ addGroup: jest.fn(async () => ({})), updateGroup: jest.fn(async () => ({})) }))
jest.mock('@/src/api/categories', () => ({ addCategory: jest.fn(async () => ({})) }))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))

function toGroupsStep() {
  const utils = renderWithProviders(<SetupScreen />)
  fireEvent.press(utils.getByText('Continue')) // currency
  fireEvent.press(utils.getByText('₹50,000'))
  fireEvent.press(utils.getByText('Build my own budget')) // income
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

it('picks a group icon inline beside its name', () => {
  const { getByLabelText, queryByLabelText } = toGroupsStep()

  fireEvent.press(getByLabelText('Icon: Basket. Change icon'))
  fireEvent.changeText(getByLabelText('Search icons'), 'dog')
  fireEvent.press(getByLabelText('Dog'))
  expect(queryByLabelText('Search icons')).toBeNull()
  expect(getByLabelText('Icon: Dog. Change icon')).toBeTruthy()
})

it('gives a new category the icon its name suggests until one is picked', () => {
  const { getByText, getAllByText, getByDisplayValue, getByLabelText, getAllByLabelText } = toGroupsStep()
  fireEvent.press(getByText('Continue')) // groups
  fireEvent.press(getAllByText('Add category')[0])
  const input = getByDisplayValue('')
  fireEvent.changeText(input, 'Water')
  expect(getAllByLabelText('Icon: Drop. Change icon')).toHaveLength(1)
  fireEvent.press(getByLabelText('Icon: Drop. Change icon'))
  fireEvent.press(getByLabelText('Coffee'))
  fireEvent.changeText(input, 'Water bill')
  expect(getByLabelText('Icon: Coffee. Change icon')).toBeTruthy()
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

it('changes a category icon from the assign sheet', () => {
  const { getByText, getByLabelText } = toGroupsStep()
  fireEvent.press(getByText('Continue')) // groups
  fireEvent.press(getByText('Continue')) // categories

  fireEvent.press(getByText('Rent'))
  fireEvent.press(getByLabelText('Icon: House. Change icon'))
  fireEvent.changeText(getByLabelText('Search icons'), 'dog')
  fireEvent.press(getByLabelText('Dog'))
  expect(getByLabelText('Icon: Dog. Change icon')).toBeTruthy()
  fireEvent.press(getByText('Done'))
  expect(getByText('Rent')).toBeTruthy()
})
