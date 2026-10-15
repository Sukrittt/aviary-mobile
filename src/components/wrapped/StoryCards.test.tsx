import { render, screen } from '@testing-library/react-native'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import type { StoryFacts, StoryType, WrappedData, WrappedStory } from '@/src/api/wrapped'
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/shared/CategoryIcon'
import { StoryCard, isKnownStory } from './StoryCards'
import { CategoryIconsContext } from './CategoryLabel'

jest.mock('./WrappedCard', () => {
  const { Text, View } = jest.requireActual('react-native')
  const Pass = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>
  return {
    WrappedCard: ({ eyebrow, children }: { eyebrow?: string; children?: React.ReactNode }) => (
      <View>
        {eyebrow && <Text>{eyebrow}</Text>}
        {children}
      </View>
    ),
    WFade: Pass, WRise: Pass, WPop: Pass, WGrowX: Pass, WNudge: Pass,
    WrappedBigNumber: ({ value }: { value: string }) => <Text>{value}</Text>,
    WrappedCaption: ({ value }: { value: string }) => <Text>{value}</Text>,
  }
})

const data = {
  month: '2026-09',
  weeklyTotals: [
    { label: '1-7', total: 5000 },
    { label: '8-14', total: 0 },
    { label: '15-21', total: 0 },
    { label: '22-end', total: 7403 },
  ],
} as WrappedData

/** One realistic facts object per story type: every card must render from these alone. */
const FACTS: StoryFacts = {
  showed_up: { days: 22, daysInMonth: 30 },
  streak: { days: 9, startDate: '2026-09-04', endDate: '2026-09-12' },
  comeback: { quietDays: 8, startDate: '2026-09-03', endDate: '2026-09-12' },
  night_logger: { lateCount: 12, count: 20 },
  how_you_log: { scans: 11, count: 30 },
  biggest_hit: { item: 'Rent', amount: 5000, category: '🏠 Rent', date: '2026-09-03', timesMedian: 8.4 },
  small_stuff: { count: 41, total: 4120, of: 50 },
  spendiest_weekday: { day: 'Thursday', total: 11659, count: 11, totals: [400, 0, 0, 11659, 0, 200, 0] },
  heavy_week: { startDate: '2026-09-22', endDate: '2026-09-30', total: 7403, share: 0.6 },
  weekend_split: { heavier: 'weekend', ratio: 2.04 },
  your_usual: { item: 'Chai', count: 14, total: 840 },
  top_category: { category: '🏠 Rent', total: 10000, pct: 81, runnersUp: [{ category: '💡 Utilities', total: 1000 }] },
  where_it_went: { categories: [{ category: '🏠 Rent', total: 10000, pct: 81 }, { category: '💡 Utilities', total: 1000, pct: 8 }, { category: '🍜 Food', total: 700, pct: 6 }] },
  stayed_put: { left: 44917, assigned: 92600 },
  burst_envelope: { category: '🍜 Eating out', spent: 1400, budget: 1000 },
  up_or_down: { previousMonth: '2026-08', previousTotal: 15603, total: 12403 },
  category_mover: { category: '✈️ Travel', previous: 1000, current: 3000 },
  new_category: { category: '🐶 Pets', total: 1200 },
  habit_change: { metric: 'streak', from: 3, to: 9 },
}

function story<T extends StoryType>(type: T, variant = 0): WrappedStory {
  return { type, group: 'habit', score: 1, variant, facts: FACTS[type] } as WrappedStory
}

const renderStory = (s: WrappedStory, code = 'INR') =>
  render(
    <CurrencyScope code={code}>
      <StoryCard story={s} data={data} color="#000" onColor="#ffffff" />
    </CurrencyScope>,
  )

describe('StoryCard', () => {
  it.each(Object.keys(FACTS) as StoryType[])('renders %s in every copy variant', (type) => {
    for (const variant of [0, 1, 2]) {
      const { unmount } = renderStory(story(type, variant))
      expect(screen.toJSON()).toBeTruthy()
      unmount()
    }
  })

  it('keeps chai and EMI for rupee users, universal examples otherwise', () => {
    renderStory(story('showed_up', 1))
    expect(screen.getByText(/every chai, every EMI/)).toBeTruthy()
    renderStory(story('showed_up', 1), 'USD')
    expect(screen.getByText(/every coffee, every bill/)).toBeTruthy()
  })

  it('labels the last week with the real month end, so nothing wraps mid-word', () => {
    renderStory(story('heavy_week'))
    expect(screen.getByText('22–30')).toBeTruthy()
    expect(screen.getByText('22–30 Sep carried the month.')).toBeTruthy()
  })

  it('says "less" and names last month when spending dropped', () => {
    renderStory(story('up_or_down'))
    expect(screen.getByText('₹3,200 less')).toBeTruthy()
    expect(screen.getByText('Vs August')).toBeTruthy()
  })

  it('draws categories with their icon, never the emoji in their name', () => {
    for (const type of Object.keys(FACTS) as StoryType[]) {
      const { unmount } = renderStory(story(type))
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/\p{Extended_Pictographic}/u)
      unmount()
    }
    renderStory(story('biggest_hit'))
    expect(screen.getByText('Rent · 3 Sep')).toBeTruthy()
    expect(screen.UNSAFE_getAllByType(CATEGORY_ICON_COMPONENTS.House)).toHaveLength(1)
  })

  it('uses the icon a category was given over the one its name suggests', () => {
    render(
      <CategoryIconsContext.Provider value={new Map([['🐶 Pets', 'Airplane']])}>
        <CurrencyScope code="INR">
          <StoryCard story={story('new_category')} data={data} color="#000" onColor="#ffffff" />
        </CurrencyScope>
      </CategoryIconsContext.Provider>,
    )
    expect(screen.getByText('Pets')).toBeTruthy()
    expect(screen.UNSAFE_getAllByType(CATEGORY_ICON_COMPONENTS.Airplane)).toHaveLength(1)
    expect(screen.UNSAFE_queryAllByType(CATEGORY_ICON_COMPONENTS.Dog)).toHaveLength(0)
  })

  it('wraps a large variant onto the copy list', () => {
    renderStory(story('your_usual', 3_000_000_001))
    expect(screen.getByText(/You logged it 14 times/)).toBeTruthy()
  })
})

describe('isKnownStory', () => {
  it('skips a story type this build has never heard of', () => {
    expect(isKnownStory({ type: 'streak' })).toBe(true)
    expect(isKnownStory({ type: 'time_travel' })).toBe(false)
    expect(isKnownStory({ type: 'constructor' })).toBe(false)
    expect(isKnownStory({ type: 'toString' })).toBe(false)
  })
})
