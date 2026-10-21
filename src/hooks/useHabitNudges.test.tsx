import { renderHook } from '@testing-library/react-native'
import { useOwnRecentExpenses } from './useHabitNudges'

const mockRows = [
  { item: 'Coffee', created_by: null },
  { item: 'Partner coffee', created_by: 'user_b' },
  { item: 'Mine', created_by: 'user_a' },
]
jest.mock('@/src/api/accessMode', () => ({ currentUserId: () => 'user_a' }))
jest.mock('@/src/hooks/useExpenses', () => ({ useRecentExpenses: () => ({ data: mockRows }) }))
jest.mock('@/src/hooks/useBudgetSpaces', () => ({
  useBudgetSpaces: () => ({ active: { id: 'sp_home', ownerId: 'user_a', members: [{ userId: 'user_a' }, { userId: 'user_b' }] } }),
}))

it("builds habits only from this person's rows, the owner's unattributed ones included", () => {
  const { result } = renderHook(() => useOwnRecentExpenses())
  expect(result.current?.map((r) => r.item)).toEqual(['Coffee', 'Mine'])
})
