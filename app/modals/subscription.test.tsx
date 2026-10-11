import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import SubscriptionModal from './subscription'

const mockBack = jest.fn()
const mockAccept = jest.fn()
const mockAdd = { isPending: false, mutate: jest.fn() }
const mockIdleMutation = { isPending: false, mutate: jest.fn() }
let mockParams: Record<string, string> = {}
let mockSubs: Record<string, unknown>[] = []

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}))
jest.mock('@/src/hooks/useSubscriptions', () => ({
  useSubscriptions: () => ({ data: mockSubs }),
  useAddSubscription: () => mockAdd,
  useUpdateSubscription: () => mockIdleMutation,
  useCancelSubscription: () => mockIdleMutation,
  useReactivateSubscription: () => mockIdleMutation,
  useDeleteSubscription: () => mockIdleMutation,
}))
jest.mock('@/src/hooks/useRecurringSuggestions', () => ({ useAcceptRecurringSuggestion: () => mockAccept }))
jest.mock('@/src/components/shared/DatePicker', () => ({ DatePicker: () => null }))
jest.mock('@/src/components/shared/CategoryPickerSheet', () => ({ CategoryPickerSheet: () => null }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ legacyFakeTimers: false })
  mockSubs = []
  mockParams = {
    suggestionId: 'suggestion-1',
    service: 'Netflix',
    amount: '649',
    billingCycle: 'monthly',
    nextDueDate: '2026-10-05',
    category: 'Entertainment',
    notes: '',
  }
})

afterEach(() => jest.useRealTimers())

it('submits a prefilled suggestion as a new subscription and retires it after success', () => {
  const { getAllByText, getByDisplayValue, getByText } = renderWithProviders(<SubscriptionModal />)

  expect(getByDisplayValue('Netflix')).toBeTruthy()
  expect(getByDisplayValue('649')).toBeTruthy()
  expect(getByText(/Future charges will be tracked/)).toBeTruthy()

  fireEvent.press(getAllByText('Add subscription').at(-1)!)
  expect(mockAdd.mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      suggestion_id: 'suggestion-1',
      service: 'Netflix',
      amount_inr: '649',
      billing_cycle: 'monthly',
      next_due_date: '2026-10-05',
      category: 'Entertainment',
    }),
    expect.any(Object),
  )

  act(() => mockAdd.mutate.mock.calls[0][1].onSuccess())
  expect(mockAccept).toHaveBeenCalledWith('suggestion-1')
})

it('keeps in-progress edits when the list refetches', () => {
  const row = { service: 'Netflix', amount_inr: '649', billing_cycle: 'monthly', next_due_date: '2026-10-05', status: 'active', category: 'Entertainment' }
  mockParams = { service: 'Netflix' }
  mockSubs = [row]
  const utils = renderWithProviders(<SubscriptionModal />)

  fireEvent.changeText(utils.getByDisplayValue('649'), '799')
  // Refetch lands: same row, new object. Any re-render now sees it.
  mockSubs = [{ ...row }]
  fireEvent.changeText(utils.getByDisplayValue('Netflix'), 'Netflix Premium')

  expect(utils.getByDisplayValue('799')).toBeTruthy()
})
