import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { deleteExpense, dismissDuplicate, getDuplicates } from '@/src/api/expenses'
import DuplicatesModal from './duplicates'

jest.mock('@/src/api/expenses', () => ({
  getExpenses: jest.fn(),
  getDuplicates: jest.fn(),
  dismissDuplicate: jest.fn(),
  deleteExpense: jest.fn(),
}))

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() }),
}))

const row = (id: string, item: string, time: string) => ({
  id, version: 2, item, amount_inr: '450', timestamp: `2026-09-24T${time}`, date: '2026-09-24',
  category: 'Food', notes: '', source: 'manual', amount: '', description: '', payment_method: 'bank',
})
const PAIR = { duplicate: row('two', 'Swiggy dinner', '20:10:00'), original: row('one', 'swiggy', '20:00:00') }

beforeEach(() => jest.clearAllMocks())

it('shows the pair side by side, deletes the newer one with a saving state and a tick, then closes', async () => {
  // Fake timers: the tick holds the screen for a fixed 1100ms before closing.
  // On real timers this test raced the clock and timed out under CI load;
  // here the test decides when that beat has passed. waitFor advances them.
  jest.useFakeTimers()
  ;(getDuplicates as jest.Mock).mockResolvedValue([PAIR])
  let finish: () => void = () => {}
  ;(deleteExpense as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  const screen = renderWithProviders(<DuplicatesModal />)
  await screen.findByText('Logged twice?')
  expect(screen.getByText('swiggy')).toBeTruthy()
  expect(screen.getByText('Swiggy dinner')).toBeTruthy()

  ;(getDuplicates as jest.Mock).mockResolvedValue([])
  fireEvent.press(screen.getByText('Delete the newer one'))
  await screen.findByText('Deleting…')
  expect(deleteExpense).toHaveBeenCalledWith('two', PAIR.duplicate.timestamp, 'Swiggy dinner', 450, 2)
  finish()
  // The tick replaces the label, and the pair stays on screen through it even
  // though the refetch has already dropped it.
  await waitFor(() => expect(screen.queryByText('Deleting…')).toBeNull())
  expect(screen.getByText('Swiggy dinner')).toBeTruthy()
  expect(mockBack).not.toHaveBeenCalled()
  await act(async () => {
    jest.advanceTimersByTime(1000)
  })
  expect(mockBack).not.toHaveBeenCalled()
  await act(async () => {
    jest.advanceTimersByTime(100)
  })
  expect(mockBack).toHaveBeenCalledTimes(1)
})

afterEach(() => jest.useRealTimers())

it('keeps both by clearing the flag', async () => {
  ;(getDuplicates as jest.Mock).mockResolvedValue([PAIR])
  const screen = renderWithProviders(<DuplicatesModal />)
  fireEvent.press(await screen.findByText('Keep both'))
  await waitFor(() => expect(dismissDuplicate).toHaveBeenCalledWith('two', expect.anything()))
  expect(deleteExpense).not.toHaveBeenCalled()
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
})
