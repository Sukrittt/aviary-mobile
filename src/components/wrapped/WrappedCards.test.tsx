import { render, screen } from '@testing-library/react-native'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import type { WrappedData } from '@/src/api/wrapped'
import { IntroCard } from './WrappedCards'

jest.mock('./WrappedCard', () => {
  const { Text, View } = jest.requireActual('react-native')
  const Pass = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>
  return {
    WrappedCard: Pass, WrappedGlow: () => null, WFade: Pass, WRise: Pass, WPop: Pass, WGrowX: Pass, WNudge: Pass,
    WrappedBigNumber: ({ value }: { value: string }) => <Text>{value}</Text>,
    WrappedCaption: ({ value }: { value: string }) => <Text>{value}</Text>,
  }
})

const data = {
  month: '2026-09',
  range: { startDate: '2026-09-01', endDate: '2026-09-30', daysTracked: 27 },
} as WrappedData

describe('IntroCard', () => {
  it('keeps chai and EMI for rupee users', () => {
    render(<CurrencyScope code="INR"><IntroCard data={data} color="#000" onColor="#fff" /></CurrencyScope>)
    expect(screen.getByText(/every chai, every EMI/)).toBeTruthy()
  })
  it('uses universal examples for other currencies', () => {
    render(<CurrencyScope code="USD"><IntroCard data={data} color="#000" onColor="#fff" /></CurrencyScope>)
    expect(screen.queryByText(/chai|EMI/)).toBeNull()
    expect(screen.getByText(/every coffee, every bill/)).toBeTruthy()
  })
})
