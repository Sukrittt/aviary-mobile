import { act, fireEvent } from '@testing-library/react-native'
import { availablePill, EnvelopeRow } from './EnvelopeRow'
import { lightTokens as t } from '@/src/theme/tokens'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { Envelope } from '@/src/lib/envelope'
import { weekPace } from '@/src/lib/weekly'

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
  it('adds no line for what carried; the Left pill already includes it', () => {
    const short = row({ assigned: 8000, spent: 0, available: 7450, rolledOver: -550, spentPct: 0 })
    expect(short.queryByText(/from |short/)).toBeNull()
    short.unmount()
    const ahead = row({ assigned: 12000, spent: 0, available: 14050, rolledOver: 2050, spentPct: 0 })
    expect(ahead.queryByText(/from /)).toBeNull()
    expect(ahead.getByLabelText('₹14,050')).toBeTruthy()
  })

  it('says what carried when the pill is long-pressed, then lets it go', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-11-05T10:00:00'))
    try {
      const ahead = row({ assigned: 12000, spent: 0, available: 14050, rolledOver: 2050, spentPct: 0 })
      fireEvent(ahead.getByHintText('+₹2,050 from October'), 'longPress')
      expect(ahead.getByText('+₹2,050 from October')).toBeTruthy()
      act(() => jest.advanceTimersByTime(2000))
      expect(ahead.queryByText('+₹2,050 from October')).toBeNull()
      ahead.unmount()
      const none = row({ assigned: 1000, spent: 0, available: 1000, rolledOver: 0, spentPct: 0 })
      expect(none.queryByHintText(/from/)).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('weekly row', () => {
  const days = new Array(31).fill(0)
  days[0] = 400
  days[5] = 1050
  days[12] = 880
  days[19] = 1130
  days[28] = 380
  const pace = weekPace(4121.4, days, '2026-10', 29)
  const weeklyRow = () =>
    renderWithProviders(
      <EnvelopeRow
        envelope={{ category: 'Groceries', group: '', assigned: 4121.4, spent: 3840, available: 281.4, rolledOver: 0, isOverspent: false, spentPct: 93, isCreditCardPayment: false }}
        icon="ShoppingCart"
        hideAmounts={false}
        onMoveMoney={jest.fn()}
        onEditAmount={jest.fn()}
        onViewTransactions={jest.fn()}
        pace={pace}
      />,
    )

  it('shows this week against its allowance, with a pace tick and the reset countdown', () => {
    const { getByText, getAllByTestId, queryByText } = weeklyRow()
    expect(getByText(/380.*\/.*661/)).toBeTruthy()
    expect(getByText('On track this week')).toBeTruthy()
    expect(getByText('2d left')).toBeTruthy()
    expect(getAllByTestId('progress-bar-tick')).toHaveLength(1)
    expect(queryByText(/Last spent/)).toBeNull()
  })

  it('lists the weeks so far in its sheet, with the weekly switch', () => {
    const { getByText, getByLabelText } = weeklyRow()
    fireEvent.press(getByText('Groceries'))
    expect(getByText('Week 1')).toBeTruthy()
    expect(getByText('Week 4')).toBeTruthy()
    expect(getByText('This week')).toBeTruthy()
    expect(getByText(/less than usual/)).toBeTruthy()
    expect(getByLabelText('Track Groceries weekly')).toBeTruthy()
  })
})
