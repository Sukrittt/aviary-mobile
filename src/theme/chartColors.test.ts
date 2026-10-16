import { CATEGORY_CHART_COLORS, categoryChartColor } from './chartColors'
import { lightTokens } from './tokens'

describe('categoryChartColor', () => {
  const order = ['Rent', 'Groceries', 'Fuel', 'Investments', 'Dining out', 'Emergency fund', 'Travel', 'Football', 'Gifts']
  const slots = CATEGORY_CHART_COLORS.map((key) => lightTokens[key])

  it('gives each of the first eight categories its own slot, by list position', () => {
    expect(order.slice(0, 8).map((name) => categoryChartColor(name, order, lightTokens))).toEqual(slots)
  })

  it('wraps back to the first slot past eight', () => {
    expect(categoryChartColor('Gifts', order, lightTokens)).toBe(slots[0])
  })

  it('still picks a palette colour for a key missing from the list', () => {
    const color = categoryChartColor('Other', order, lightTokens)
    expect(slots).toContain(color)
    expect(categoryChartColor('Other', order, lightTokens)).toBe(color)
  })
})
