import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { WeekRecap } from '@/src/api/weekRecap'
import { RecapDetail } from './RecapVisuals'
import { recapSlides, type RecapSlide } from './slides'

const money = (n: number) => `₹${n}`
const recap: WeekRecap = {
  startDate: '2026-09-28',
  endDate: '2026-10-04',
  totalTransactions: 6,
  totalSpent: 2800,
  daysLogged: 5,
  topCategory: { category: 'Shopping', total: 2000, pct: 71.4 },
  biggest: { item: 'Shoes', category: '🛍️ Shopping', amountInr: 2000, date: '2026-10-03' },
  repeats: [{ item: 'Chai', category: 'Food', count: 3 }, { item: 'Uber', category: 'Transport', count: 2 }],
  usualMinute: 1260,
  loggedDates: ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-02', '2026-10-03'],
  logMinutes: [550, 1260, 1265],
  categories: [{ category: 'Shopping', total: 2000, pct: 71.4 }, { category: 'Transport', total: 550, pct: 19.6 }],
}

const slide = (kind: RecapSlide['kind']) => recapSlides(recap, money).find((s) => s.kind === kind)!
const detail = (kind: RecapSlide['kind'], r: WeekRecap = recap) => renderWithProviders(<RecapDetail slide={slide(kind)} recap={r} money={money} />)

it('ticks the days they logged, labelled by weekday from the start date', () => {
  const { getAllByText } = detail('intro')
  // 2026-09-28 is a Monday: M T W T F S S, with 5 of 7 logged.
  expect(getAllByText('✓')).toHaveLength(5)
  expect(getAllByText('M')).toHaveLength(1)
  expect(getAllByText('S')).toHaveLength(2)
})

it('hides the day dots on an older server without loggedDates', () => {
  const { queryAllByText } = detail('intro', { ...recap, loggedDates: undefined })
  expect(queryAllByText('✓')).toHaveLength(0)
})

it('stamps each repeat item with its count', () => {
  const { getByText } = detail('regulars')
  expect(getByText('Chai')).toBeTruthy()
  expect(getByText('×3')).toBeTruthy()
  expect(getByText('×2')).toBeTruthy()
})

it('labels the logging-hour arc midnight to midnight', () => {
  const { getAllByText, getByText } = detail('hour')
  expect(getAllByText('12am')).toHaveLength(2)
  expect(getByText('noon')).toBeTruthy()
})

it('splits the week into top categories and everything else', () => {
  const { getByText } = detail('categories')
  expect(getByText('₹2000 · 71%')).toBeTruthy()
  expect(getByText('₹550 · 20%')).toBeTruthy()
  expect(getByText('Everything else')).toBeTruthy()
  expect(getByText('₹250 · 9%')).toBeTruthy()
})

it('falls back to the top category alone on an older server', () => {
  const { getByText, queryByText } = detail('categories', { ...recap, categories: undefined })
  expect(getByText('Shopping')).toBeTruthy()
  expect(queryByText('Transport')).toBeNull()
  expect(getByText('₹800 · 29%')).toBeTruthy()
})

it('prints the biggest spend as a receipt', () => {
  const { getByText } = detail('biggest')
  expect(getByText('Shoes')).toBeTruthy()
  expect(getByText('🛍️ Shopping')).toBeTruthy()
  expect(getByText('3 Oct')).toBeTruthy()
  expect(getByText('₹2000')).toBeTruthy()
})
