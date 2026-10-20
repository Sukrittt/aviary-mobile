import { BUDGET_ICONS, budgetIconKey } from './budgetIcons'
import { isCategoryIconKey } from './categoryIcons'

it('uses the picked icon, else the emoji a budget had before icons', () => {
  expect(budgetIconKey({ icon: 'Island', emoji: '🏠' })).toBe('Island')
  expect(budgetIconKey({ emoji: '🐦' })).toBe('Bird')
  expect(budgetIconKey({ emoji: '🏠' })).toBe('House')
  expect(budgetIconKey({ emoji: '✈️' })).toBe('Airplane')
  expect(budgetIconKey({ icon: 'NotAnIcon', emoji: '💼' })).toBe('Briefcase')
  expect(budgetIconKey({})).toBe('Wallet')
})

it('offers only icons the catalog can draw', () => {
  expect(BUDGET_ICONS.every(isCategoryIconKey)).toBe(true)
})
