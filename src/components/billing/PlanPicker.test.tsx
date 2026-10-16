import { fireEvent } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import type { PurchasesPackage } from 'react-native-purchases'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { PlanPicker } from './PlanPicker'

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}))

function pkg(id: string, packageType: string, price: number, priceString: string, pricePerMonthString: string | null): PurchasesPackage {
  return { identifier: id, packageType, product: { price, priceString, pricePerMonthString } } as unknown as PurchasesPackage
}

const packages = [pkg('$rc_monthly', 'MONTHLY', 39, '₹39', '₹39'), pkg('$rc_annual', 'ANNUAL', 399, '₹399', '₹33.25')]
// Midday UTC so the calendar date is the same in any test timezone.
const trialEndsAt = '2026-11-15T12:00:00Z'
const date = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString(undefined, opts)
const dayMonth = (iso: string) => date(iso, { day: 'numeric', month: 'long' })

function benefits(canBuy = true, onBuy = jest.fn()) {
  return renderWithProviders(
    <PlanPicker packages={packages} variant="benefits" trialEndsAt={trialEndsAt} trialDaysRemaining={0} canBuy={canBuy} busy={false} onBuy={onBuy} />,
  )
}

it('leads with yearly, shows what it saves and sells it', () => {
  const onBuy = jest.fn()
  const { getByText } = benefits(true, onBuy)

  expect(getByText('Save 14%')).toBeTruthy()
  expect(getByText('₹33.25/month, billed yearly')).toBeTruthy()
  fireEvent.press(getByText('Keep Aviary · ₹399/year'))
  expect(onBuy).toHaveBeenCalledWith(packages[1])
})

it('buys whichever plan is selected', () => {
  const onBuy = jest.fn()
  const { getByText } = benefits(true, onBuy)

  fireEvent.press(getByText('Monthly'))
  fireEvent.press(getByText('Keep Aviary · ₹39/month'))
  expect(onBuy).toHaveBeenCalledWith(packages[0])
})

it('pitches the four things a plan keeps on, with an enabled button when it can sell', () => {
  const { getByText, getByRole } = benefits()

  for (const t of ['Snap a bill', 'Ask Aviary', 'Monthly Wrapped', 'Widgets + web']) expect(getByText(t)).toBeTruthy()
  expect(getByText('Keep your budget going')).toBeTruthy()
  expect(getByRole('button', { name: 'Keep Aviary · ₹399/year' })).not.toBeDisabled()
  expect(getByText('Renews through Google Play until you cancel.')).toBeTruthy()
})

it('walks the last week of the trial on real dates, with no button to press', () => {
  const onBuy = jest.fn()
  const { getByText, queryByRole, queryByText } = renderWithProviders(
    <PlanPicker packages={packages} variant="timeline" trialEndsAt={trialEndsAt} trialDaysRemaining={5} canBuy={false} busy={false} onBuy={onBuy} />,
  )

  expect(getByText('Try everything. Pay only if it sticks.')).toBeTruthy()
  expect(getByText('Today')).toBeTruthy()
  // 5 days left: the 3- and 1-day reminders are still to come, the 7-day one has gone.
  expect(getByText(`${dayMonth('2026-11-12T12:00:00Z')} · ${dayMonth('2026-11-14T12:00:00Z')}`)).toBeTruthy()
  expect(getByText(dayMonth(trialEndsAt))).toBeTruthy()
  expect(getByText(/Keep going from ₹33.25 a month/)).toBeTruthy()
  const full = date(trialEndsAt, { day: 'numeric', month: 'long', year: 'numeric' })
  expect(getByText(`You can subscribe from ${full}. We'll remind you.`)).toBeTruthy()
  expect(queryByRole('button')).toBeNull()
  expect(queryByText(/Available from/)).toBeNull()
})

it('ticks a haptic only when the plan actually changes', () => {
  jest.mocked(Haptics.selectionAsync).mockClear()
  const { getByText } = benefits()

  fireEvent.press(getByText('Yearly'))
  expect(Haptics.selectionAsync).not.toHaveBeenCalled()
  fireEvent.press(getByText('Monthly'))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
})
