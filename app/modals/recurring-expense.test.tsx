import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { suggestCategoryLLM } from '@/src/api/categoryMap'
import RecurringExpenseModal from './recurring-expense'

const mockMutation = { isPending: false, mutate: jest.fn() }
let mockParams: Record<string, string> = {}
let mockRecurring: Record<string, unknown>[] = []

jest.mock('@/src/api/categoryMap', () => ({ suggestCategoryLLM: jest.fn() }))
jest.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ name: 'Groceries' }, { name: 'Rent' }, { name: 'Eating out' }] }),
}))
jest.mock('@/src/hooks/useRecurringExpenses', () => ({
  useRecurringExpenses: () => ({ data: mockRecurring }),
  useAddRecurringExpense: () => mockMutation,
  useUpdateRecurringExpense: () => mockMutation,
  usePauseRecurringExpense: () => mockMutation,
  useResumeRecurringExpense: () => mockMutation,
  useDeleteRecurringExpense: () => mockMutation,
}))
jest.mock('@/src/hooks/useRecurringSuggestions', () => ({ useAcceptRecurringSuggestion: () => jest.fn() }))
jest.mock('@/src/components/shared/DatePicker', () => ({ DatePicker: () => null }))
jest.mock('@/src/components/shared/CategoryPickerSheet', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    CategoryPickerSheet: ({ onSelect }: { onSelect: (value: string) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onSelect('Groceries')}>
        <Text>Choose Groceries</Text>
      </Pressable>
    ),
  }
})
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

const suggest = suggestCategoryLLM as jest.Mock

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ legacyFakeTimers: false })
  mockParams = {}
  mockRecurring = []
  suggest.mockResolvedValue('')
})

afterEach(() => {
  jest.useRealTimers()
})

it('passes What is it to Pick Category and auto-selects the result', async () => {
  suggest.mockResolvedValue('Rent')
  const utils = renderWithProviders(<RecurringExpenseModal />)

  fireEvent.changeText(utils.getByPlaceholderText('e.g. Rent'), 'flat rent')
  await act(async () => {
    jest.advanceTimersByTime(300)
    await Promise.resolve()
  })

  expect(suggest).toHaveBeenCalledWith('flat rent', ['Groceries', 'Rent', 'Eating out'])
  expect(utils.getByLabelText('Category: Rent')).toBeTruthy()
})

it('does not overwrite a category selected while Pick Category is pending', async () => {
  const pending = deferred<string>()
  suggest.mockReturnValue(pending.promise)
  const utils = renderWithProviders(<RecurringExpenseModal />)

  fireEvent.changeText(utils.getByPlaceholderText('e.g. Rent'), 'weekly shop')
  await act(async () => {
    jest.advanceTimersByTime(300)
    await Promise.resolve()
  })
  fireEvent.press(utils.getByText('Choose Groceries'))
  await act(async () => pending.resolve('Rent'))

  expect(utils.getByLabelText('Category: Groceries')).toBeTruthy()
})

it('keeps a prefilled category without requesting a replacement', async () => {
  mockParams = { item: 'Apartment', category: 'Rent' }
  const utils = renderWithProviders(<RecurringExpenseModal />)

  await act(async () => {
    jest.advanceTimersByTime(300)
    await Promise.resolve()
  })

  expect(suggest).not.toHaveBeenCalled()
  expect(utils.getByLabelText('Category: Rent')).toBeTruthy()
})

it('keeps in-progress edits when the list refetches', () => {
  const row = { id: 'r1', item: 'Rent', amount_inr: '20000', frequency: 'monthly', start_date: '2026-01-01', status: 'active', category: 'Rent' }
  mockParams = { id: 'r1' }
  mockRecurring = [row]
  const utils = renderWithProviders(<RecurringExpenseModal />)

  fireEvent.changeText(utils.getByDisplayValue('20000'), '25000')
  // Refetch lands: same row, new object. Any re-render now sees it.
  mockRecurring = [{ ...row }]
  fireEvent.changeText(utils.getByDisplayValue('Rent'), 'Flat rent')

  expect(utils.getByDisplayValue('25000')).toBeTruthy()
})
