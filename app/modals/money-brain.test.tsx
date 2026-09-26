import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { AiAllowanceError } from '@/src/lib/aiAllowance'
import type { CaptureProposal } from '@/src/api/ai'
import MoneyBrainModal from './money-brain'

const mockPush = jest.fn()
let mockParams: Record<string, string> = {}
const mockStreamChat = jest.fn()
let mockBrief: Record<string, unknown> = {}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))
jest.mock('@/src/hooks/useBudgets', () => ({ useBudgets: () => ({ data: [] }) }))
jest.mock('@/src/hooks/useExpenses', () => ({ useRecentExpenses: () => ({ data: [] }) }))
jest.mock('@/src/hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
jest.mock('@/src/hooks/useGroups', () => ({ useGroups: () => ({ data: [] }) }))
jest.mock('@/src/hooks/useMoneyBrief', () => ({ useMoneyBrief: () => mockBrief }))
jest.mock('@/src/hooks/useChatSessions', () => ({
  useChatSessions: () => ({ data: undefined, isLoading: false }),
  useChatSessionsCount: () => ({ data: 0 }),
}))
jest.mock('@/src/lib/netStatus', () => ({ ...jest.requireActual('@/src/lib/netStatus'), useOnline: () => true }))
jest.mock('@/src/api/systemStatus', () => ({ getSystemStatus: jest.fn(async () => ({ aiDisabled: false })) }))
jest.mock('@/src/api/ai', () => ({
  ...jest.requireActual('@/src/api/ai'),
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
  getChatSession: jest.fn(),
}))
jest.mock('@/src/components/brain/CaptureReview', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    CaptureReview: ({ proposal, sessionId }: { proposal: CaptureProposal; sessionId: string | null }) => (
      <Text>{`Review card: ${proposal.items.length} rows in ${sessionId}`}</Text>
    ),
  }
})

const proposal: CaptureProposal = {
  id: 'p1',
  items: [
    { id: 'r1', item: 'Auto', amount: 240, splitWays: 1, date: '2026-09-26', category: 'Travel', categoryConfidence: 1 },
    { id: 'r2', item: 'Lunch', amount: 150, splitWays: 1, date: '2026-09-26', category: 'Food', categoryConfidence: 1 },
  ],
  skipped: [],
  unparsed: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  mockBrief = { data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }
})

it('opens as a focused composer in capture mode, without the brief', async () => {
  mockParams = { capture: '1' }
  const utils = renderWithProviders(<MoneyBrainModal />)

  expect(await utils.findByText('Log a few spends')).toBeTruthy()
  expect(utils.getByPlaceholderText('What did you spend?')).toBeTruthy()
  expect(utils.queryByText('THIS MONTH SO FAR')).toBeNull()
})

it('still lets a user over the AI allowance log spends in capture mode', async () => {
  mockBrief = { ...mockBrief, isError: true, error: new AiAllowanceError("You've used this month's AI allowance.") }
  mockParams = { capture: '1' }
  const utils = renderWithProviders(<MoneyBrainModal />)

  expect(await utils.findByPlaceholderText('What did you spend?')).toBeTruthy()
})

it('shows the review card under the reply when the stream sends a proposal', async () => {
  mockStreamChat.mockImplementation(async (_sessionId, _messages, onDelta, _signal, onProposal) => {
    onProposal(proposal)
    onDelta("Here's what I got. Check it, then log.")
    return 's1'
  })
  mockParams = { capture: '1' }
  const utils = renderWithProviders(<MoneyBrainModal />)

  fireEvent.changeText(await utils.findByPlaceholderText('What did you spend?'), 'auto 240, lunch 150')
  await act(async () => {
    fireEvent(utils.getByPlaceholderText('What did you spend?'), 'submitEditing')
  })

  expect(await utils.findByText("Here's what I got. Check it, then log.")).toBeTruthy()
  await waitFor(() => expect(utils.getByText('Review card: 2 rows in s1')).toBeTruthy())
})

it('offers manual entry when the money brain could not read the spends', async () => {
  mockStreamChat.mockRejectedValue(new Error("I couldn't read that one. Try again, or add it with the + button."))
  const utils = renderWithProviders(<MoneyBrainModal />)

  fireEvent.changeText(await utils.findByPlaceholderText('Ask about your money…'), 'auto 240')
  await act(async () => {
    fireEvent(utils.getByPlaceholderText('Ask about your money…'), 'submitEditing')
  })

  expect(await utils.findByText("Couldn't read that one. Add it by hand?")).toBeTruthy()
  fireEvent.press(utils.getByText('Add it by hand'))
  expect(mockPush).toHaveBeenCalledWith('/modals/log-expense')
})

it('keeps the generic message for any other failure', async () => {
  mockStreamChat.mockRejectedValue(new Error('Failed to chat: 500'))
  const utils = renderWithProviders(<MoneyBrainModal />)

  fireEvent.changeText(await utils.findByPlaceholderText('Ask about your money…'), 'how much on food?')
  await act(async () => {
    fireEvent(utils.getByPlaceholderText('Ask about your money…'), 'submitEditing')
  })

  expect(await utils.findByText('Something went wrong. Try again.')).toBeTruthy()
  expect(utils.queryByText('Add it by hand')).toBeNull()
})
