import { sendMagicAuthCode, verifyMagicAuthCode } from './magicAuth'

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
