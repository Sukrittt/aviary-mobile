import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { useUser, useUpdateUser } from '@/src/hooks/useUser'
import FeaturesScreen from './features'

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))
jest.mock('@/src/hooks/useUser', () => ({ useUser: jest.fn(), useUpdateUser: jest.fn() }))

const mutate = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(useUpdateUser as jest.Mock).mockReturnValue({ mutate })
  ;(useUser as jest.Mock).mockReturnValue({ data: { email: 'a@b.com', emailVerified: true, hiddenFeatures: ['wrapped'] } })
})

describe('Features screen', () => {
  it('shows hidden features as off and the rest as on', () => {
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    expect(getByLabelText('Show Expense Wrapped').props.value).toBe(false)
    expect(getByLabelText('Show Insights').props.value).toBe(true)
  })

  it('hiding a feature adds it to the saved list', () => {
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    fireEvent(getByLabelText('Show Insights'), 'valueChange', false)
    expect(mutate).toHaveBeenCalledWith({ hiddenFeatures: ['wrapped', 'insights'] })
  })

  it('showing a feature removes it from the saved list', () => {
    const { getByLabelText } = renderWithProviders(<FeaturesScreen />)
    fireEvent(getByLabelText('Show Expense Wrapped'), 'valueChange', true)
    expect(mutate).toHaveBeenCalledWith({ hiddenFeatures: [] })
  })
})
