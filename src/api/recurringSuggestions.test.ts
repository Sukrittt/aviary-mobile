import { apiFetch } from './client'
import { recurringSuggestionErrorMessage, scanRecurringSuggestions } from './recurringSuggestions'

jest.mock('./client', () => ({
  apiFetch: jest.fn(),
  apiErrorMessage: jest.requireActual('./client').apiErrorMessage,
}))

const mockedApiFetch = apiFetch as jest.Mock
const FALLBACK = "Couldn't scan right now. Check your connection and try again."

async function scanMessage(): Promise<string> {
  try {
    await scanRecurringSuggestions(6)
  } catch (err) {
    return recurringSuggestionErrorMessage(err, FALLBACK)
  }
  throw new Error('scan resolved')
}

beforeEach(() => mockedApiFetch.mockReset())

describe('recurringSuggestionErrorMessage', () => {
  it('writes its own line for a non-JSON 503 instead of the status code', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 503, json: async () => { throw new SyntaxError('bad json') } })
    expect(await scanMessage()).toBe(FALLBACK)
  })

  it('hides server text on a 5xx', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'Jev upstream exploded' }) })
    expect(await scanMessage()).toBe(FALLBACK)
  })

  it('writes its own line for a transport failure or timeout', async () => {
    mockedApiFetch.mockRejectedValueOnce(new TypeError('Network request failed'))
    expect(await scanMessage()).toBe(FALLBACK)
    mockedApiFetch.mockRejectedValueOnce(Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }))
    expect(await scanMessage()).toBe(FALLBACK)
  })

  it("passes through the server's written 4xx lines", async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'Too many scans. Please try again later.' }) })
    expect(await scanMessage()).toBe('Too many scans. Please try again later.')
  })
})
