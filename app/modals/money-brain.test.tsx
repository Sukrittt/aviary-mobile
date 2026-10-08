import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { AiAllowanceError } from '@/src/lib/aiAllowance'
import type { CaptureProposal } from '@/src/api/ai'
import MoneyBrainModal from './money-brain'

const mockPush = jest.fn()
const mockDismissTo = jest.fn()
let mockParams: Record<string, string> = {}
const mockStreamChat = jest.fn()
const mockUpdateProposalStatus = jest.fn().mockResolvedValue(null)
let mockBrief: Record<string, unknown> = {}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), dismissTo: mockDismissTo }),
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
  updateProposalStatus: (...args: unknown[]) => mockUpdateProposalStatus(...args),
}))
jest.mock('@/src/components/brain/CaptureReview', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    CaptureReview: ({ proposal, onSettled }: { proposal: CaptureProposal; onSettled: (status: string, ids: string[]) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onSettled('submitted', ['e1', 'e2'])}>
        <Text>{`Review card: ${proposal.items.length} rows`}</Text>
      </Pressable>
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
  expect(utils.getByText('Dump your spends here')).toBeTruthy()
  expect(utils.getByPlaceholderText('What did you spend?')).toBeTruthy()
  expect(utils.queryByText('THIS MONTH SO FAR')).toBeNull()
  expect(utils.queryByText('New')).toBeNull()

  // An example chip fills the composer so the grammar can be read before it's sent.
  fireEvent.press(utils.getByText('turf 1200 split 6'))
  expect(utils.getByPlaceholderText('What did you spend?').props.value).toBe('turf 1200 split 6')
  expect(mockStreamChat).not.toHaveBeenCalled()
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
  await waitFor(() => expect(utils.getByText('Review card: 2 rows')).toBeTruthy())

  // The card reports its outcome; the chat records it against this session's proposal,
  // and Ask Aviary's reply to the logged rows lands right under the card.
  mockUpdateProposalStatus.mockResolvedValueOnce('Lunch and an auto, a classic day.')
  fireEvent.press(utils.getByText('Review card: 2 rows'))
  expect(mockUpdateProposalStatus).toHaveBeenCalledWith('s1', 'p1', 'submitted', ['e1', 'e2'])
  expect(await utils.findByText('Lunch and an auto, a classic day.')).toBeTruthy()
  expect(utils.getByText('2 spends logged')).toBeTruthy()
  fireEvent.press(utils.getByText('See them in Activity'))
  expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/activity')
})

it('records an outcome picked mid-stream once the chat exists, retrying while the reply saves', async () => {
  jest.useFakeTimers()
  let finish!: (id: string) => void
  mockStreamChat.mockImplementation((_sessionId, _messages, onDelta, _signal, onProposal) => {
    onProposal(proposal)
    onDelta('Got it.')
    return new Promise((resolve) => (finish = resolve))
  })
  mockUpdateProposalStatus.mockRejectedValueOnce(new Error('Failed to update proposal: 404')).mockResolvedValueOnce(null)
  mockParams = { capture: '1' }
  const utils = renderWithProviders(<MoneyBrainModal />)
  fireEvent.changeText(await utils.findByPlaceholderText('What did you spend?'), 'auto 240')
  await act(async () => {
    fireEvent(utils.getByPlaceholderText('What did you spend?'), 'submitEditing')
  })
  fireEvent.press(await utils.findByText('Review card: 2 rows'))
  expect(mockUpdateProposalStatus).not.toHaveBeenCalled()

  await act(async () => {
    finish('s9')
  })
  expect(mockUpdateProposalStatus).toHaveBeenCalledWith('s9', 'p1', 'submitted', ['e1', 'e2'])
  await act(async () => {
    jest.advanceTimersByTime(700)
  })
  expect(mockUpdateProposalStatus).toHaveBeenCalledTimes(2)
  // No reply came back, so the plain line stands in.
  expect(await utils.findByText('All set, your books are up to date.')).toBeTruthy()
  jest.useRealTimers()
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
