import { apiFetch } from './client'
import { getCarry, transferBudget, updateBudget } from './budgets'
import { BudgetWriteError } from '@/src/lib/budgetConflict'

jest.mock('./client', () => ({
  apiFetch: jest.fn(),
  apiErrorMessage: jest.requireActual('./client').apiErrorMessage,
}))

const mockedApiFetch = apiFetch as jest.Mock

beforeEach(() => {
  mockedApiFetch.mockReset()
})

describe('transferBudget', () => {
  it('POSTs month/to/sources as JSON', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    await transferBudget('2026-03', 'Travel', [{ category: 'Dining', amount: 300 }])
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/budgets/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: '2026-03', to: 'Travel', sources: [{ category: 'Dining', amount: 300 }] }),
    })
  })

  it('throws with the status on a failed response', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 400 })
    await expect(transferBudget('2026-03', 'Travel', [{ category: 'Dining', amount: 300 }])).rejects.toThrow(
      'Failed to transfer budget: 400',
    )
  })
})

describe('updateBudget', () => {
  it('sends the revision precondition with the edit', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({ version: 5 }) })
    await updateBudget('2026-09', 'Food', { assigned: '125' }, 4)
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/budgets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: '2026-09', category: 'Food', version: 4, assigned: '125' }),
    })
  })

  it('surfaces the latest row on a conflict', async () => {
    const current = { month: '2026-09', category: 'Food', assigned: '150', rolled_over: '0', version: 5 }
    mockedApiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'changed', current }),
    })
    const write = updateBudget('2026-09', 'Food', { assigned: '125' }, 4)
    await expect(write).rejects.toBeInstanceOf(BudgetWriteError)
    await expect(write).rejects.toMatchObject({
      status: 409,
      current,
    })
  })
})

describe('getCarry', () => {
  it('reads a 404 as nothing carried in the first rollover month, so a Web deploy without the route still loads Home', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 404 })
    await expect(getCarry('2026-10')).resolves.toEqual({ ready_to_assign: 0, rolled_over: {} })
  })

  it('fails on a 404 once months really carry, rather than understating balances', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 404 })
    await expect(getCarry('2026-11')).rejects.toThrow('Failed to load carry: 404')
  })

  it('still throws on other failures', async () => {
    mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(getCarry('2026-11')).rejects.toThrow('Failed to load carry: 500')
  })
})
