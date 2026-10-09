import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native'
import { useQuery } from '@tanstack/react-query'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getArchive, restoreArchivedItem } from '@/src/api/account'
import type { ArchivedItem } from '@/src/api/account'
import ArchiveScreen from './archive'

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}))

jest.mock('@/src/lib/netStatus', () => ({ useOnline: () => true }))

jest.mock('@/src/api/account', () => ({
  getArchive: jest.fn(),
  restoreArchivedItem: jest.fn(() => Promise.resolve()),
  purgeArchivedItem: jest.fn(() => Promise.resolve()),
}))

const mockUseQuery = useQuery as jest.Mock
const mockGetArchive = getArchive as jest.Mock
const mockRestoreArchivedItem = restoreArchivedItem as jest.Mock
const useQueryActual = jest.requireActual('@tanstack/react-query').useQuery

function archivedItem(index: number): ArchivedItem {
  const now = Date.now()
  return {
    id: `item-${index}`,
    collection: 'expenses',
    label: `Archived item ${index}`,
    deletedAt: new Date(now - index * 1_000).toISOString(),
    purgesAt: new Date(now + 6 * 86_400_000).toISOString(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

it('shows ten archived items at a time and navigates between pages', async () => {
  mockUseQuery.mockReturnValue({
    data: Array.from({ length: 11 }, (_, index) => archivedItem(index + 1)),
    isLoading: false,
  })

  const { getByLabelText, getByText, queryByText } = renderWithProviders(
    <ArchiveScreen />,
  )

  expect(getByText('Page 1 of 2')).toBeTruthy()
  expect(getByText('1–10 of 11')).toBeTruthy()
  expect(queryByText('Archived item 11')).toBeNull()

  fireEvent.press(getByLabelText('Next archive page'))

  expect(getByText('Page 2 of 2')).toBeTruthy()
  expect(getByText('11–11 of 11')).toBeTruthy()
  expect(getByText('Archived item 11')).toBeTruthy()

  fireEvent.press(getByLabelText('Previous archive page'))
  expect(getByText('Page 1 of 2')).toBeTruthy()
})

it('removes a restored row as soon as it settles, without waiting on the delayed background refetch', async () => {
  jest.useFakeTimers({ legacyFakeTimers: false })
  // Use the real useQuery/QueryClient for this test so cache writes
  // (qc.setQueryData / qc.invalidateQueries) actually drive a re-render,
  // unlike the static mockReturnValue used by the test above.
  mockUseQuery.mockImplementation((...args: Parameters<typeof useQueryActual>) =>
    useQueryActual(...args),
  )
  const items = [archivedItem(1), archivedItem(2)]
  // First call is the initial load. The second call is the refetch that
  // invalidateQueries() kicks off after restore settles — it deliberately
  // never resolves during this test, so a passing assertion below can only
  // be explained by an optimistic cache update, not by that refetch landing.
  mockGetArchive.mockResolvedValueOnce(items).mockReturnValueOnce(new Promise(() => {}))
  mockRestoreArchivedItem.mockResolvedValue(undefined)

  const { queryAllByText, getAllByText } = renderWithProviders(<ArchiveScreen />)

  // "Archived item 1" appears twice pre-restore: once in the "next to go"
  // hero summary, once in its list row.
  await waitFor(() => expect(queryAllByText('Archived item 1').length).toBe(2))

  await act(async () => {
    fireEvent.press(getAllByText('Restore')[0])
    await Promise.resolve()
    await Promise.resolve()
  })

  await act(async () => {
    jest.advanceTimersByTime(650)
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(queryAllByText('Archived item 1').length).toBe(0)
  expect(queryAllByText('Archived item 2').length).toBeGreaterThan(0)
  // The refetch triggered by invalidateQueries() is in flight but unresolved
  // (its promise never settles), proving removal came from the optimistic
  // qc.setQueryData filter, not from that refetch completing.
  expect(mockGetArchive).toHaveBeenCalledTimes(2)

  jest.useRealTimers()
})

it('long-press picks rows, restores only the picked ones, and keeps failures selected', async () => {
  mockUseQuery.mockImplementation((...args: Parameters<typeof useQueryActual>) =>
    useQueryActual(...args),
  )
  const items = [archivedItem(1), archivedItem(2), archivedItem(3)]
  mockGetArchive.mockResolvedValueOnce(items).mockReturnValue(new Promise(() => {}))
  mockRestoreArchivedItem.mockImplementation(async (_c: string, id: string) => {
    if (id === 'item-2') throw new Error('A live item with this name already exists.')
  })

  const screen = renderWithProviders(<ArchiveScreen />)
  await waitFor(() => expect(screen.queryAllByText('Archived item 1').length).toBe(2))

  // Row text appears in the hero too, so pick the list row (the last match).
  const row = (label: string) => screen.getAllByText(label).at(-1)!
  fireEvent(row('Archived item 1'), 'longPress')
  expect(screen.getByText('1 selected')).toBeTruthy()
  // Per-row buttons give way to the pick toggle.
  expect(screen.queryByText('Restore')).toBeNull()
  fireEvent.press(row('Archived item 2'))
  expect(screen.getByText('2 selected')).toBeTruthy()

  fireEvent.press(screen.getByLabelText('Restore selected'))
  expect(screen.getByText('Restore 2 items back where they were?')).toBeTruthy()
  await act(async () => {
    fireEvent.press(screen.getByText('Restore'))
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(mockRestoreArchivedItem).toHaveBeenCalledTimes(2)
  expect(mockRestoreArchivedItem).not.toHaveBeenCalledWith('expenses', 'item-3')
  await waitFor(() => expect(screen.queryAllByText('Archived item 1').length).toBe(0))
  expect(screen.getByText('1 selected')).toBeTruthy()
  expect(row('Archived item 2').parent).toBeTruthy()

  // The header's X is locked until the restore settles (120ms + 55ms per row).
  await act(() => new Promise((r) => setTimeout(r, 250)))
  fireEvent.press(screen.getByLabelText('Cancel selection'))
  expect(screen.queryByText('1 selected')).toBeNull()
  expect(screen.getAllByText('Restore').length).toBe(2)
})
