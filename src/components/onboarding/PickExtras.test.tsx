import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { OPT_IN_FEATURES } from '@/src/lib/features'
import { track } from '@/src/lib/analytics'
import { EXTRAS, PickExtras } from './PickExtras'

const mockMutate = jest.fn()
let mockUser: object | undefined
jest.mock('@/src/hooks/useUser', () => ({
  useUser: () => ({ data: mockUser }),
  useUpdateUser: () => ({ mutate: mockMutate }),
}))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { email: 'a@b.com', emailVerified: true, createdAt: '2026-11-01T00:00:00.000Z' }
})

it('pitches every extra a new account starts without', () => {
  expect(EXTRAS.map((e) => e.key).sort()).toEqual([...OPT_IN_FEATURES].sort())
})

it('starts everything off, even for an account that defaults to all on', () => {
  mockUser = { email: 'a@b.com', emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z' }
  const onDone = jest.fn()
  const { getByLabelText, getByText } = renderWithProviders(<PickExtras onDone={onDone} />)
  expect(getByLabelText('Turn on Insights').props.accessibilityState.checked).toBe(false)
  fireEvent.press(getByText('Skip for now'))
  expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: OPT_IN_FEATURES }, expect.anything())
  expect(onDone).toHaveBeenCalled()
})

it('saves the extras switched on and leaves the rest hidden', () => {
  const onDone = jest.fn()
  const { getByLabelText, getByText } = renderWithProviders(<PickExtras onDone={onDone} />)
  fireEvent.press(getByLabelText('Turn on Insights'))
  fireEvent.press(getByLabelText('Turn on Scan a bill'))
  fireEvent.press(getByText('Start budgeting'))
  expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: ['askAviary', 'wrapped', 'investments', 'subscriptions'] }, expect.anything())
  expect(track).toHaveBeenCalledWith('onboarding_extras_chosen', { extras: 'insights,billScan', count: 2 })
  expect(onDone).toHaveBeenCalled()
})

it('keeps a hidden core feature hidden', () => {
  mockUser = { email: 'a@b.com', emailVerified: true, hiddenFeatures: ['income', 'wrapped'] }
  const { getByLabelText, getByText } = renderWithProviders(<PickExtras onDone={jest.fn()} />)
  fireEvent.press(getByLabelText('Turn on Expense Wrapped'))
  fireEvent.press(getByText('Start budgeting'))
  expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: ['income', 'askAviary', 'billScan', 'investments', 'subscriptions', 'insights'] }, expect.anything())
})
