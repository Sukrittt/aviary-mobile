import { fetch as expoFetch } from 'expo/fetch'
import { apiFetch } from './client'
import { streamChat, updateProposalStatus, type CaptureProposal } from './ai'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('./client', () => ({
  apiFetch: jest.fn(),
  BASE_URL: 'https://api.example.com',
  handleUnauthorized: jest.fn(async () => {}),
}))
jest.mock('./accessMode', () => ({
  getValidToken: jest.fn(async () => 'token'),
  sessionGeneration: () => 1,
  SessionChangedError: class SessionChangedError extends Error {},
}))
jest.mock('@/src/lib/aiAllowance', () => ({ rejectIfAllowanceExceeded: jest.fn(async () => {}) }))

const mockedFetch = expoFetch as unknown as jest.Mock
const mockedApiFetch = apiFetch as jest.Mock

const proposal: CaptureProposal = {
  id: 'p1',
  items: [{ id: 'r1', item: 'Auto', amount: 240, splitWays: 1, date: '2026-09-26', category: 'Travel', categoryConfidence: 1 }],
  skipped: [],
  unparsed: [],
}

function sse(...frames: string[]) {
  const encoder = new TextEncoder()
  return {
    ok: true,
    status: 200,
    body: {
      async *[Symbol.asyncIterator]() {
        for (const frame of frames) yield encoder.encode(frame)
      },
    },
  }
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedApiFetch.mockReset()
})

describe('streamChat', () => {
  it('hands a proposal frame to onProposal and still streams the text after it', async () => {
    mockedFetch.mockResolvedValue(
      sse(
        'data: {"sessionId":"s1"}\n\n',
        `data: ${JSON.stringify({ proposal })}\n\n`,
        'data: {"delta":"Here\'s what I got."}\n\n',
        'data: [DONE]\n\n',
      ),
    )
    const onDelta = jest.fn()
    const onProposal = jest.fn()

    const sessionId = await streamChat(null, [{ role: 'user', text: 'auto 240' }], onDelta, undefined, onProposal)

    expect(sessionId).toBe('s1')
    expect(onProposal).toHaveBeenCalledWith(proposal)
    expect(onDelta).toHaveBeenCalledWith("Here's what I got.")
  })

  it('tells the server it can show a review card, and resends only role and text', async () => {
    mockedFetch.mockResolvedValue(sse('data: [DONE]\n\n'))

    await streamChat('s1', [
      { role: 'user', text: 'auto 240' },
      { role: 'model', text: "Here's what I got.", proposal },
      { role: 'user', text: 'and chai 20' },
    ], jest.fn())

    const [, init] = mockedFetch.mock.calls[0]
    expect(init.headers['X-Aviary-Capture']).toBe('1')
    expect(JSON.parse(init.body).messages).toEqual([
      { role: 'user', text: 'auto 240' },
      { role: 'model', text: "Here's what I got." },
      { role: 'user', text: 'and chai 20' },
    ])
  })

  it('ignores a malformed proposal frame', async () => {
    mockedFetch.mockResolvedValue(sse('data: {"proposal":{"id":"p1"}}\n\n', 'data: [DONE]\n\n'))
    const onProposal = jest.fn()

    await streamChat(null, [{ role: 'user', text: 'auto 240' }], jest.fn(), undefined, onProposal)

    expect(onProposal).not.toHaveBeenCalled()
  })

  it('surfaces the server error text so the screen can tell a capture failure apart', async () => {
    mockedFetch.mockResolvedValue(sse(`data: ${JSON.stringify({ error: "I couldn't read that one. Try again, or add it with the + button." })}\n\n`))

    await expect(streamChat(null, [{ role: 'user', text: 'auto 240' }], jest.fn())).rejects.toThrow(
      "I couldn't read that one. Try again, or add it with the + button.",
    )
  })
})

describe('updateProposalStatus', () => {
  it('PATCHes the status with the expense ids', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, status: 200 })

    await updateProposalStatus('s1', 'p1', 'submitted', ['e1'])

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/ai/chat/sessions/s1/proposals/p1', expect.objectContaining({ method: 'PATCH' }))
    expect(JSON.parse(mockedApiFetch.mock.calls[0][1].body)).toEqual({ status: 'submitted', expenseIds: ['e1'] })
  })

  it('leaves the ids out when there are none', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, status: 200 })
    await updateProposalStatus('s1', 'p1', 'dismissed')
    expect(JSON.parse(mockedApiFetch.mock.calls[0][1].body)).toEqual({ status: 'dismissed' })
  })

  it('treats an already-answered proposal as fine', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 409 })
    await expect(updateProposalStatus('s1', 'p1', 'submitted')).resolves.toBeUndefined()
  })

  it('throws on any other failure', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(updateProposalStatus('s1', 'p1', 'submitted')).rejects.toThrow('500')
  })
})
