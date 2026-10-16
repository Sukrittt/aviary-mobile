import { fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from '@/src/components/ui/AlertHost'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { OPT_IN_FEATURES } from '@/src/lib/features'
import { track } from '@/src/lib/analytics'
import { EXTRAS, PickExtras } from './PickExtras'

const mockMutate = jest.fn(async (_patch: object) => ({}))
let mockUser: object | undefined
jest.mock('@/src/hooks/useUser', () => ({
  useUser: () => ({ data: mockUser }),
  useUpdateUser: () => ({ mutateAsync: mockMutate }),
}))
jest.mock('@/src/components/ui/AlertHost', () => ({ Alert: { alert: jest.fn() } }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { email: 'a@b.com', emailVerified: true, createdAt: '2026-11-01T00:00:00.000Z' }
})

it('pitches every extra a new account starts without', () => {
  expect(EXTRAS.map((e) => e.key).sort()).toEqual([...OPT_IN_FEATURES].sort())
})

it('starts everything off, even for an account that defaults to all on', async () => {
  mockUser = { email: 'a@b.com', emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z' }
  const onDone = jest.fn()
  const { getByLabelText, getByText } = renderWithProviders(<PickExtras onDone={onDone} />)
  expect(getByLabelText('Turn on Insights').props.accessibilityState.checked).toBe(false)
  fireEvent.press(getByText('Skip for now'))
  expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: OPT_IN_FEATURES })
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})

it('saves the extras switched on and leaves the rest hidden', async () => {
  const onDone = jest.fn()
  const { getByLabelText, getByText } = renderWithProviders(<PickExtras onDone={onDone} />)
  fireEvent.press(getByLabelText('Turn on Insights'))
  fireEvent.press(getByLabelText('Turn on Scan a bill'))
  fireEvent.press(getByText('Continue'))
  expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: ['askAviary', 'wrapped', 'investments', 'subscriptions'] })
  expect(track).toHaveBeenCalledWith('onboarding_extras_chosen', { extras: 'insights,billScan', count: 2 })
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})

it('keeps a hidden core feature hidden', async () => {
  mockUser = { email: 'a@b.com', emailVerified: true, hiddenFeatures: ['income', 'wrapped'] }
  const { getByLabelText, getByText } = renderWithProviders(<PickExtras onDone={jest.fn()} />)
  fireEvent.press(getByLabelText('Turn on Expense Wrapped'))
  fireEvent.press(getByText('Continue'))
  expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: ['income', 'askAviary', 'billScan', 'investments', 'subscriptions', 'insights'] })
})

it('says so when saving fails, and still finishes setup', async () => {
  mockMutate.mockRejectedValueOnce(new Error('offline'))
  const onDone = jest.fn()
  const { getByText } = renderWithProviders(<PickExtras onDone={onDone} />)
  fireEvent.press(getByText('Skip for now'))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(Alert.alert).toHaveBeenCalledWith("Couldn't save your extras", 'Turn them on anytime from You, then Features.')
})

it('turns an extra on from a tap anywhere on its row', () => {
  const { getByText, getByLabelText } = renderWithProviders(<PickExtras onDone={jest.fn()} />)
  fireEvent.press(getByText('Trends, a daily heatmap and where it all went'))
  expect(getByLabelText('Turn on Insights').props.accessibilityState.checked).toBe(true)
  fireEvent.press(getByText('Insights'))
  expect(getByLabelText('Turn on Insights').props.accessibilityState.checked).toBe(false)
})
