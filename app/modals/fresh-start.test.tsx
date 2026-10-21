import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import FreshStartScreen from './fresh-start'

const mockMutate = jest.fn()
jest.mock('@/src/hooks/useExpenses', () => ({ useAddExpense: () => ({ mutateAsync: mockMutate }) }))
jest.mock('@/src/lib/date', () => ({ ...jest.requireActual('@/src/lib/date'), todayLocal: () => '2026-10-19' }))
jest.mock('@/src/components/shared/CategoryPickerSheet', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    CategoryPickerSheet: ({ visible, onSelect }: { visible: boolean; onSelect: (c: string) => void }) =>
      visible ? (
        <>
          <Pressable onPress={() => onSelect('Food')}><Text>pick-food</Text></Pressable>
          <Pressable onPress={() => onSelect('Travel')}><Text>pick-travel</Text></Pressable>
        </>
      ) : null,
  }
})
const mockBack = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }), useLocalSearchParams: () => ({ since: '2026-10-15' }) }))

beforeEach(() => {
  jest.clearAllMocks()
  mockMutate.mockResolvedValue({})
})

it('logs one Untracked spending today, keyed by the gap', async () => {
  const screen = renderWithProviders(<FreshStartScreen />)
  fireEvent.changeText(screen.getByLabelText('Rough total'), '3500')
  fireEvent.press(screen.getByLabelText('Pick a category'))
  fireEvent.press(screen.getByText('pick-food'))
  fireEvent.press(screen.getByText('Log it'))
  await waitFor(() => expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({
    item: 'Untracked spending', amount_inr: '3500', category: 'Food', date: '2026-10-19', source: 'fresh_start', client_id: 'fresh:2026-10-15',
  })))
})

it('can split the rough total across categories, one expense each, keeping what was typed', async () => {
  const screen = renderWithProviders(<FreshStartScreen />)
  fireEvent.changeText(screen.getByLabelText('Rough total'), '2000')
  fireEvent.press(screen.getByLabelText('Pick a category'))
  fireEvent.press(screen.getByText('pick-food'))
  fireEvent.press(screen.getByText('Split across categories'))
  expect(screen.getByLabelText('Rough amount for Food').props.value).toBe('2000')
  fireEvent.press(screen.getByText('Add another category'))
  fireEvent.press(screen.getByText('pick-travel'))
  fireEvent.changeText(screen.getByLabelText('Rough amount for Travel'), '800')
  fireEvent.press(screen.getByText('Log 2 expenses'))
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2))
  expect(mockMutate.mock.calls.map(([e]) => [e.category, e.amount_inr, e.client_id])).toEqual([
    ['Food', '2000', 'fresh:2026-10-15:Food'],
    ['Travel', '800', 'fresh:2026-10-15:Travel'],
  ])
})

it('"No idea" closes without logging', () => {
  const screen = renderWithProviders(<FreshStartScreen />)
  fireEvent.press(screen.getByText('No idea'))
  expect(mockBack).toHaveBeenCalled()
  expect(mockMutate).not.toHaveBeenCalled()
})

it('does not close whatever is underneath if it was already dismissed during the tick', async () => {
  jest.useFakeTimers()
  const screen = renderWithProviders(<FreshStartScreen />)
  fireEvent.changeText(screen.getByLabelText('Rough total'), '500')
  fireEvent.press(screen.getByLabelText('Pick a category'))
  fireEvent.press(screen.getByText('pick-food'))
  fireEvent.press(screen.getByText('Log it'))
  await waitFor(() => expect(mockMutate).toHaveBeenCalled())
  screen.unmount()
  await act(async () => { jest.advanceTimersByTime(2000) })
  expect(mockBack).not.toHaveBeenCalled()
  jest.useRealTimers()
})
