import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { shownRelease } from '@/src/features/changelog/useChangelogGate'
import WhatsNewScreen from './whats-new'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({ router: { back: () => mockBack(), replace: jest.fn(), canGoBack: () => true } }))
jest.mock('@/src/features/changelog/useChangelogGate', () => ({ shownRelease: jest.fn() }))

beforeEach(() => jest.clearAllMocks())

it('shows the claimed release and closes on Got it', () => {
  ;(shownRelease as jest.Mock).mockReturnValue({
    id: 'r1', platform: 'mobile', title: 'Log faster', version: 'v2.6.0', highlights: ['Quick capture', 'Smarter categories'],
    body: 'The full notes.', publishedAt: '2026-10-08T00:00:00.000Z',
  })
  const { getByText, queryByText } = renderWithProviders(<WhatsNewScreen />)
  expect(getByText('Log faster')).toBeTruthy()
  expect(getByText('v2.6.0 · Oct 8, 2026')).toBeTruthy()
  expect(getByText('Smarter categories')).toBeTruthy()
  expect(queryByText('The full notes.')).toBeNull()
  fireEvent.press(getByText('Read the full notes'))
  expect(getByText('The full notes.')).toBeTruthy()
  fireEvent.press(getByText('Got it'))
  expect(mockBack).toHaveBeenCalled()
})

it('closes straight away when nothing was claimed', async () => {
  ;(shownRelease as jest.Mock).mockReturnValue(null)
  renderWithProviders(<WhatsNewScreen />)
  await waitFor(() => expect(mockBack).toHaveBeenCalled())
})
