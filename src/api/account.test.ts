import { apiFetch } from './client'
import {
  getUser,
  updateUser,
  completeGuidedTour,
  syncTimezone,
  changeEmail,
  startExport,
  getExports,
  getArchive,
  restoreArchivedItem,
  purgeArchivedItem,
  restoreAccount,
} from './account'

jest.mock('./client', () => ({
  apiFetch: jest.fn(),
}))

const mockedApiFetch = apiFetch as jest.Mock

beforeEach(() => {
  mockedApiFetch.mockReset()
})

jest.mock('@/src/lib/date', () => ({ deviceTimezone: () => 'America/New_York' }))

describe('syncTimezone', () => {
  const patched = () => mockedApiFetch.mock.calls.filter(([, init]) => init?.method === 'PATCH')

  it('reports the device zone when the server has none (pre-existing accounts)', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ email: 'a@b.com' }) })
    await syncTimezone({ email: 'a@b.com', emailVerified: true })
    expect(patched()).toHaveLength(1)
    expect(JSON.parse(patched()[0][1].body)).toEqual({ timezone: 'America/New_York' })
  })

  it('updates when the traveller has moved zones', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ email: 'a@b.com' }) })
    await syncTimezone({ email: 'a@b.com', emailVerified: true, timezone: 'Asia/Kolkata' })
    expect(patched()).toHaveLength(1)
  })

  it('does nothing when the server already matches', async () => {
    await syncTimezone({ email: 'a@b.com', emailVerified: true, timezone: 'America/New_York' })
    expect(mockedApiFetch).not.toHaveBeenCalled()
  })

  it('never throws, so a failed sync cannot block launch', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(syncTimezone({ email: 'a@b.com', emailVerified: true })).resolves.toBeUndefined()
  })
})

describe('getUser / updateUser', () => {
  it('getUser returns the parsed profile', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ email: 'a@b.com', emailVerified: true }) })
    const user = await getUser()
    expect(user.email).toBe('a@b.com')
  })

  it('updateUser PATCHes the partial profile', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ email: 'a@b.com', emailVerified: true }) })
    await updateUser({ name: 'Sukrit' })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sukrit' }),
    })
  })

  it('completeGuidedTour sends a boolean intent so the server owns the timestamp', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ guidedTourCompletedAt: '2026-10-01T00:00:00.000Z' }) })
    await completeGuidedTour()
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guidedTourCompleted: true }),
    })
  })
})

describe('changeEmail', () => {
  it('surfaces a friendly message on 409 instead of the generic status text', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 409 })
    await expect(changeEmail('taken@b.com')).rejects.toThrow('That email is already in use.')
  })

  it('throws the generic status message for other failures', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(changeEmail('a@b.com')).rejects.toThrow('Failed to change email: 500')
  })

  it('returns the parsed body on success', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ email: 'a@b.com', emailVerified: false }) })
    const result = await changeEmail('a@b.com')
    expect(result).toEqual({ email: 'a@b.com', emailVerified: false })
  })
})

describe('getArchive / restoreArchivedItem / restoreAccount', () => {
  it('getArchive returns the parsed item list', async () => {
    const items = [{ id: '1', collection: 'expenses', label: 'Coffee', deletedAt: 'x', purgesAt: 'y' }]
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ items }) })
    const result = await getArchive()
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/archive')
    expect(result).toEqual(items)
  })

  it('restoreArchivedItem POSTs the collection and id', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true })
    await restoreArchivedItem('categories', 'abc123')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: 'categories', id: 'abc123' }),
    })
  })

  it('restoreArchivedItem surfaces a friendly message on a 409 collision', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 409 })
    await expect(restoreArchivedItem('categories', 'abc123')).rejects.toThrow('A live item with this name already exists.')
  })

  it('restoreArchivedItem throws the generic status message for other failures', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(restoreArchivedItem('categories', 'abc123')).rejects.toThrow('Failed to restore item: 500')
  })

  it('purgeArchivedItem DELETEs the collection and id', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true })
    await purgeArchivedItem('categories', 'abc123')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/archive', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: 'categories', id: 'abc123' }),
    })
  })

  it('purgeArchivedItem throws on failure', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 404 })
    await expect(purgeArchivedItem('categories', 'abc123')).rejects.toThrow('Failed to delete item: 404')
  })

  it('restoreAccount POSTs with no body', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true })
    await restoreAccount()
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/user/restore', { method: 'POST' })
  })

  it('restoreAccount throws on failure', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 404 })
    await expect(restoreAccount()).rejects.toThrow('Failed to restore account: 404')
  })
})

describe('startExport / getExports', () => {
  it('starts a background export and returns the pending id', async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ id: 'exp1', status: 'pending', remaining: 2 }),
    })
    const result = await startExport()
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/data/export', { method: 'POST' })
    expect(result).toEqual({ id: 'exp1', status: 'pending', remaining: 2 })
  })

  it('throws a distinct "quota_exceeded" error on 429', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 429 })
    await expect(startExport()).rejects.toThrow('quota_exceeded')
  })

  it('throws the generic status message for other failures', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(startExport()).rejects.toThrow('Failed to start export: 500')
  })

  it('getExports returns the parsed list plus quota usage', async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ exports: [], usedThisMonth: 1, limit: 3 }),
    })
    const result = await getExports()
    expect(result).toEqual({ exports: [], usedThisMonth: 1, limit: 3 })
  })
})
