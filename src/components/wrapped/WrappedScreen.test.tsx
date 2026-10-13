import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { WrappedScreen } from './WrappedScreen'

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))
jest.mock('@/src/hooks/useWrappedMusic', () => ({ useWrappedMusic: () => {} }))
const mockUseWrapped = jest.fn()
jest.mock('@/src/hooks/useWrapped', () => ({ useWrapped: () => mockUseWrapped() }))

it.each([
  ['a 503', new Error('Failed to load wrapped: 503')],
  ['a transport failure', new TypeError('Network request failed')],
])('writes its own line for %s instead of the raw error', (_, error) => {
  mockUseWrapped.mockReturnValue({ data: undefined, isLoading: false, error })
  const { getByText, queryByText } = renderWithProviders(<WrappedScreen />)
  expect(getByText("Couldn't load your Wrapped. Check your connection and try again.")).toBeTruthy()
  expect(queryByText(error.message)).toBeNull()
})
