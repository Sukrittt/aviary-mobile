import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { ACK_PHRASES } from '@/src/lib/captureAck'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { AiAllowanceError } from '@/src/lib/aiAllowance'
import { getChatSession, type CaptureProposal, type streamChat } from '@/src/api/ai'
import MoneyBrainModal from './money-brain'

const mockPush = jest.fn()
const mockDismissTo = jest.fn()
let mockParams: Record<string, string> = {}
const mockStreamChat = jest.fn()
const mockUpdateProposalStatus = jest.fn().mockResolvedValue(null)
let mockBrief: Record<string, unknown> = {}
let mockSessions: unknown = undefined

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
  useChatSessions: () => ({ data: mockSessions, isLoading: false }),
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
  mockSessions = undefined
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

  // The card reports its outcome; Ask Aviary's line lands right under it at once,
  // and the chat records both against this session's proposal.
  fireEvent.press(utils.getByText('Review card: 2 rows'))
  const reply = mockUpdateProposalStatus.mock.calls[0][4]
  expect(ACK_PHRASES).toContain(reply)
  expect(mockUpdateProposalStatus).toHaveBeenCalledWith('s1', 'p1', 'submitted', ['e1', 'e2'], reply)
  expect(utils.getByText(reply)).toBeTruthy()
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
  const reply = mockUpdateProposalStatus.mock.calls[0][4]
  expect(mockUpdateProposalStatus).toHaveBeenCalledWith('s9', 'p1', 'submitted', ['e1', 'e2'], reply)
  await act(async () => {
    jest.advanceTimersByTime(700)
  })
  expect(mockUpdateProposalStatus).toHaveBeenCalledTimes(2)
  // The line was already on screen, without waiting on the server.
  expect(utils.getByText(reply)).toBeTruthy()
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


type ChatCall = {
  delta: Parameters<typeof streamChat>[2]
  proposal: NonNullable<Parameters<typeof streamChat>[4]>
  signal: AbortSignal
  resolve: (id: string) => void
  reject: (error: Error) => void
}

function holdStreams() {
  const calls: ChatCall[] = []
  mockStreamChat.mockImplementation((_session, _messages, delta, signal, onProposal) =>
    new Promise<string>((resolve, reject) => calls.push({ delta, proposal: onProposal, signal, resolve, reject })),
  )
  return calls
}

async function sendQuestion(utils: ReturnType<typeof renderWithProviders>, text: string) {
  const input = await utils.findByPlaceholderText('Ask about your money…')
  fireEvent.changeText(input, text)
  await act(async () => { fireEvent(input, 'submitEditing') })
}

it.each(['abort-error', 'late-success', 'late-callbacks'])('keeps the new conversation intact after %s from an old stream', async (lateEvent) => {
  const calls = holdStreams()
  const utils = renderWithProviders(<MoneyBrainModal />)
  await sendQuestion(utils, 'Old question')
  fireEvent.press(utils.getByText('New'))
  expect(calls[0].signal.aborted).toBe(true)
  await sendQuestion(utils, 'New question')
  await act(async () => { calls[1].delta('New reply'); calls[1].proposal({ ...proposal, id: 'new-proposal' }) })
  fireEvent.press(utils.getByText('Review card: 2 rows'))
  expect(mockUpdateProposalStatus).not.toHaveBeenCalled()

  await act(async () => {
    if (lateEvent === 'abort-error') {
      const error = new Error('Aborted'); error.name = 'AbortError'; calls[0].reject(error)
    } else {
      if (lateEvent === 'late-callbacks') { calls[0].delta('Stale delta'); calls[0].proposal({ ...proposal, id: 'old-proposal', items: [proposal.items[0]] }) }
      calls[0].resolve('old-session')
    }
  })
  expect(utils.getByText('New reply')).toBeTruthy()
  expect(utils.queryByText('Stale delta')).toBeNull()
  expect(utils.queryByText('Review card: 1 rows')).toBeNull()
  expect(utils.queryByText('Something went wrong. Try again.')).toBeNull()
  expect(mockUpdateProposalStatus).not.toHaveBeenCalled()
  // The old finally must not unlock Send or consume the new proposal's settlement.
  await sendQuestion(utils, 'While still streaming')
  expect(calls).toHaveLength(2)
  await act(async () => { calls[1].resolve('new-session') })
  expect(mockUpdateProposalStatus).toHaveBeenCalledWith('new-session', 'new-proposal', 'submitted', ['e1', 'e2'], expect.any(String))
  await sendQuestion(utils, 'Follow up')
  expect(mockStreamChat.mock.calls[2][0]).toBe('new-session')
  await act(async () => { calls[2].resolve('new-session') })
})

