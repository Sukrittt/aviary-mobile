import { accountEmoji, accountLabel } from './AccountChips'

it('uses a leading emoji in the name, like envelopes, else the type', () => {
  expect(accountEmoji({ name: '🐷 Savings', type: 'bank' })).toBe('🐷')
  expect(accountLabel({ name: '🐷 Savings' })).toBe('Savings')
  expect(accountEmoji({ name: 'Wallet', type: 'cash' })).toBe('💵')
  expect(accountLabel({ name: 'Wallet' })).toBe('Wallet')
})
