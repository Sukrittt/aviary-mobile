import { render, screen } from '@testing-library/react-native'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import type { WrappedData } from '@/src/api/wrapped'
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/shared/CategoryIcon'
import { ArchetypeCard, TotalSpentCard, getArchetype } from './WrappedCards'

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
  range: { startDate: '2026-09-03', endDate: '2026-09-30', daysTracked: 7 },
  totalSpent: 12000,
  totalTransactions: 19,
  topCategories: [{ category: '🏠 Rent', total: 9700, pct: 81 }],
  biggestPurchase: { item: 'Rent', amountInr: 5000, category: '🏠 Rent', date: '2026-09-03' },
  topWeekday: null,
  longestStreak: { days: 3, startDate: '2026-09-22', endDate: '2026-09-24' },
  longestGap: null,
  weeklyTotals: [],
} as WrappedData

const renderInr = (ui: React.ReactElement) => render(<CurrencyScope code="INR">{ui}</CurrencyScope>)

describe('TotalSpentCard', () => {
  it('averages over the whole month, not just the days with a log', () => {
    renderInr(<TotalSpentCard data={data} color="#000" onColor="#fff" />)
    expect(screen.getByText("That's about ₹400 a day across September.")).toBeTruthy()
    expect(screen.queryByText(/every single day/)).toBeNull()
  })

  it('compares against last month when there is one', () => {
    renderInr(<TotalSpentCard data={{ ...data, previous: { month: '2026-08', totalSpent: 15000, daysLogged: 9, longestStreak: 2, topCategories: [] } }} color="#000" onColor="#fff" />)
    expect(screen.getByText('20% less than Aug')).toBeTruthy()
  })
})

describe('getArchetype', () => {
  it("uses Jev's persona when it had one", () => {
    expect(getArchetype(data, { persona: 'big_swing', treatCategory: null })).toMatchObject({ title: 'The Big Swing', blurb: 'One call shaped the whole month: Rent.' })
  })

  it('falls back to the top category without Jev', () => {
    expect(getArchetype(data, { persona: null, treatCategory: null })).toMatchObject({ title: 'The Homebody', blurb: 'Rent first, everything else negotiable. A steady hand.' })
    expect(getArchetype(data).title).toBe('The Homebody')
  })
})

describe('ArchetypeCard', () => {
  it("draws the fallback persona and its category chip with the category's icon, not its emoji", () => {
    renderInr(<ArchetypeCard data={data} color="#000" onColor="#fff" />)
    expect(screen.getByText('Rent · 81%')).toBeTruthy()
    expect(screen.UNSAFE_getAllByType(CATEGORY_ICON_COMPONENTS.House)).toHaveLength(2)
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
