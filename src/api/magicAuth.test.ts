import { sendMagicAuthCode, verifyMagicAuthCode, SignInFailedError } from './magicAuth'

jest.mock('./client', () => ({ BASE_URL: 'https://api.test' }))
jest.mock('./workos', () => ({ deviceLabel: () => 'test device', tokenExpiry: () => 0 }))
jest.mock('./accessMode', () => ({ persistSession: jest.fn(() => Promise.resolve()) }))

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => mockFetch.mockReset())

describe('magic auth on a network failure', () => {
  it('send throws so the screen can tell it from a bad address', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))
    await expect(sendMagicAuthCode('a@b.co')).rejects.toThrow()
  })

  it('verify throws so the screen can tell it from a wrong code', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))
    await expect(verifyMagicAuthCode('a@b.co', '123456')).rejects.toThrow()
  })

  it('gives both requests a timeout so a hung connection gives up', async () => {
    mockFetch.mockResolvedValue({ ok: false })
    await sendMagicAuthCode('a@b.co')
    await verifyMagicAuthCode('a@b.co', '123456')
    for (const [, init] of mockFetch.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('magic auth verify on a server failure', () => {
  it('keeps a rejected code a null', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    await expect(verifyMagicAuthCode('a@b.co', '123456')).resolves.toBeNull()
  })

  it("throws SignInFailedError on a 5xx, since the code was right and is now used up", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 })
    await expect(verifyMagicAuthCode('a@b.co', '123456')).rejects.toBeInstanceOf(SignInFailedError)
  })
})
