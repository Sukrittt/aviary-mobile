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

  it('keeps the month on Home, adds a pace tick, and says how this week is going', () => {
    const { getByText, getAllByTestId, queryByText } = weeklyRow()
    expect(getByText(/3,840.*\/.*4,121/)).toBeTruthy()
    expect(queryByText(/380.*\/.*661/)).toBeNull()
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

  it("collapses the switch's caption instead of dropping it, so the sheet eases rather than jumps", () => {
    const { getByText } = weeklyRow()
    fireEvent.press(getByText('Groceries'))
    // Still mounted when tracked: its Collapse shrinks it in step with the weeks growing.
    expect(getByText(/Split the month into weeks/)).toBeTruthy()
  })

  it('leaves out past weeks with no spending', () => {
    const quiet = new Array(31).fill(0)
    quiet[2] = 300
    quiet[28] = 100
    const { getByText, queryByText } = renderWithProviders(
      <EnvelopeRow
        envelope={{ category: 'Groceries', group: '', assigned: 4000, spent: 400, available: 3600, rolledOver: 0, isOverspent: false, spentPct: 10, isCreditCardPayment: false }}
        icon="ShoppingCart"
        hideAmounts={false}
        onMoveMoney={jest.fn()}
        onEditAmount={jest.fn()}
        onViewTransactions={jest.fn()}
        pace={weekPace(4000, quiet, '2026-10', 29)}
      />,
    )
    fireEvent.press(getByText('Groceries'))
    expect(getByText('Week 1')).toBeTruthy()
    expect(queryByText('Week 2')).toBeNull()
    expect(queryByText('Week 4')).toBeNull()
    expect(getByText('This week')).toBeTruthy()
  })
})

describe('a goal row', () => {
  const { createTestQueryClient } = jest.requireActual('@/src/test-utils/renderWithProviders')
  const { currentMonthKey, shiftMonthKey } = jest.requireActual('@/src/lib/envelope')
  const month = currentMonthKey()
  const goalRow = (goal: object, e: Partial<Envelope>, onMoveMoney = jest.fn()) => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(['categories'], [{ name: 'Trip', group: 'Goals', goal }])
    return renderWithProviders(
      <EnvelopeRow
        envelope={{ category: 'Trip', group: 'Goals', assigned: 0, spent: 0, available: 0, rolledOver: 0, isOverspent: false, spentPct: 0, isCreditCardPayment: false, ...e }}
        icon="SoccerBall" hideAmounts={false} onMoveMoney={onMoveMoney} onEditAmount={jest.fn()} onViewTransactions={jest.fn()}
      />,
      { queryClient },
    )
  }

  it('shows saved of target, and Set pulls what this month is behind by', () => {
    const onMoveMoney = jest.fn()
    // 3,000 in, 9,000 to go over this month and the next three.
    const { getByText, queryByText } = goalRow({ amount: 12000, by: shiftMonthKey(month, 3) }, { available: 3000, rolledOver: 3000 }, onMoveMoney)
    expect(getByText('₹3,000 of ₹12,000')).toBeTruthy()
    expect(queryByText(/Last spent/)).toBeNull()
    fireEvent.press(getByText('Set ₹2,250/mo'))
    expect(onMoveMoney).toHaveBeenCalledWith('Trip', 2250)
  })

  it('offers a repeat or a way back to spending once its month is done', () => {
    const { getByText } = goalRow({ amount: 5000, by: month }, { assigned: 0, available: 1000, spent: 4000, rolledOver: 5000 })
    expect(getByText('Repeat next year')).toBeTruthy()
    expect(getByText('Back to spending')).toBeTruthy()
  })

  it('trades Track weekly for Edit goal in its sheet', () => {
    const { getByText, queryByText } = goalRow({ amount: 5000 }, { available: 1000, rolledOver: 1000 })
    fireEvent.press(getByText('Trip'))
    expect(queryByText('Track weekly')).toBeNull()
    fireEvent.press(getByText('Edit goal'))
    expect(getByText('Goal for Trip')).toBeTruthy()
    expect(getByText('Back to spending')).toBeTruthy()
  })
})
