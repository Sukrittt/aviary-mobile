import { sendMagicAuthCode, verifyMagicAuthCode } from './magicAuth'

jest.mock('./client', () => ({ BASE_URL: 'https://api.test' }))
jest.mock('./workos', () => ({ deviceLabel: () => 'test device', tokenExpiry: () => 0 }))
jest.mock('./accessMode', () => ({ persistSession: jest.fn(() => Promise.resolve()) }))

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => mockFetch.mockReset())

describe('magic auth on a network failure', () => {
  it('send resolves false instead of throwing', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))
    await expect(sendMagicAuthCode('a@b.co')).resolves.toBe(false)
  })

  it('verify resolves false instead of throwing', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))
    await expect(verifyMagicAuthCode('a@b.co', '123456')).resolves.toBe(false)
  })

  it('gives both requests a timeout so a hung connection gives up', async () => {
    mockFetch.mockResolvedValue({ ok: false })
    await sendMagicAuthCode('a@b.co')
    await verifyMagicAuthCode('a@b.co', '123456')
    for (const [, init] of mockFetch.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})
