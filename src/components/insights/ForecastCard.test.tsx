import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { Forecast } from '@/src/api/forecast'
import { ForecastCard } from './ForecastCard'
import { ForecastLine } from '../home/ForecastLine'

let mockForecast: Forecast
let mockUser: { hiddenFeatures?: string[] } = { hiddenFeatures: [] }
const mockPush = jest.fn()
jest.mock('@/src/api/forecast', () => ({ getForecast: async () => mockForecast }))
jest.mock('@/src/api/budgets', () => ({ getBudgets: async () => [] }))
jest.mock('@/src/hooks/useUser', () => ({ useUser: () => ({ data: mockUser }) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useIsFocused: () => true }))

const nextMonth = { month: '2026-11', income: 80000, spokenFor: 27919, free: 52081 }
const forecast: Forecast = {
  basis: 'history',
  daysLeft: 12,
  totalLeft: 3800,
  envelopes: [
    { category: 'Rent', available: 25000, scheduled: 25000, usualDaily: 0, projected: 0, runsOutOn: null, overspent: false },
    { category: '🍔 Food', available: 1000, scheduled: 0, usualDaily: 100, projected: -200, runsOutOn: '2026-10-30', overspent: false },
    { category: 'Gifts', available: 0, scheduled: 0, usualDaily: 0, projected: 0, runsOutOn: null, overspent: false },
  ],
  nextMonth,
}

beforeEach(() => {
  mockForecast = forecast
  mockUser = { hiddenFeatures: [] }
})

it('lists envelopes, run-outs first, then next month', async () => {
  const { findByText, getByText, queryByText } = renderWithProviders(<ForecastCard />)
  expect(await findByText('Covered till 30 Oct')).toBeTruthy()
  expect(getByText('Food')).toBeTruthy()
  expect(getByText("There's enough elsewhere to cover the gap.")).toBeTruthy()
  expect(getByText('₹25,000 in bills still to come')).toBeTruthy()
  // Nothing in it and nothing coming: left out.
  expect(queryByText('Gifts')).toBeNull()
  expect(getByText('₹27,919 is already spoken for next month')).toBeTruthy()
  expect(getByText('That leaves ₹52,081 of your ₹80,000 income.')).toBeTruthy()
})

it('says it is warming up without enough history, still showing next month', async () => {
  mockForecast = { ...forecast, basis: null, totalLeft: null, envelopes: [] }
  const { findByText, getByText } = renderWithProviders(<ForecastCard />)
  expect(await findByText("Your forecast's warming up")).toBeTruthy()
  expect(getByText('₹27,919 is already spoken for next month')).toBeTruthy()
})

it('puts the first run-out on Home, and opens Insights', async () => {
  const { findByText } = renderWithProviders(<ForecastLine />)
  fireEvent.press(await findByText('Food runs out around 30 Oct'))
  expect(mockPush).toHaveBeenCalledWith('/insights')
})

it('stays off while Insights is hidden', async () => {
  mockUser = { hiddenFeatures: ['insights'] }
  const { toJSON } = renderWithProviders(<ForecastLine />)
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  expect(toJSON()).toBeNull()
})

it('drops a forecast it already loaded once Insights is hidden', async () => {
  const queryClient = createTestQueryClient()
  const { findByText, queryByText } = renderWithProviders(<ForecastLine />, { queryClient })
  expect(await findByText('Food runs out around 30 Oct')).toBeTruthy()
  mockUser = { hiddenFeatures: ['insights'] }
  // Any refetch re-renders; the forecast's own cache is still there.
  await act(() => queryClient.invalidateQueries({ queryKey: ['budgets'] }))
  await waitFor(() => expect(queryByText('Food runs out around 30 Oct')).toBeNull())
})

it('shows the most urgent rows first and the rest on tap', async () => {
  const quiet = ['A', 'B', 'C', 'D', 'E'].map((category) => (
    { category, available: 500, scheduled: 0, usualDaily: 10, projected: 400, runsOutOn: null, overspent: false }
  ))
  mockForecast = { ...forecast, envelopes: [...quiet, forecast.envelopes[1]] }
  const { findByText, getByText, queryByText } = renderWithProviders(<ForecastCard />)
  expect(await findByText('Food')).toBeTruthy()
  expect(queryByText('E')).toBeNull()
  fireEvent.press(getByText('Show all 6'))
  expect(getByText('E')).toBeTruthy()
  fireEvent.press(getByText('Show fewer'))
  expect(queryByText('E')).toBeNull()
})

it('turns a shortfall into a top-up from another envelope', async () => {
  const { findByText } = renderWithProviders(<ForecastCard />)
  fireEvent.press(await findByText('Top up ₹200'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/modals/move-money', params: { fromCategory: '🍔 Food', amount: '200' } })
})

it('skips the reassurance when the gaps outweigh what is left', async () => {
  mockForecast = { ...forecast, totalLeft: -500 }
  const { findByText, queryByText } = renderWithProviders(<ForecastCard />)
  expect(await findByText('Top up ₹200')).toBeTruthy()
  expect(queryByText(/enough elsewhere/)).toBeNull()
})
