import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import ImportScreen from './import'

const mockPast = jest.fn()
const mockUndo = jest.fn()
jest.mock('@/src/api/imports', () => ({
  ...jest.requireActual('@/src/api/imports'),
  getPastImports: () => mockPast(),
  undoImport: (...a: unknown[]) => mockUndo(...a),
}))
const mockAlert = jest.fn()
jest.mock('@/src/components/ui/AlertHost', () => ({ Alert: { alert: (...a: unknown[]) => mockAlert(...a) } }))
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), dismissTo: jest.fn() }) }))
jest.mock('@/src/hooks/useBudgetSpaces', () => ({ useBudgetSpaces: () => ({ active: { name: 'Home' } }) }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/src/lib/filePicker', () => ({ canPickFiles: true, pickFile: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  mockUndo.mockResolvedValue({ ok: true })
})

it('opens on the app list, with past imports under it', async () => {
  mockPast.mockResolvedValue([
    { importId: 'a', app: 'moneymanager', status: 'done', total: 2340, done: 2340, failed: 0, committedAt: '2026-10-03T10:00:00.000Z' },
    { importId: 'b', app: 'generic', status: 'importing', total: 10, done: 2, failed: 0, committedAt: '2026-10-20T10:00:00.000Z' },
  ])
  const utils = renderWithProviders(<ImportScreen />)
  expect(utils.getByText('Where are you coming from?')).toBeTruthy()
  expect(await utils.findByText('Money Manager · 3 Oct 2026 · 2,340 entries')).toBeTruthy()
  expect(utils.getByText('Still bringing it in…')).toBeTruthy()
})

it('undoes an import only after the confirm', async () => {
  mockPast.mockResolvedValue([{ importId: 'a', app: 'ynab', status: 'done', total: 5, done: 5, failed: 0, committedAt: '2026-10-03T10:00:00.000Z' }])
  const utils = renderWithProviders(<ImportScreen />)
  fireEvent.press(await utils.findByLabelText(/^Undo import, YNAB/))
  expect(mockUndo).not.toHaveBeenCalled()
  const [title, , buttons] = mockAlert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]]
  expect(title).toBe('Undo this import?')
  await act(async () => buttons.find((b) => b.text === 'Undo import')!.onPress!())
  expect(mockUndo).toHaveBeenCalledWith('a')
})

it('says so in its own words when the undo fails', async () => {
  mockPast.mockResolvedValue([{ importId: 'a', app: 'ynab', status: 'done', total: 5, done: 5, failed: 0, committedAt: null }])
  const { ImportFailure } = jest.requireActual('@/src/api/imports')
  mockUndo.mockRejectedValue(new ImportFailure('not_owner'))
  const utils = renderWithProviders(<ImportScreen />)
  fireEvent.press(await utils.findByLabelText(/^Undo import/))
  const buttons = mockAlert.mock.calls[0][2] as { text: string; onPress?: () => void }[]
  await act(async () => buttons.find((b) => b.text === 'Undo import')!.onPress!())
  expect(mockAlert).toHaveBeenCalledWith('Couldn’t undo that import', 'Only the budget’s owner can bring history into it.')
})

it('says when past imports didn’t load, with a way to try again', async () => {
  mockPast.mockRejectedValueOnce(new Error('503')).mockResolvedValue([{ importId: 'a', app: 'ynab', status: 'done', total: 5, done: 5, failed: 0, committedAt: null }])
  const utils = renderWithProviders(<ImportScreen />)
  fireEvent.press(await utils.findByText('Try again'))
  expect(await utils.findByLabelText(/^Undo import, YNAB/)).toBeTruthy()
})
