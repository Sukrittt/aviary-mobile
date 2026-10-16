import { QueryClient } from '@tanstack/react-query'
import { invalidateExpenseCreateQueries } from './expenseQueries'

function invalidated(user: object | undefined): unknown[] {
  const qc = new QueryClient()
  if (user) qc.setQueryData(['user'], user)
  const spy = jest.spyOn(qc, 'invalidateQueries')
  void invalidateExpenseCreateQueries(qc)
  return spy.mock.calls.map(([filters]) => filters?.queryKey)
}

it('refreshes the profile until the first hand-logged expense is on it', () => {
  expect(invalidated(undefined)).toContainEqual(['user'])
  expect(invalidated({ manualTransactionCompletedAt: null })).toContainEqual(['user'])
})

it('stops refetching the profile once it already shows a logged expense', () => {
  const keys = invalidated({ manualTransactionCompletedAt: '2026-10-01T00:00:00.000Z' })
  expect(keys).not.toContainEqual(['user'])
  expect(keys).toEqual([['expenses'], ['budgets'], ['ai-brief'], ['category-map']])
})
