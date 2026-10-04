import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import TrialNoticeScreen from './trial-notice'

const mockReplace = jest.fn()
const mockBack = jest.fn()
let mockParams: { from?: string } = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
})

it('sends the user to Home after acknowledging the trial notice', () => {
  const { getByText } = renderWithProviders(<TrialNoticeScreen />)

  expect(getByText("You're on the trial plan")).toBeTruthy()
  // Billing is live for everyone, even before the status loads.
  expect(getByText("Everything's free for 45 days. No card needed, nothing to cancel.")).toBeTruthy()
  expect(getByText('What happens when it ends')).toBeTruthy()

  fireEvent.press(getByText('Got it'))
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
})

it('goes back when opened from More instead of dropping the user on Home', () => {
  mockParams = { from: 'more' }
  const { getByText } = renderWithProviders(<TrialNoticeScreen />)

  fireEvent.press(getByText('Got it'))
  expect(mockBack).toHaveBeenCalled()
  expect(mockReplace).not.toHaveBeenCalled()
})
