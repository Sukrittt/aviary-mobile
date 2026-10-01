import { BackHandler } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import GuidedTourScreen from './guided-tour'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockCompleteGuidedTour = jest.fn()
jest.mock('expo-router', () => ({
  useFocusEffect: jest.requireActual('react').useEffect,
  useRouter: () => ({ replace: mockReplace, push: mockPush, navigate: mockNavigate, back: jest.fn() }),
}))
jest.mock('@/src/hooks/useUser', () => ({
  useCompleteGuidedTour: () => ({ mutate: mockCompleteGuidedTour }),
}))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))
jest.mock('@/src/api/accessMode', () => ({
  accessMode: { subscribeLogout: () => () => {} },
}))

beforeEach(() => {
  jest.clearAllMocks()
})

/** Opens a chapter from the hub by its row title. */
function openChapter(getByText: ReturnType<typeof renderWithProviders>['getByText'], title: string) {
  fireEvent.press(getByText(title))
}

it('funding every envelope drives Ready to Assign to zero', async () => {
  const { getByText, getAllByText } = renderWithProviders(<GuidedTourScreen />)
  openChapter(getByText, 'Envelopes & Ready to Assign')

  expect(getByText('₹42,000 of your ₹42,000 income has no job yet')).toBeTruthy()

  fireEvent.press(getByText('Assign ₹22,000'))
  fireEvent.press(getByText('Assign ₹9,000'))
  fireEvent.press(getByText('Assign ₹6,000'))
  fireEvent.press(getByText('Assign ₹5,000'))

  await waitFor(() => expect(getByText('All your money has a job ✓')).toBeTruthy())
  expect(getAllByText('✓ Funded').length).toBe(4)
})

it('logging a card expense sets money aside in Credit Card Payment', async () => {
  const { getByText } = renderWithProviders(<GuidedTourScreen />)
  openChapter(getByText, 'Logging money')

  fireEvent.press(getByText('🍲  ₹700 · Dosa night'))

  await waitFor(() => expect(getByText('Credit Card Payment')).toBeTruthy())
  expect(getByText('₹700 set aside')).toBeTruthy()
})

it('corrects the belief that leftovers roll over', async () => {
  const { getByText } = renderWithProviders(<GuidedTourScreen />)
  openChapter(getByText, 'The new month')

  fireEvent.press(getByText("It rolls into October's Fun. ₹7,600 to play with"))

  await waitFor(() => expect(getByText(/Leftovers don't compound here/)).toBeTruthy())
})

it('October restarts Credit Card Payment at zero and drops leftovers', async () => {
  const { getByText, getAllByText } = renderWithProviders(<GuidedTourScreen />)
  openChapter(getByText, 'The new month')

  expect(getByText('₹1,200 still unspent')).toBeTruthy()

  fireEvent.press(getByText('October 1'))

  await waitFor(() => expect(getAllByText('LEFTOVER GONE').length).toBe(2))
  expect(getByText('₹0')).toBeTruthy()
  expect(getByText("restarts at zero · it was last month's bill")).toBeTruthy()
})

it('pings only the highest threshold crossed, then over budget', async () => {
  const { getByText, queryByText } = renderWithProviders(<GuidedTourScreen />)
  openChapter(getByText, 'Notifications')

  fireEvent.press(getByText('Spend ₹1,700'))
  await waitFor(() => expect(getByText('Groceries is at 52%')).toBeTruthy())

  fireEvent.press(getByText('Spend ₹1,700'))
  expect(queryByText('Groceries is at 71%')).toBeNull()

  fireEvent.press(getByText('Spend ₹1,700'))
  await waitFor(() => expect(getByText('Groceries is at 90%')).toBeTruthy())

  fireEvent.press(getByText('Spend ₹1,700'))
  await waitFor(() => expect(getByText('Groceries is over budget')).toBeTruthy())
  expect(getByText("You've overspent ₹800 in Groceries this month.")).toBeTruthy()
})

it('turning the digest off silences the AI coach but not Wrapped', async () => {
  const { getByText, queryByText } = renderWithProviders(<GuidedTourScreen />)
  openChapter(getByText, 'Notifications')

  fireEvent.press(getByText('Off'))
  fireEvent.press(getByText('🧠  AI coach'))
  await waitFor(() => expect(getByText('Silenced · your digest is Off')).toBeTruthy())
  expect(queryByText('Heads up on this month')).toBeNull()

  fireEvent.press(getByText('🎧  Wrapped'))
  await waitFor(() => expect(getByText('Your Wrapped is ready')).toBeTruthy())
})

it('walks hub to chapter, opens the real screen, and skips to Home', async () => {
  const { getByText } = renderWithProviders(<GuidedTourScreen />)

  fireEvent.press(getByText('Start the tour'))
  expect(getByText('CHAPTER 1 OF 7')).toBeTruthy()

  fireEvent.press(getByText('Try it for real · Open Home'))
  expect(mockNavigate).toHaveBeenCalledWith('/(tabs)')

  fireEvent.press(getByText('Skip'))
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
})

it('closes the tour to Home even when there is no previous screen', () => {
  const { getByLabelText } = renderWithProviders(<GuidedTourScreen />)
  fireEvent.press(getByLabelText('Close'))
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
})

it('returns to Home after finishing the tour', () => {
  const { getByText } = renderWithProviders(<GuidedTourScreen />)
  openChapter(getByText, 'Everything else')
  fireEvent.press(getByText('Finish the tour'))
  expect(mockCompleteGuidedTour).toHaveBeenCalledTimes(1)
  fireEvent.press(getByText('Back to my money'))
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
})

it('handles Android back and removes the listener when leaving the tour', () => {
  const remove = jest.fn()
  const subscribe = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove })
  const { unmount } = renderWithProviders(<GuidedTourScreen />)
  const handler = subscribe.mock.calls.find(([event]) => event === 'hardwareBackPress')![1]
  expect(handler({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true)
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  unmount()
  expect(remove).toHaveBeenCalled()
  subscribe.mockRestore()
})
