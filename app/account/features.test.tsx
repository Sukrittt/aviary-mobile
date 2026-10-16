import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { useUser, useUpdateUser } from '@/src/hooks/useUser'
import { Alert } from '@/src/components/ui/AlertHost'
import FeaturesScreen from './features'

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))
jest.mock('@/src/hooks/useUser', () => ({ useUser: jest.fn(), useUpdateUser: jest.fn() }))
jest.mock('@/src/components/ui/AlertHost', () => ({ Alert: { alert: jest.fn() } }))

const mutate = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(useUpdateUser as jest.Mock).mockReturnValue({ mutate })
  ;(useUser as jest.Mock).mockReturnValue({ data: { email: 'a@b.com', emailVerified: true, hiddenFeatures: ['wrapped'] } })
})

describe('Features screen', () => {
  it('shows hidden features as off and the rest as on', () => {
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    expect(getByLabelText('Show Expense Wrapped').props.accessibilityState.checked).toBe(false)
    expect(getByLabelText('Show Insights').props.accessibilityState.checked).toBe(true)
  })

  it('hiding a feature adds it to the saved list', () => {
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    fireEvent.press(getByLabelText('Show Insights'))
    expect(mutate).toHaveBeenCalledWith({ hiddenFeatures: ['wrapped', 'insights'] }, expect.anything())
  })

  it('showing a feature removes it from the saved list', () => {
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    fireEvent.press(getByLabelText('Show Expense Wrapped'))
    expect(mutate).toHaveBeenCalledWith({ hiddenFeatures: [] }, expect.anything())
  })

  it('flips instantly and stacks quick flips before the server answers', () => {
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    fireEvent.press(getByLabelText('Show Insights'))
    expect(getByLabelText('Show Insights').props.accessibilityState.checked).toBe(false)
    fireEvent.press(getByLabelText('Show Investments'))
    expect(mutate).toHaveBeenLastCalledWith({ hiddenFeatures: ['wrapped', 'insights', 'investments'] }, expect.anything())
  })

  it('puts the switch back and says so when saving fails', () => {
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    fireEvent.press(getByLabelText('Show Insights'))
    act(() => mutate.mock.calls[0][1].onError(new Error('offline')))
    expect(getByLabelText('Show Insights').props.accessibilityState.checked).toBe(true)
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't save", 'Check your connection and try again.')
  })

  it('starts a new account with only the core features on', () => {
    ;(useUser as jest.Mock).mockReturnValue({ data: { email: 'a@b.com', emailVerified: true, createdAt: '2026-11-01T09:00:00.000Z' } })
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    expect(getByLabelText('Show Insights').props.accessibilityState.checked).toBe(false)
    expect(getByLabelText('Show Income').props.accessibilityState.checked).toBe(true)
    fireEvent.press(getByLabelText('Show Insights'))
    expect(mutate).toHaveBeenCalledWith({ hiddenFeatures: ['askAviary', 'billScan', 'wrapped', 'investments', 'subscriptions'] }, expect.anything())
  })

  it('turns the Activity feed on, off by default', () => {
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    expect(getByLabelText('Feed view in Activity').props.accessibilityState.checked).toBe(false)
    fireEvent.press(getByLabelText('Feed view in Activity'))
    expect(mutate).toHaveBeenCalledWith({ activityFeed: true }, expect.anything())
  })
})
