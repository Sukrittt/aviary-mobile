import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getWeekRecap } from '@/src/api/weekRecap'
import { getRecentExpenses } from '@/src/api/expenses'
import { LearningCard } from './LearningCard'

jest.mock('@/src/api/weekRecap', () => ({ getWeekRecap: jest.fn(), markWeekRecapSeen: jest.fn() }))
jest.mock('@/src/api/expenses', () => ({ getRecentExpenses: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  ;(getRecentExpenses as jest.Mock).mockResolvedValue({ rows: [], lastSpent: {} })
})

it('shows the day of the week and when the recap unlocks', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: false, learning: { day: 3, loggedDates: ['2026-10-01'], unlocksOn: '2026-10-08' } })
  const { findByText } = renderWithProviders(<LearningCard />)
  expect(await findByText("We're learning your habits")).toBeTruthy()
  expect(await findByText('Day 3 of 7 · your recap unlocks in 5 days')).toBeTruthy()
})

it('says tomorrow on day 7', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: false, learning: { day: 7, loggedDates: [], unlocksOn: '2026-10-08' } })
  const { findByText } = renderWithProviders(<LearningCard />)
  expect(await findByText('Day 7 of 7 · your recap unlocks tomorrow')).toBeTruthy()
})

it('ticks the days logged so far, from the local expense list', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: false, learning: { day: 3, loggedDates: ['2026-10-02'], unlocksOn: '2026-10-08' } })
  const chai = (date: string) => ({ id: date, date, item: 'Chai', amount_inr: '20', source: 'manual' })
  ;(getRecentExpenses as jest.Mock).mockResolvedValue({ rows: [chai('2026-10-01'), chai('2026-10-03'), chai('2026-10-05')], lastSpent: {} })
  const { findAllByText } = renderWithProviders(<LearningCard />)
  // 1 and 3 Oct; 5 Oct is after today (day 3), and the server's 2 Oct was since deleted.
  expect(await findAllByText('✓')).toHaveLength(2)
})

it('shows nothing outside the first week', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: false })
  const { queryByText } = renderWithProviders(<LearningCard />)
  await new Promise((r) => setTimeout(r, 0))
  expect(queryByText("We're learning your habits")).toBeNull()
})
