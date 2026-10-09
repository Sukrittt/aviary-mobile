import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { weekRecapKey } from '@/src/features/week-recap/useWeekRecap'
import { getWeekRecap, markWeekRecapSeen, type WeekRecap } from '@/src/api/weekRecap'
import RecapRoute from './recap'

const mockBack = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), replace: (p: string) => mockReplace(p), canGoBack: () => true, push: jest.fn() },
}))
jest.mock('@/src/api/weekRecap', () => ({ getWeekRecap: jest.fn(), markWeekRecapSeen: jest.fn() }))

const recap: WeekRecap = {
  startDate: '2026-10-01',
  endDate: '2026-10-07',
  totalTransactions: 6,
  totalSpent: 2615,
  daysLogged: 5,
  topCategory: { category: 'Shopping', total: 2000, pct: 76.5 },
  biggest: { item: 'Shoes', category: 'Shopping', amountInr: 2000, date: '2026-10-06' },
  repeats: [{ item: 'Chai', category: 'Food', count: 3 }],
  usualMinute: 1260,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(markWeekRecapSeen as jest.Mock).mockResolvedValue(undefined)
})

it('marks the recap seen on open and walks through to the send-off', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: true, recap })
  const { findByText, getByLabelText, getByText } = renderWithProviders(<RecapRoute />)

  expect(await findByText("Here's what we learned about you")).toBeTruthy()
  expect(markWeekRecapSeen).toHaveBeenCalledTimes(1)

  for (let i = 0; i < 5; i++) fireEvent.press(getByLabelText('Next'))
  expect(getByText("You're off to a great start")).toBeTruthy()

  fireEvent.press(getByText('Keep going'))
  expect(mockBack).toHaveBeenCalled()
})

it('closes without marking anything when the recap is no longer due', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: false })
  renderWithProviders(<RecapRoute />)

  await waitFor(() => expect(mockBack).toHaveBeenCalled())
  expect(markWeekRecapSeen).not.toHaveBeenCalled()
})

it('drops the cached due flag once seen, without closing the open story', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: true, recap })
  const queryClient = createTestQueryClient()
  const { findByText, getByText } = renderWithProviders(<RecapRoute />, { queryClient })

  expect(await findByText("Here's what we learned about you")).toBeTruthy()
  await waitFor(() => expect(queryClient.getQueryData(weekRecapKey)).toEqual({ due: false }))
  expect(getByText("Here's what we learned about you")).toBeTruthy()
  expect(mockBack).not.toHaveBeenCalled()
})

it('plays on its own like Wrapped and stops on the last slide', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: true, recap })
  // Start and stop every animation on the same clock. Switching clocks after
  // mount leaves the first frame on a real timer and makes advancement race it.
  jest.useFakeTimers()
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(weekRecapKey, { due: true, recap })
  const { getByText, unmount } = renderWithProviders(<RecapRoute />, { queryClient })
  try {
    expect(getByText("Here's what we learned about you")).toBeTruthy()
    await act(async () => { jest.advanceTimersByTime(5100) })
    expect(getByText('Chai, 3 times')).toBeTruthy()
    for (let i = 0; i < 4; i++) await act(async () => { jest.advanceTimersByTime(5100) })
    expect(getByText("You're off to a great start")).toBeTruthy()
    await act(async () => { jest.advanceTimersByTime(10_000) })
    expect(getByText("You're off to a great start")).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
  } finally {
    unmount()
    queryClient.clear()
    jest.useRealTimers()
  }
})
