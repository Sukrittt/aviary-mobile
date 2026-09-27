import { apiFetch } from './client'
import { getBalanceStatus, resolveBalanceCheck, submitBalance } from './balanceChecks'

jest.mock('./client', () => ({ apiFetch: jest.fn() }))

const mockedApiFetch = apiFetch as jest.Mock

beforeEach(() => {
  mockedApiFetch.mockReset()
})

describe('getBalanceStatus', () => {
  it('reads the status', async () => {
    const status = { due: true, open: false, expected: 48000, anchor: null, loggedPct: 92 }
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => status })
    await expect(getBalanceStatus()).resolves.toEqual(status)
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/balance-checks')
  })

  it('keeps the status in the error, so a 401 still signs the user out', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 401 })
    await expect(getBalanceStatus()).rejects.toThrow('Failed to load balance check: 401')
  })
})

describe('submitBalance', () => {
  it('posts the balance', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'c1', kind: 'baseline', balance: 50000 }) })
    await expect(submitBalance(50000)).resolves.toMatchObject({ kind: 'baseline' })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/balance-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance: 50000 }),
    })
  })

  it('throws on a failed save', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 400 })
    await expect(submitBalance(1)).rejects.toThrow('Failed to save balance: 400')
  })
})

describe('resolveBalanceCheck', () => {
  it('posts the answer to the check', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'resolved', proposal: null }) })
    await resolveBalanceCheck('c1', { cardBill: 8000, movedOut: 2500 })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/balance-checks/c1/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardBill: 8000, movedOut: 2500 }),
    })
  })

  it('throws on a failed answer', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 409 })
    await expect(resolveBalanceCheck('c1', { moneyIn: 'income' })).rejects.toThrow('Failed to resolve balance check: 409')
  })
})
