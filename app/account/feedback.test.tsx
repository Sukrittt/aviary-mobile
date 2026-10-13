import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { Alert } from '@/src/components/ui/AlertHost'
import FeedbackScreen from './feedback'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))
const mockSubmit = jest.fn()
jest.mock('@/src/api/feedback', () => ({ submitFeedback: (...args: unknown[]) => mockSubmit(...args) }))

beforeEach(() => jest.clearAllMocks())

it('sends a private bug report', async () => {
  mockSubmit.mockResolvedValue(undefined)
  const { getByText, getByPlaceholderText, queryByText } = renderWithProviders(<FeedbackScreen />)
  fireEvent.changeText(getByPlaceholderText("What's broken?"), 'Balance is off')
  fireEvent.changeText(getByPlaceholderText('What happened, and what did you expect instead?'), 'After a move')
  await act(async () => fireEvent.press(getByText('Send report')))
  expect(mockSubmit).toHaveBeenCalledWith('bug', 'Balance is off', 'After a move')
  expect(queryByText('Send report')).toBeNull()
})

it('never shows raw error text', async () => {
  mockSubmit.mockRejectedValue(new Error('failed'))
  const alert = jest.spyOn(Alert, 'alert')
  const { getByText, getByPlaceholderText } = renderWithProviders(<FeedbackScreen />)
  fireEvent.changeText(getByPlaceholderText("What's broken?"), 'x')
  fireEvent.changeText(getByPlaceholderText('What happened, and what did you expect instead?'), 'y')
  await act(async () => fireEvent.press(getByText('Send report')))
  expect(alert).toHaveBeenCalledWith("Couldn't send that", 'Check your connection and try again.')
})
