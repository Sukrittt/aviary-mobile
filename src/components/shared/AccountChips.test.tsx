import { accountIconKey, accountLabel } from './AccountChips'

it('draws a legacy leading emoji as its matching icon, else the type, never the emoji', () => {
  expect(accountIconKey({ name: '🐷 Savings', type: 'bank' })).toBe('PiggyBank')
  expect(accountLabel({ name: '🐷 Savings' })).toBe('Savings')
  expect(accountIconKey({ name: 'Wallet', type: 'cash' })).toBe('Money')
  expect(accountIconKey({ name: 'HDFC', type: 'bank' })).toBe('Bank')
  expect(accountIconKey({ name: 'Amex', type: 'credit_card' })).toBe('CreditCard')
  expect(accountLabel({ name: 'Wallet' })).toBe('Wallet')
})
