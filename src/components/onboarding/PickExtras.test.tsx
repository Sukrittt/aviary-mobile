import { act, fireEvent, waitFor } from '@testing-library/react-native'
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

// A new account, set up, that hasn't picked its extras anywhere yet.
const NEW = { email: 'a@b.com', emailVerified: true, createdAt: '2026-11-01T00:00:00.000Z', onboardedAt: '2026-11-01T00:05:00.000Z' }

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = NEW
})

it('pitches every extra a new account starts without', () => {
  expect(EXTRAS.map((e) => e.key).sort()).toEqual([...OPT_IN_FEATURES].sort())
})

it('shows only for a new account that has never chosen', () => {
  expect(renderWithProviders(<PickExtras />).queryByText('Want any extras?')).toBeTruthy()
  mockUser = { ...NEW, hiddenFeatures: OPT_IN_FEATURES }
  expect(renderWithProviders(<PickExtras />).queryByText('Want any extras?')).toBeNull()
  // From before new accounts started with extras off: everything is already on.
  mockUser = { ...NEW, createdAt: '2026-01-01T00:00:00.000Z' }
  expect(renderWithProviders(<PickExtras />).queryByText('Want any extras?')).toBeNull()
  mockUser = { ...NEW, onboardedAt: null }
  expect(renderWithProviders(<PickExtras />).queryByText('Want any extras?')).toBeNull()
})

it('starts everything off, and Not now saves the defaults so it stays gone', async () => {
  const { getByLabelText, getByText, queryByText } = renderWithProviders(<PickExtras />)
  expect(getByLabelText('Turn on Insights').props.accessibilityState.checked).toBe(false)
  fireEvent.press(getByText('Not now'))
  expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: OPT_IN_FEATURES })
  expect(track).toHaveBeenCalledWith('onboarding_extras_chosen', { extras: '', count: 0 })
  await waitFor(() => expect(queryByText('Want any extras?')).toBeNull())
})

it('saves the extras switched on, plays the check, then leaves', async () => {
  jest.useFakeTimers()
  const { getByLabelText, getByText, queryByText } = renderWithProviders(<PickExtras />)
  fireEvent.press(getByLabelText('Turn on Insights'))
  fireEvent.press(getByLabelText('Turn on Scan a bill'))
  fireEvent.press(getByText('Turn on 2'))
  expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: ['askAviary', 'wrapped', 'investments', 'subscriptions'] })
  expect(track).toHaveBeenCalledWith('onboarding_extras_chosen', { extras: 'insights,billScan', count: 2 })
  // Still up while the check plays, even though the choice is already in the profile.
  mockUser = { ...NEW, hiddenFeatures: ['askAviary', 'wrapped', 'investments', 'subscriptions'] }
  await act(async () => {})
  expect(queryByText('Want any extras?')).toBeTruthy()
  act(() => jest.advanceTimersByTime(1100))
  expect(queryByText('Want any extras?')).toBeNull()
  jest.useRealTimers()
})

it('keeps a hidden core feature hidden', () => {
  mockUser = { ...NEW, hiddenFeatures: undefined }
  const { getByLabelText, getByText } = renderWithProviders(<PickExtras />)
  fireEvent.press(getByLabelText('Turn on Expense Wrapped'))
  fireEvent.press(getByText('Turn on 1'))
  expect(mockMutate).toHaveBeenCalledWith({ hiddenFeatures: ['askAviary', 'billScan', 'investments', 'subscriptions', 'insights'] })
})

it('says so when saving fails, and stays so it can be tried again', async () => {
  mockMutate.mockRejectedValueOnce(new Error('offline'))
  const { getByText, getByLabelText } = renderWithProviders(<PickExtras />)
  fireEvent.press(getByLabelText('Turn on Insights'))
  fireEvent.press(getByText('Turn on 1'))
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't save your extras", 'Turn them on anytime from You, then Features.'))
  expect(getByText('Turn on 1')).toBeTruthy()
})

it('turns an extra on from a tap anywhere on its row', () => {
  const { getByText, getByLabelText } = renderWithProviders(<PickExtras />)
  fireEvent.press(getByText('Trends, a daily heatmap and where it all went'))
  expect(getByLabelText('Turn on Insights').props.accessibilityState.checked).toBe(true)
  fireEvent.press(getByText('Insights'))
  expect(getByLabelText('Turn on Insights').props.accessibilityState.checked).toBe(false)
})

it('locks the rows once a save has started, so a late flip is never left unsaved', () => {
  mockMutate.mockReturnValueOnce(new Promise(() => {}))
  const { getByLabelText, getByText } = renderWithProviders(<PickExtras />)
  fireEvent.press(getByLabelText('Turn on Insights'))
  fireEvent.press(getByText('Turn on 1'))
  fireEvent.press(getByLabelText('Turn on Scan a bill'))
  expect(getByLabelText('Turn on Scan a bill').props.accessibilityState).toMatchObject({ checked: false, disabled: true })
  expect(mockMutate).toHaveBeenCalledTimes(1)
})
