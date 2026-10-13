import { Linking } from 'react-native'
import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { WEB_URL } from '@/src/api/client'
import HelpScreen from './help'

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'
const mockStoreUrl = jest.fn<string | null, []>(() => PLAY_URL)
jest.mock('expo-store-review', () => ({ storeUrl: () => mockStoreUrl() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }))

describe('Help screen', () => {
  let openUrl: jest.SpyInstance
  beforeEach(() => {
    mockPush.mockClear()
    openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  })
  afterEach(() => openUrl.mockRestore())

  it.each([
    ['Take the guided tour', '/account/guided-tour'],
    ['Changelog', '/account/changelog'],
    ['Feedback board', '/account/ideas'],
    ['Report a bug', '/account/feedback'],
  ])('opens %s', (label, route) => {
    const { getByText } = renderWithProviders(<HelpScreen />)
    fireEvent.press(getByText(label))
    expect(mockPush).toHaveBeenCalledWith(route)
  })

  it('opens the web app in the browser', () => {
    const { getByText } = renderWithProviders(<HelpScreen />)
    fireEvent.press(getByText('Open web app'))
    expect(openUrl).toHaveBeenCalledWith(WEB_URL)
  })

  it('opens the Play listing to rate', () => {
    const { getByText } = renderWithProviders(<HelpScreen />)
    fireEvent.press(getByText('Rate Aviary'))
    expect(openUrl).toHaveBeenCalledWith(PLAY_URL)
  })

  it('drops Rate Aviary without a store listing', () => {
    mockStoreUrl.mockReturnValueOnce(null)
    const { queryByText } = renderWithProviders(<HelpScreen />)
    expect(queryByText('Rate Aviary')).toBeNull()
  })
})
