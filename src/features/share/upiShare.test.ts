import { looksLogged, parseUpiText } from './upiShare'
import type { ExpenseRow } from '@/src/types'

describe('parseUpiText', () => {
  it.each([
    // Google Pay
    ['Paid ₹250.00 to Ramesh Kumar\nUPI transaction ID: 412345678901\nGoogle Pay', { amount: 250, payee: 'Ramesh Kumar', ref: '412345678901' }],
    ['Paid to Anita Sharma ₹1,499', { amount: 1499, payee: 'Anita Sharma' }],
    // PhonePe
    ['₹1,200 paid to Swiggy successfully via PhonePe. UPI Ref No. 312345678901', { amount: 1200, payee: 'Swiggy', ref: '312345678901' }],
    ['Payment of Rs 99.50 to Zomato is successful', { amount: 99.5, payee: 'Zomato' }],
    // Paytm
    ['Rs. 85 paid to CHAI POINT using Paytm UPI', { amount: 85, payee: 'CHAI POINT' }],
    ['Paid Rs.40 to Metro Card Recharge on 21 Oct, 10:42 AM. UTR: 529912345678', { amount: 40, payee: 'Metro Card Recharge', ref: '529912345678' }],
  ])('reads %j', (text, expected) => {
    expect(parseUpiText(text)).toEqual(expected)
  })

  it('keeps the amount when there is no payee', () => {
    expect(parseUpiText('Payment successful ₹300')).toEqual({ amount: 300, payee: '' })
  })

  it('gives up without an amount', () => {
    expect(parseUpiText('Check out this link https://example.com')).toBeNull()
    expect(parseUpiText('Paid ₹0 to X')).toBeNull()
  })
})

describe('looksLogged', () => {
  const now = Date.parse('2026-10-21T10:00:00Z')
  const row = (over: Partial<ExpenseRow>): ExpenseRow =>
    ({ timestamp: '2026-10-21T09:57:00Z', date: '2026-10-21', item: 'Swiggy', amount_inr: '1200', category: '', notes: '', source: '', amount: '1200', description: '', payment_method: 'bank', ...over }) as ExpenseRow

  it('catches the same amount and payee a few minutes ago', () => {
    expect(looksLogged([row({ item: '  swiggy ' })], { amount: 1200, payee: 'Swiggy' }, now)).toBe(true)
  })

  it('lets the same payee through once it is a while ago, or a different amount', () => {
    expect(looksLogged([row({ timestamp: '2026-10-21T09:30:00Z' })], { amount: 1200, payee: 'Swiggy' }, now)).toBe(false)
    expect(looksLogged([row({})], { amount: 1201, payee: 'Swiggy' }, now)).toBe(false)
  })

  it('catches the same UPI reference however long ago', () => {
    expect(looksLogged([row({ item: 'Lunch', timestamp: '2026-10-01T09:00:00Z', notes: 'UPI ref 312345678901' })], { amount: 1200, payee: 'Swiggy', ref: '312345678901' }, now)).toBe(true)
  })

  it('needs a payee to match on amount alone', () => {
    expect(looksLogged([row({ item: '' })], { amount: 1200, payee: '' }, now)).toBe(false)
  })
})
