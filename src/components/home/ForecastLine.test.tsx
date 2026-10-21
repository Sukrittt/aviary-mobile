import { fireEvent, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { Forecast } from '@/src/api/forecast'
import { ForecastLine } from './ForecastLine'

let mockForecast: Forecast | undefined
const mockPush = jest.fn()
jest.mock('@/src/hooks/useForecast', () => ({ useForecast: () => ({ data: mockForecast }) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))

const forecast = (runsOutOn: string | null): Forecast => ({
  basis: 'history', daysLeft: 9, totalLeft: 2400,
  envelopes: [{ category: 'Miscellaneous', available: 300, scheduled: 0, usualDaily: 40, projected: -60, runsOutOn, overspent: false }],
  nextMonth: { month: '2026-11', income: 0, spokenFor: 0, free: 0 },
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
})

it('stays off Home when nothing runs out', async () => {
  mockForecast = forecast(null)
  const { toJSON } = renderWithProviders(<ForecastLine />)
  await waitFor(() => expect(SecureStore.getItemAsync).toHaveBeenCalled())
  expect(toJSON()).toBeNull()
})

it('warns about the envelope running out, and opens Insights', async () => {
  mockForecast = forecast('2026-10-30')
  const { findByText } = renderWithProviders(<ForecastLine />)
  fireEvent.press(await findByText('Miscellaneous runs out around 30\u00a0Oct'))
  expect(mockPush).toHaveBeenCalledWith('/insights')
})

it('goes away on Okay and remembers it for that envelope and date', async () => {
  mockForecast = forecast('2026-10-30')
  const { findByText, toJSON } = renderWithProviders(<ForecastLine />)
  fireEvent.press(await findByText('Okay'))
  expect(toJSON()).toBeNull()
  await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.stringContaining('2026-10-30'), '1'))
})

it('stays hidden once dismissed', async () => {
  mockForecast = forecast('2026-10-30')
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('1')
  const { toJSON } = renderWithProviders(<ForecastLine />)
  await waitFor(() => expect(SecureStore.getItemAsync).toHaveBeenCalled())
  expect(toJSON()).toBeNull()
})
