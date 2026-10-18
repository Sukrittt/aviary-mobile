import { fireEvent, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { ImportStatus } from '@/src/api/imports'
import { ImportBanner } from './ImportBanner'

const mockStatus = jest.fn()
const mockContinue = jest.fn(async (_id: string, _retry?: boolean) => ({ ok: true }))
const mockPush = jest.fn()
jest.mock('@/src/api/imports', () => ({
  getImportStatus: () => mockStatus(),
  continueImport: (id: string, retry?: boolean) => mockContinue(id, retry),
}))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))

const base = { importId: 'imp1', done: 4210, total: 11240, failed: 0, startedAt: null, finishedAt: null, leased: true }
const show = (status: ImportStatus) => {
  mockStatus.mockResolvedValue(status)
  return renderWithProviders(<ImportBanner />)
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
})

it('says nothing without an import', async () => {
  const { toJSON } = show({ status: 'none' })
  await waitFor(() => expect(mockStatus).toHaveBeenCalled())
  expect(toJSON()).toBeNull()
})

it('counts rows while the history comes in, leaving a leased pass alone', async () => {
  const { findByText } = show({ ...base, status: 'importing' })
  expect(await findByText('Bringing in your history · 4,210 of 11,240')).toBeTruthy()
  expect(await findByText('Keep using Aviary. We’ll tell you when it’s in.')).toBeTruthy()
  expect(mockContinue).not.toHaveBeenCalled()
})

it('starts the next pass when none holds the import', async () => {
  show({ ...base, status: 'importing', leased: false })
  await waitFor(() => expect(mockContinue).toHaveBeenCalledWith('imp1', undefined))
})

it('nudges toward the recurring scan when done, and remembers the tap', async () => {
  const { findByText, getByText } = show({ ...base, status: 'done', done: 11240 })
  expect(await findByText('All 11,240 spends and paydays are in')).toBeTruthy()
  expect(getByText('Want us to find your repeat payments?')).toBeTruthy()
  fireEvent.press(getByText('Find them'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/recurring-suggestions', params: { kind: 'all' } })
  await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalledWith('mc-rollover-dismissed-import-imp1', '1'))
})

it('stays gone once dismissed', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('1')
  const { queryByText } = show({ ...base, status: 'done', done: 11240 })
  await waitFor(() => expect(SecureStore.getItemAsync).toHaveBeenCalledWith('mc-rollover-dismissed-import-imp1'))
  expect(queryByText('All 11,240 spends and paydays are in')).toBeNull()
})

it('says when some rows didn’t make it in', async () => {
  const { findByText } = show({ ...base, status: 'done', done: 11240, failed: 3 })
  expect(await findByText('11,237 of 11,240 spends and paydays are in')).toBeTruthy()
})

it('throws confetti for an arrival they watched, not for a done banner they come back to', async () => {
  const queryClient = createTestQueryClient()
  mockStatus.mockResolvedValue({ ...base, status: 'done', done: 11240 })
  const { findByText, queryByTestId } = renderWithProviders(<ImportBanner />, { queryClient })
  await findByText('All 11,240 spends and paydays are in')
  expect(queryByTestId('import-confetti')).toBeNull()

  mockStatus.mockResolvedValue({ ...base, status: 'importing' })
  await queryClient.refetchQueries({ queryKey: ['import-status'] })
  await findByText(/^Bringing in your history/)
  mockStatus.mockResolvedValue({ ...base, status: 'done', done: 11240 })
  await queryClient.refetchQueries({ queryKey: ['import-status'] })
  await findByText('All 11,240 spends and paydays are in')
  expect(queryByTestId('import-confetti')).toBeTruthy()
})

it('offers a retry when it failed', async () => {
  const { findByText } = show({ ...base, status: 'failed' })
  fireEvent.press(await findByText('Try again'))
  await waitFor(() => expect(mockContinue).toHaveBeenCalledWith('imp1', true))
})
