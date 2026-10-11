import { apiFetch } from './client'
import { getExpenses, addExpense, updateExpense, deleteExpense, uploadExpensePhoto, getExpensePhotoUrl, deleteExpensePhoto } from './expenses'

jest.mock('./client', () => ({
  apiFetch: jest.fn(),
  HttpError: class HttpError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

const mockedApiFetch = apiFetch as jest.Mock

beforeEach(() => {
  mockedApiFetch.mockReset()
})

describe('getExpenses', () => {
  it('unwraps rows from the CSV response', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ headers: [], rows: [{ item: 'Coffee' }] }) })
    const rows = await getExpenses()
    expect(rows).toEqual([{ item: 'Coffee' }])
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/expenses')
  })

  it('throws with the status on a failed response', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(getExpenses()).rejects.toThrow('Failed to load expenses: 500')
  })
})

describe('addExpense', () => {
  it('POSTs the row with a minted client_id, date and timestamp', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    await addExpense({ item: 'Coffee', amount_inr: '150', category: 'Food' })

    expect(mockedApiFetch).toHaveBeenCalledTimes(1)
    const [path, init] = mockedApiFetch.mock.calls[0]
    expect(path).toBe('/api/expenses')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ item: 'Coffee', amount_inr: '150', category: 'Food' })
    expect(typeof body.client_id).toBe('string')
    expect(body.client_id.length).toBeGreaterThan(0)
    expect(body.date).toEqual(expect.any(String))
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
  })

  it('keeps a client_id the caller already named, and passes the source through', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    await addExpense({ item: 'Auto', amount_inr: '240', category: 'Travel', source: 'text', client_id: 'capture:p1:r1' })

    const body = JSON.parse(mockedApiFetch.mock.calls[0][1].body)
    expect(body.client_id).toBe('capture:p1:r1')
    expect(body.source).toBe('text')
  })

  it('throws an HttpError carrying the status on a failed response', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(addExpense({ item: 'Coffee', amount_inr: '150', category: 'Food' })).rejects.toMatchObject({
      status: 500,
    })
  })
})

describe('updateExpense', () => {
  it('reads {error} from the response body on failure', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Amount required' }) })
    await expect(updateExpense('id1', 'ts', 'Coffee', 150, {})).rejects.toThrow('Amount required')
  })

  it('falls back to a generic message when the body has no error field', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) })
    await expect(updateExpense('id1', 'ts', 'Coffee', 150, {})).rejects.toThrow('Failed to update expense: 400')
  })
})

describe('deleteExpense', () => {
  it('DELETEs with the identifying fields', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true })
    await deleteExpense('id1', 'ts', 'Coffee', 150)
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/expenses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'id1', timestamp: 'ts', item: 'Coffee', amount_inr: '150' }),
    }, undefined)
  })
})


describe('expense write versions', () => {
  it('sends the loaded version with updates', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true })
    await updateExpense('id1', 'ts', 'Coffee', 150, { category: 'Travel' }, 7)
    expect(JSON.parse(mockedApiFetch.mock.calls[0][1].body)).toMatchObject({ version: 7, category: 'Travel' })
  })
  it('preserves the latest record on a conflict for review', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'Changed elsewhere', current: { id: 'id1', version: 8, amount_inr: '200' } }) })
    await expect(updateExpense('id1', 'ts', 'Coffee', 150, { category: 'Travel' }, 7)).rejects.toMatchObject({ status: 409, current: { version: 8, amount_inr: '200' } })
  })
  it('sends the loaded version with deletes', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true })
    await deleteExpense('id1', 'ts', 'Coffee', 150, 7)
    expect(JSON.parse(mockedApiFetch.mock.calls[0][1].body).version).toBe(7)
  })
})

describe('expense photo', () => {
  it('POSTs raw base64 and the mime type, resolving with the url', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, url: 'https://signed/1' }) })
    await expect(uploadExpensePhoto('e1', 'QUJD', 'image/jpeg')).resolves.toBe('https://signed/1')
    const [path, init] = mockedApiFetch.mock.calls[0]
    expect(path).toBe('/api/expenses/e1/photo')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ image: 'QUJD', mimeType: 'image/jpeg' })
  })

  it('throws an HttpError with the status when the upload is rejected', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 413 })
    await expect(uploadExpensePhoto('e1', 'QUJD', 'image/jpeg')).rejects.toMatchObject({ status: 413 })
  })

  it('GETs the signed url, or null when there is none', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: 'https://signed/2' }) })
    await expect(getExpensePhotoUrl('e1')).resolves.toBe('https://signed/2')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/expenses/e1/photo')
    mockedApiFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    await expect(getExpensePhotoUrl('e1')).resolves.toBeNull()
  })

  it('DELETEs the photo', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    await deleteExpensePhoto('e1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/expenses/e1/photo', { method: 'DELETE' })
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(deleteExpensePhoto('e1')).rejects.toMatchObject({ status: 500 })
  })
})
