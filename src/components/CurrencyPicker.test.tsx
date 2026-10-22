import { render, screen, fireEvent } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { StyleSheet, Text } from 'react-native'
import { CurrencyPicker, CurrencySetting } from './CurrencyPicker'
import { CurrencyScope, useCurrency } from '@/src/context/CurrencyContext'
const mockMutate = jest.fn()
jest.mock('@/src/theme/ThemeProvider', () => ({
  useTheme: () => ({ scheme: 'dark', tokens: { cardSolid: '#0e0e0e', inputBg: '#020202' } }),
}))
jest.mock('@/src/components/shared/Modal', () => ({ BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) => visible ? children : null }))
jest.mock('@/src/hooks/useBudgetSpaces', () => ({ useBudgetSpaces: () => ({ active: null }) }))
jest.mock('@/src/hooks/useUser', () => ({ useUpdateUser: () => ({ mutate: mockMutate, isPending: false, isError: false }) }))
describe('currency picker', () => {
  beforeEach(() => mockMutate.mockClear())
  it('searches and selects by currency code', () => {
    const onChange = jest.fn()
    render(<CurrencyPicker value="INR" onChange={onChange} />)
    fireEvent.changeText(screen.getByLabelText('Search currencies'), 'USD')
    fireEvent.press(screen.getByLabelText('US Dollar, USD, $'))
    expect(onChange).toHaveBeenCalledWith('USD')
    expect(screen.queryByLabelText('Indian Rupee, INR, ₹')).toBeNull()
  })
  it('uses the Activity search background in dark mode', () => {
    render(<CurrencyPicker value="INR" onChange={jest.fn()} />)
    const style = StyleSheet.flatten(screen.getByLabelText('Search currencies').props.style)
    expect(style.backgroundColor).toBe('#0e0e0e')
    expect(style.borderRadius).toBe(100)
  })
  it('can expand its list to fill an embedded screen', () => {
    render(<CurrencyPicker value="INR" onChange={jest.fn()} fillAvailableSpace />)
    const style = StyleSheet.flatten(screen.getByTestId('currency-list').props.style)
    expect(style.flex).toBe(1)
    expect(style.maxHeight).toBeUndefined()
  })
  it('updates mounted amounts when currency changes', () => {
    function Amount() { const { formatCurrency } = useCurrency(); return <Text>{formatCurrency(500)}</Text> }
    const { rerender } = render(<CurrencyScope code="INR"><Amount /></CurrencyScope>)
    expect(screen.getByText('₹500')).toBeTruthy()
    rerender(<CurrencyScope code="AED"><Amount /></CurrencyScope>)
    expect(screen.getByText('AED 500')).toBeTruthy()
  })
  it('presents the selected currency as an actionable setting', () => {
    render(<CurrencyScope code="INR"><CurrencySetting /></CurrencyScope>)
    const setting = screen.getByRole('button', { name: 'Currency, Indian Rupee' })
    expect(screen.getByText('INR · ₹')).toBeTruthy()
    fireEvent.press(setting)
    expect(screen.getByLabelText('Selected currency, Indian Rupee, INR')).toBeTruthy()
    expect(screen.getByTestId('selected-currency-icon')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Close currency picker' }))
    expect(screen.queryByTestId('currency-sheet-close')).toBeNull()
  })
  it('closes immediately when a new currency is selected', () => {
    render(<CurrencyScope code="INR"><CurrencySetting /></CurrencyScope>)
    fireEvent.press(screen.getByRole('button', { name: 'Currency, Indian Rupee' }))
    fireEvent.changeText(screen.getByLabelText('Search currencies'), 'USD')
    fireEvent.press(screen.getByLabelText('US Dollar, USD, $'))

    expect(mockMutate).toHaveBeenCalledWith({ currencyCode: 'USD' })
    expect(screen.queryByTestId('currency-sheet-close')).toBeNull()
  })
})
