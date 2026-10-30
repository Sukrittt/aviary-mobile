import { accountIconKey, accountLabel, accountName } from './AccountChips'
import type { AccountRow } from '@/src/types'

it('draws a legacy leading emoji as its matching icon, else the type, never the emoji', () => {
  expect(accountIconKey({ name: '🐷 Savings', type: 'bank' })).toBe('PiggyBank')
  expect(accountLabel({ name: '🐷 Savings' })).toBe('Savings')
  expect(accountIconKey({ name: 'Wallet', type: 'cash' })).toBe('Money')
  expect(accountIconKey({ name: 'HDFC', type: 'bank' })).toBe('Bank')
  expect(accountIconKey({ name: 'Amex', type: 'credit_card' })).toBe('CreditCard')
  expect(accountLabel({ name: 'Wallet' })).toBe('Wallet')
})

it('names an account without its legacy emoji, even with no space after it', () => {
  const accounts = [{ id: 'a1', name: '💳Debit Card' }, { id: 'a2', name: 'Wallet' }] as AccountRow[]
  expect(accountName(accounts, 'a1')).toBe('Debit Card')
  expect(accountName(accounts, 'a2')).toBe('Wallet')
  expect(accountName(accounts, 'gone')).toBe('')
  expect(accountName(accounts, undefined)).toBe('')
})
