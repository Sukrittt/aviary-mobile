import { fireEvent } from '@testing-library/react-native'
import { availablePill, EnvelopeRow } from './EnvelopeRow'
import { lightTokens as t } from '@/src/theme/tokens'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { Envelope } from '@/src/lib/envelope'

const env = (spentPct: number, isOverspent = false) => ({ spentPct, isOverspent }) as Envelope

describe('availablePill', () => {
  it('follows the progress bar: green, then amber as it empties', () => {
    expect(availablePill(env(20), t)).toEqual({ color: t.pillGood, bg: t.pillGoodBg })
    expect(availablePill(env(80), t)).toEqual({ color: t.pillLow, bg: t.pillLowBg })
    expect(availablePill(env(95), t)).toEqual({ color: t.pillLow, bg: t.pillLowBg })
  })

  it('is red only when the envelope is overspent', () => {
    expect(availablePill(env(100, true), t)).toEqual({ color: t.pillOver, bg: t.pillOverBg })
  })

  it('drops the pill for an envelope spent exactly to zero', () => {
    expect(availablePill(env(100), t)).toEqual({ color: t.text3, bg: 'transparent' })
  })
})

const row = (e: Partial<Envelope>) =>
  renderWithProviders(
    <EnvelopeRow
      envelope={{ category: 'Football', group: '', assigned: 0, spent: 0, available: 0, rolledOver: 0, isOverspent: false, spentPct: 0, isCreditCardPayment: false, ...e }}
      icon="SoccerBall"
      hideAmounts={false}
      onMoveMoney={jest.fn()}
      onEditAmount={jest.fn()}
      onViewTransactions={jest.fn()}
    />,
  )

describe('EnvelopeRow', () => {
  it('drops the used percentage, since the bar already shows it', () => {
    const { queryByText, getByText } = row({ assigned: 1000, spent: 240, available: 760, spentPct: 24 })
    expect(queryByText(/Used/)).toBeNull()
    expect(getByText(/Last spent/)).toBeTruthy()
  })

  it('calls out spending with nothing assigned instead of showing a /0 and ∞', () => {
    const { getByText, queryByText } = row({ spent: 713, available: -713, isOverspent: true, spentPct: 100 })
    expect(getByText(/Not budgeted/)).toBeTruthy()
    expect(getByText(/713 spent/)).toBeTruthy()
    expect(queryByText(/∞/)).toBeNull()
    expect(queryByText(/\/₹0/)).toBeNull()
  })
})

it('taps when the row opens its sheet', () => {
  const Haptics = jest.requireActual<typeof import('expo-haptics')>('expo-haptics')
  const impact = jest.spyOn(Haptics, 'impactAsync').mockResolvedValue()
  const { getByText } = row({})
  fireEvent.press(getByText('Football'))
  expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid)
  impact.mockRestore()
})

describe('EnvelopeRow carry', () => {
  it('keeps a line only for a shortfall; what rolled in is already in Left', () => {
    const short = row({ assigned: 8000, spent: 0, available: 7450, rolledOver: -550, spentPct: 0 })
    expect(short.getByText(/short from/)).toBeTruthy()
    short.unmount()
    const ahead = row({ assigned: 12000, spent: 0, available: 14050, rolledOver: 2050, spentPct: 0 })
    expect(ahead.queryByText(/from /)).toBeNull()
    expect(ahead.getByText('₹14,050')).toBeTruthy()
  })
})
