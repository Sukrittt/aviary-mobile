import { fireEvent, render, screen } from '@testing-library/react-native'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import type { WrappedData } from '@/src/api/wrapped'
import { track } from '@/src/lib/analytics'
import { ShareCard } from './ShareCard'

const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ dismissTo: mockDismissTo }) }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }))
jest.mock('./WrappedCard', () => {
  const { View } = jest.requireActual('react-native')
  const Pass = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>
  return { WrappedCard: Pass, WRise: Pass }
})

const data = {
  month: '2026-09',
  range: { startDate: '2026-09-01', endDate: '2026-09-30', daysTracked: 27 },
  totalSpent: 12000,
  totalTransactions: 40,
  topCategories: [],
  biggestPurchase: null,
  topWeekday: null,
  longestStreak: null,
  longestGap: null,
  weeklyTotals: [],
} as WrappedData

it('ends Wrapped by pointing at the month ahead', () => {
  render(<CurrencyScope code="INR"><ShareCard data={data} onColor="#fff" /></CurrencyScope>)
  fireEvent.press(screen.getByText('Plan this month'))
  expect(track).toHaveBeenCalledWith('wrapped_plan_tapped')
  // Closes Wrapped rather than switching tabs under it, which left its music playing.
  expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)')
})
