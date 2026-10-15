import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { Alert } from '@/src/components/ui/AlertHost'
import FeedbackScreen from './feedback'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))
const mockSubmit = jest.fn()
jest.mock('@/src/api/feedback', () => ({ submitFeedback: (...args: unknown[]) => mockSubmit(...args) }))
const mockPickPhoto = jest.fn()
jest.mock('@/src/features/log-expense/ExpensePhotoField', () => ({ pickPhoto: (...args: unknown[]) => mockPickPhoto(...args) }))

beforeEach(() => jest.clearAllMocks())

it('sends a private bug report', async () => {
  mockSubmit.mockResolvedValue(undefined)
  const { getByText, getByPlaceholderText, queryByText } = renderWithProviders(<FeedbackScreen />)
  fireEvent.changeText(getByPlaceholderText("What's broken?"), 'Balance is off')
  fireEvent.changeText(getByPlaceholderText('What happened, and what did you expect instead?'), 'After a move')
  await act(async () => fireEvent.press(getByText('Send report')))
  expect(mockSubmit).toHaveBeenCalledWith('bug', 'Balance is off', 'After a move', undefined)
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

it('attaches an optional screenshot from the library and warns about amounts', async () => {
  mockSubmit.mockResolvedValue(undefined)
  mockPickPhoto.mockResolvedValue({ uri: 'file:///shot.png', base64: 'c2hvdA==', mimeType: 'image/png' })
  const { getByText, getByPlaceholderText, getByLabelText } = renderWithProviders(<FeedbackScreen />)
  expect(getByText(/Turn on Hide amounts in More/)).toBeTruthy()
  await act(async () => fireEvent.press(getByText('Add a screenshot')))
  expect(mockPickPhoto).toHaveBeenCalledWith('library')
  expect(getByLabelText('Your screenshot')).toBeTruthy()
  fireEvent.changeText(getByPlaceholderText("What's broken?"), 'Chart overlaps')
  fireEvent.changeText(getByPlaceholderText('What happened, and what did you expect instead?'), 'On Insights')
  await act(async () => fireEvent.press(getByText('Send report')))
  expect(mockSubmit).toHaveBeenCalledWith('bug', 'Chart overlaps', 'On Insights', { image: 'c2hvdA==', mimeType: 'image/png' })
})

it('drops a removed screenshot', async () => {
  mockSubmit.mockResolvedValue(undefined)
  mockPickPhoto.mockResolvedValue({ uri: 'file:///shot.png', base64: 'c2hvdA==', mimeType: 'image/png' })
  const { getByText, getByPlaceholderText, getByLabelText } = renderWithProviders(<FeedbackScreen />)
  await act(async () => fireEvent.press(getByText('Add a screenshot')))
  fireEvent.press(getByLabelText('Remove screenshot'))
  expect(getByText('Add a screenshot')).toBeTruthy()
  fireEvent.changeText(getByPlaceholderText("What's broken?"), 'x')
  fireEvent.changeText(getByPlaceholderText('What happened, and what did you expect instead?'), 'y')
  await act(async () => fireEvent.press(getByText('Send report')))
  expect(mockSubmit).toHaveBeenCalledWith('bug', 'x', 'y', undefined)
})
