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

it('leads with yearly and shows what it saves', () => {
  const onBuy = jest.fn()
  const { getByText } = renderWithProviders(<PlanPicker packages={packages} unlockDate={null} busy={false} onBuy={onBuy} />)

  expect(getByText('Save 14%')).toBeTruthy()
  expect(getByText('₹33.25/month, billed yearly')).toBeTruthy()
  fireEvent.press(getByText('Subscribe yearly · ₹399'))
  expect(onBuy).toHaveBeenCalledWith(packages[1])
})

it('buys whichever plan is selected', () => {
  const onBuy = jest.fn()
  const { getByText } = renderWithProviders(<PlanPicker packages={packages} unlockDate={null} busy={false} onBuy={onBuy} />)

  fireEvent.press(getByText('Monthly'))
  fireEvent.press(getByText('Subscribe monthly · ₹39'))
  expect(onBuy).toHaveBeenCalledWith(packages[0])
})

it('shows prices during the trial but will not sell yet', () => {
  const onBuy = jest.fn()
  const { getByText } = renderWithProviders(<PlanPicker packages={packages} unlockDate="20 September 2026" busy={false} onBuy={onBuy} />)

  fireEvent.press(getByText('Available from 20 September 2026'))
  expect(onBuy).not.toHaveBeenCalled()
})

it('ticks a haptic only when the plan actually changes', () => {
  jest.mocked(Haptics.selectionAsync).mockClear()
  const { getByText } = renderWithProviders(<PlanPicker packages={packages} unlockDate={null} busy={false} onBuy={jest.fn()} />)

  fireEvent.press(getByText('Yearly'))
  expect(Haptics.selectionAsync).not.toHaveBeenCalled()
  fireEvent.press(getByText('Monthly'))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
})
