import { apiFetch } from './client'
import { listIdeas, postIdea, voteIdea } from './ideas'

jest.mock('./client', () => ({ apiFetch: jest.fn() }))
const mockedApiFetch = apiFetch as jest.Mock

beforeEach(() => mockedApiFetch.mockReset())

describe('ideas api', () => {
  it('lists with sort and an optional status', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ ideas: [] }) })
    await listIdeas('new', 'planned')
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/api/ideas?sort=new&status=planned')
    await listIdeas('top', null)
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/api/ideas?sort=top')
  })

  it('posts a trimmed idea and flags rate limits with a bare message', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, status: 201 })
    await postIdea('  Split bills ', ' ')
    expect(JSON.parse(mockedApiFetch.mock.calls[0][1].body)).toEqual({ title: 'Split bills', description: '' })
    mockedApiFetch.mockResolvedValue({ ok: false, status: 429 })
    await expect(postIdea('x', '')).rejects.toThrow('rate_limited')
    mockedApiFetch.mockResolvedValue({ ok: false, status: 401 })
    await expect(postIdea('x', '')).rejects.toThrow(/^failed$/)
  })

  it('sends the vote value', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ up: 1, down: 0, score: 1, myVote: 1 }) })
    await voteIdea('abc', 0)
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/ideas/abc/vote', expect.objectContaining({ method: 'POST', body: '{"value":0}' }))
  })
})
