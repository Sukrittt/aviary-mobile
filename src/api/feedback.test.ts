import { apiFetch } from './client'
import { submitFeedback } from './feedback'

jest.mock('./client', () => ({
  apiFetch: jest.fn(),
}))

jest.mock('./workos', () => ({
  deviceLabel: () => 'iPhone 15 · iOS 17.4',
}))

jest.mock('@/src/lib/analytics', () => ({
  getLastScreen: () => '/account/help',
}))

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.4.0',
  nativeBuildVersion: '42',
}))

const mockedApiFetch = apiFetch as jest.Mock

beforeEach(() => {
  mockedApiFetch.mockReset()
})

describe('submitFeedback', () => {
  it('posts type, title, description and diagnostics', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, status: 200 })
    await submitFeedback('bug', '  Balance is wrong  ', '  It happened after a move  ')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'bug',
        title: 'Balance is wrong',
        description: 'It happened after a move',
        diagnostics: { appVersion: '1.4.0 (42)', device: 'iPhone 15 · iOS 17.4', screen: '/account/help' },
      }),
    })
  })

  it('rejects with a bare rate_limited message on 429', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 429 })
    await expect(submitFeedback('idea', 'title', 'description')).rejects.toThrow('rate_limited')
  })

  it('rejects with a bare failed message on other errors, never a status number', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(submitFeedback('bug', 'title', 'description')).rejects.toThrow('failed')
    try {
      await submitFeedback('bug', 'title', 'description')
    } catch (err) {
      expect((err as Error).message).not.toMatch(/: 4\d\d\b|: 5\d\d\b/)
    }
  })
})
