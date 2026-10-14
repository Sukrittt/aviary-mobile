import { missingFields } from './missingFields'

describe('missingFields', () => {
  it('lists every empty field in on-screen order', () => {
    expect(missingFields({ amount: '', category: '' })).toEqual(['amount', 'category'])
  })

  it('treats a zero amount as missing', () => {
    expect(missingFields({ amount: '0.', category: 'Groceries' })).toEqual(['amount'])
  })

  it('is empty for a complete form', () => {
    expect(missingFields({ amount: '450', category: 'Groceries' })).toEqual([])
  })
})
