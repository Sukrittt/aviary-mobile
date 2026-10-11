import { Share } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { clearTransactions, getExports, startExport, type ExportsResponse } from '@/src/api/account'
import { clearAll, listUnsynced } from '@/src/lib/pendingExpenses'
import DataScreen from './data'

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }))
jest.mock('@/src/lib/netStatus', () => ({ useOnline: () => true, onOnlineTransition: () => () => {} }))
jest.mock('@/src/lib/analytics', () => ({ isAnalyticsEnabled: true, setAnalyticsEnabled: jest.fn() }))

jest.mock('@/src/api/account', () => ({
  getExports: jest.fn(),
  startExport: jest.fn(() => Promise.resolve({ id: 'e1', status: 'pending', remaining: 0 })),
  getExportDownloadUrl: jest.fn(),
  clearTransactions: jest.fn(),
}))

jest.mock('@/src/lib/pendingExpenses', () => ({
  ...jest.requireActual('@/src/lib/pendingExpenses'),
  listUnsynced: jest.fn(() => Promise.resolve([])),
  clearAll: jest.fn(() => Promise.resolve()),
}))

const mockGetExports = getExports as jest.Mock
const mockStartExport = startExport as jest.Mock
const mockListUnsynced = listUnsynced as jest.Mock

function exportsResponse(over: Partial<ExportsResponse> = {}): ExportsResponse {
  return {
    exports: [],
    usedThisMonth: 0,
    limit: 3,
    canExport: true,
    exitExport: false,
    accessExpired: false,
    ...over,
  }
}

function queued(clientId: string, item: string) {
  return {
    payload: { client_id: clientId, item, amount_inr: '150', category: 'Food', date: '2026-10-01', timestamp: '2026-10-01T10:00:00+05:30' },
    attempts: 0,
  }
}

/** The card's heading and its button share the word — the button is the last one. */
function exportButton(matches: unknown[]) {
  return matches[matches.length - 1] as Parameters<typeof fireEvent.press>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetExports.mockResolvedValue(exportsResponse())
  mockListUnsynced.mockResolvedValue([])
})

describe('export quota', () => {
  it('blocks the button and says so when the server refuses another export', async () => {
    mockGetExports.mockResolvedValue(exportsResponse({ usedThisMonth: 3, canExport: false }))
    const { getAllByText, findByText } = renderWithProviders(<DataScreen />)

    await findByText(/You've used all 3 exports this month/)
    fireEvent.press(exportButton(getAllByText('Export')))
    expect(mockStartExport).not.toHaveBeenCalled()
  })

  // The trap this whole change exists to close: quota spent, access gone, and
  // the user still has to be able to leave with their data.
  it('still offers the export to a lapsed account with its quota spent', async () => {
    mockGetExports.mockResolvedValue(
      exportsResponse({ usedThisMonth: 3, canExport: true, exitExport: true, accessExpired: true }),
    )
    const { getAllByText, findByText, queryByText } = renderWithProviders(<DataScreen />)

    await findByText(/This is your final export/)
    expect(queryByText(/You've used all 3 exports this month/)).toBeNull()
    fireEvent.press(exportButton(getAllByText('Export')))
    await waitFor(() => expect(mockStartExport).toHaveBeenCalled())
  })

  it('keeps the count capped and hides the monthly-limit warning after the final expired-account export', async () => {
    mockGetExports.mockResolvedValue(
      exportsResponse({ usedThisMonth: 4, canExport: false, exitExport: false, accessExpired: true }),
    )
    const { getAllByText, findByText, queryByText } = renderWithProviders(<DataScreen />)

    await findByText(/3 of 3 exports used/)
    expect(queryByText(/You've used all 3 exports this month/)).toBeNull()
    fireEvent.press(exportButton(getAllByText('Export')))
    expect(mockStartExport).not.toHaveBeenCalled()
  })
})

describe('unsynced expenses', () => {
  it('says nothing when the queue is empty', async () => {
    const { findByText, queryByText } = renderWithProviders(<DataScreen />)

    await findByText(/0 of 3 exports used/)
    expect(queryByText('Not synced yet')).toBeNull()
  })

  // These live only on the phone until they sync, and an expired account's
  // queue cannot sync at all — the server-built export can never contain them.
  it('offers the queue as CSV, counting the entries the export is missing', async () => {
    mockListUnsynced.mockResolvedValue([queued('c1', 'Chai'), queued('c2', 'Samosa')])
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never)
    const { getByText, findByText } = renderWithProviders(<DataScreen />)

    await findByText(/2 expenses on this phone haven't reached your account/)
    fireEvent.press(getByText('Share as CSV'))

    const { message } = shareSpy.mock.calls[0][0] as { message: string }
    expect(message).toContain('"Chai"')
    expect(message).toContain('"Samosa"')
    expect(message.split('\n')).toHaveLength(3) // header + both entries
  })
})

describe('clear all transactions', () => {
  async function clear() {
    const { getAllByText, getByText, findByText } = renderWithProviders(<DataScreen />)
    await findByText(/0 of 3 exports used/)
    fireEvent.press(getAllByText('Clear all transactions')[0])
    fireEvent.press(getByText('Clear'))
  }

  // Otherwise the next flush POSTs the queue and the cleared rows come back.
  it('empties the offline queue once the server has cleared', async () => {
    ;(clearTransactions as jest.Mock).mockResolvedValue(undefined)
    await clear()
    await waitFor(() => expect(clearAll).toHaveBeenCalled())
  })

  it('keeps the offline queue when the server clear fails', async () => {
    ;(clearTransactions as jest.Mock).mockRejectedValue(new Error('503'))
    await clear()
    await waitFor(() => expect(clearTransactions).toHaveBeenCalled())
    expect(clearAll).not.toHaveBeenCalled()
  })
})