it('ignores delayed callbacks and errors after New, before any new message exists', async () => {
  const calls = holdStreams()
  const utils = renderWithProviders(<MoneyBrainModal />)
  await sendQuestion(utils, 'Old question')
  fireEvent.press(utils.getByText('New'))
  await act(async () => { calls[0].delta('Stale'); calls[0].proposal(proposal); calls[0].reject(new Error('aborted')) })
  expect(utils.queryByText('Stale')).toBeNull()
  expect(utils.queryByText('Review card: 2 rows')).toBeNull()
  expect(utils.queryByText('Something went wrong. Try again.')).toBeNull()
  await sendQuestion(utils, 'Fresh question')
  expect(mockStreamChat.mock.calls[1][0]).toBeNull()
  await act(async () => { calls[1].resolve('fresh-session') })
})

it('keeps current deltas on the reply when a mid-stream capture settlement appends an acknowledgement', async () => {
  const calls = holdStreams()
  const utils = renderWithProviders(<MoneyBrainModal />)
  await sendQuestion(utils, 'Log lunch')
  await act(async () => { calls[0].proposal(proposal); calls[0].delta('Part one') })
  fireEvent.press(utils.getByText('Review card: 2 rows'))
  const ack = ACK_PHRASES.find((text) => utils.queryByText(text))!
  expect(ack).toBeDefined()
  await act(async () => { calls[0].delta(' and part two'); calls[0].resolve('s1') })
  expect(utils.getByText('Part one and part two')).toBeTruthy()
  expect(utils.getByText(ack)).toBeTruthy()
  expect(mockUpdateProposalStatus).toHaveBeenCalledWith('s1', 'p1', 'submitted', ['e1', 'e2'], ack)
})

it('keeps deltas on the current reply when an older card settles mid-stream above it', async () => {
  const calls = holdStreams()
  const utils = renderWithProviders(<MoneyBrainModal />)
  await sendQuestion(utils, 'Log lunch')
  await act(async () => { calls[0].proposal(proposal); calls[0].resolve('s1') })
  await sendQuestion(utils, 'How am I doing?')
  await act(async () => { calls[1].delta('Part one') })
  fireEvent.press(utils.getByText('Review card: 2 rows'))
  const ack = ACK_PHRASES.find((text) => utils.queryByText(text))!
  expect(ack).toBeDefined()
  await act(async () => { calls[1].delta(' and part two'); calls[1].resolve('s1') })
  expect(utils.getByText('Part one and part two')).toBeTruthy()
  expect(utils.getByText(ack)).toBeTruthy()
})

it('revokes stream ownership on unmount', async () => {
  const calls = holdStreams()
  const utils = renderWithProviders(<MoneyBrainModal />)
  await sendQuestion(utils, 'Old question')
  utils.unmount()
  expect(calls[0].signal.aborted).toBe(true)
  await act(async () => { calls[0].proposal(proposal); calls[0].delta('Stale'); calls[0].resolve('old-session') })
  expect(mockUpdateProposalStatus).not.toHaveBeenCalled()
})


it('revokes the old stream when a saved chat is opened', async () => {
  mockSessions = { sessions: [{ id: 'saved', title: 'Saved chat', updatedAt: new Date().toISOString(), preview: '', messageCount: 1 }], pageCount: 1 }
  ;(getChatSession as jest.Mock).mockResolvedValue({ id: 'saved', messages: [{ role: 'model', text: 'Saved reply' }] })
  const calls = holdStreams()
  const utils = renderWithProviders(<MoneyBrainModal />)
  await sendQuestion(utils, 'Old question')
  fireEvent.press(utils.getByText('0')) // chat history count
  await act(async () => { fireEvent.press(utils.getByText('Saved chat')) })
  expect(calls[0].signal.aborted).toBe(true)
  await act(async () => { calls[0].delta('Stale'); calls[0].resolve('old-session') })
  expect(utils.getByText('Saved reply')).toBeTruthy()
  expect(utils.queryByText('Stale')).toBeNull()
  await sendQuestion(utils, 'Saved follow up')
  expect(mockStreamChat.mock.calls[1][0]).toBe('saved')
  await act(async () => { calls[1].resolve('saved') })
})

it('ignores a saved-chat response arriving after New', async () => {
  mockSessions = { sessions: [{ id: 'saved', title: 'Saved chat', updatedAt: new Date().toISOString(), preview: '', messageCount: 1 }], pageCount: 1 }
  let finish!: (detail: unknown) => void
  ;(getChatSession as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const calls = holdStreams()
  const utils = renderWithProviders(<MoneyBrainModal />)
  await utils.findByPlaceholderText('Ask about your money…')
  fireEvent.press(utils.getByText('0'))
  fireEvent.press(utils.getByText('Saved chat'))
  fireEvent.press(utils.getByText('New'))
  await act(async () => { finish({ id: 'saved', messages: [{ role: 'model', text: 'Stale saved reply' }] }) })
  expect(utils.queryByText('Stale saved reply')).toBeNull()
  await sendQuestion(utils, 'New question')
  expect(mockStreamChat.mock.calls[0][0]).toBeNull()
  await act(async () => { calls[0].resolve('new-session') })
})
