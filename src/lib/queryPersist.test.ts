import { QueryClient } from '@tanstack/react-query'
import { shouldPersistQuery } from './queryPersist'

function persisted(queryKey: unknown[], data: unknown = { ok: true }): boolean {
  const qc = new QueryClient()
  qc.setQueryData(queryKey, data)
  return shouldPersistQuery(qc.getQueryCache().find({ queryKey, exact: true })!)
}

it('saves the data the main screens paint from', () => {
  expect(persisted(['budgets'])).toBe(true)
  expect(persisted(['expenses', 'recent', '2026-07-01'])).toBe(true)
  expect(persisted(['expenses', 'page', { page: 1, limit: 20 }])).toBe(true)
  expect(persisted(['categories'])).toBe(true)
})

it('leaves out all-time expense history, billing and system status', () => {
  expect(persisted(['expenses'])).toBe(false)
  expect(persisted(['billing-status'])).toBe(false)
  expect(persisted(['system-status'])).toBe(false)
  expect(persisted(['ai-brief'])).toBe(false)
})
