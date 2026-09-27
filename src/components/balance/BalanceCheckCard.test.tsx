import { act, fireEvent, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { BalanceStatus } from '@/src/api/balanceChecks'
import { BalanceCheckCard } from './BalanceCheckCard'

const mockPush = jest.fn()
const mockGetStatus = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/src/api/balanceChecks', () => ({ getBalanceStatus: () => mockGetStatus() }))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}))

const get = SecureStore.getItemAsync as jest.Mock
const set = SecureStore.setItemAsync as jest.Mock

const status = (over: Partial<BalanceStatus> = {}): BalanceStatus => ({
  due: true,
  open: false,
  expected: 48000,
  anchor: { timestamp: '2026-09-20T10:00:00+05:30', date: '2026-09-20', balance: 50000 },
  loggedPct: 92,
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  get.mockResolvedValue(null)
})

it('asks for the first check with the reason to do it', async () => {
  mockGetStatus.mockResolvedValue(status({ anchor: null, expected: null, loggedPct: null }))
  const utils = renderWithProviders(<BalanceCheckCard />)

  expect(await utils.findByText('Weekly balance check')).toBeTruthy()
  fireEvent.press(utils.getByText('Check now'))
  expect(mockPush).toHaveBeenCalledWith('/modals/balance-check')
})

it('asks again a week on, and to finish a check with an unexplained gap', async () => {
  mockGetStatus.mockResolvedValue(status())
  const weekly = renderWithProviders(<BalanceCheckCard />)
  expect(await weekly.findByText('Time for a balance check')).toBeTruthy()
  weekly.unmount()

  mockGetStatus.mockResolvedValue(status({ open: true }))
  const open = renderWithProviders(<BalanceCheckCard />)
  expect(await open.findByText('Finish your balance check')).toBeTruthy()
})

it('hides the prompt for a day with Later, leaving the meter', async () => {
  mockGetStatus.mockResolvedValue(status())
  const utils = renderWithProviders(<BalanceCheckCard />)

  await act(async () => {
    fireEvent.press(await utils.findByText('Later'))
  })

  expect(utils.queryByText('Time for a balance check')).toBeNull()
  expect(utils.getByText('92% logged at your last check')).toBeTruthy()
  expect(set).toHaveBeenCalledWith('mc-balance-check-later', expect.any(String))
  expect(Number(set.mock.calls[0][1])).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000)
})

it('stays hidden while a Later from the last day is stored', async () => {
  get.mockResolvedValue(String(Date.now() + 60_000))
  mockGetStatus.mockResolvedValue(status({ loggedPct: null }))
  const utils = renderWithProviders(<BalanceCheckCard />)

  await waitFor(() => expect(get).toHaveBeenCalled())
  await act(async () => {})
  expect(utils.toJSON()).toBeNull()
})

it('comes back once the day is up', async () => {
  get.mockResolvedValue(String(Date.now() - 1))
  mockGetStatus.mockResolvedValue(status())
  const utils = renderWithProviders(<BalanceCheckCard />)
  expect(await utils.findByText('Time for a balance check')).toBeTruthy()
})

it('shows the meter between checks, and opens a check from it', async () => {
  mockGetStatus.mockResolvedValue(status({ due: false, loggedPct: 63 }))
  const utils = renderWithProviders(<BalanceCheckCard />)

  fireEvent.press(await utils.findByLabelText('63% logged at your last check'))
  expect(mockPush).toHaveBeenCalledWith('/modals/balance-check')
})

it('shows nothing with no check due and nothing measured yet, or when the status fails', async () => {
  mockGetStatus.mockResolvedValue(status({ due: false, loggedPct: null }))
  const quiet = renderWithProviders(<BalanceCheckCard />)
  await waitFor(() => expect(mockGetStatus).toHaveBeenCalled())
  await act(async () => {})
  expect(quiet.toJSON()).toBeNull()
  quiet.unmount()

  mockGetStatus.mockRejectedValue(new Error('Failed to load balance check: 503'))
  const failed = renderWithProviders(<BalanceCheckCard />)
  await act(async () => {})
  expect(failed.toJSON()).toBeNull()
})
