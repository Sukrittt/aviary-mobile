import { StyleSheet } from 'react-native'
import { EnvelopeGroup } from './EnvelopeGroup'
import { lightTokens as t } from '@/src/theme/tokens'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { Envelope } from '@/src/lib/envelope'

const env = (category: string, available: number) =>
  ({ category, group: 'Fun', assigned: 0, spent: 0, available, rolledOver: 0, isOverspent: available < 0, spentPct: 0, isCreditCardPayment: false }) as Envelope

const group = (envelopes: Envelope[]) =>
  renderWithProviders(
    <EnvelopeGroup
      group="Fun"
      envelopes={envelopes}
      hideAmounts={false}
      onMoveMoney={jest.fn()}
      onEditAmount={jest.fn()}
      onViewTransactions={jest.fn()}
      expanded={false}
      onToggle={jest.fn()}
    />,
  )

describe('EnvelopeGroup total', () => {
  it('shows what is left in neutral grey', () => {
    const { getByText } = group([env('Movies', 500), env('Games', 200)])
    expect(StyleSheet.flatten(getByText('₹700 left').props.style).color).toBe(t.text2)
  })

  it('says "over" in red when the group as a whole is overspent', () => {
    const { getByText } = group([env('Movies', 100), env('Games', -400)])
    expect(StyleSheet.flatten(getByText('₹300 over').props.style).color).toBe(t.pillOver)
  })
})
