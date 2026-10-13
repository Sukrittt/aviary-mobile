import { fireEvent, render, screen } from '@testing-library/react-native'
import { GetStartedCard } from './GetStartedCard'

jest.mock('@/src/theme/ThemeProvider', () => ({
  useTheme: () => ({ tokens: {}, radius: { md: 12 }, space: { xs: 4, sm: 8, md: 16 }, type: {} }),
}))

const base = {
  incomeDone: false,
  fundDone: false,
  manualTransactionDone: false,
  guidedTourDone: false,
  onFund: jest.fn(),
  onAddTransaction: jest.fn(),
  onTakeTour: jest.fn(),
  onSkip: jest.fn(),
}

describe('GetStartedCard', () => {
  it('asks for income when there is none coming', () => {
    render(<GetStartedCard {...base} onAddIncome={jest.fn()} />)
    expect(screen.getByText('Add your income')).toBeTruthy()
  })

  it('asks for what you have now when the first pay lands next month', () => {
    const onAddIncome = jest.fn()
    render(<GetStartedCard {...base} onAddIncome={onAddIncome} upcomingPayHint="Your pay lands Nov 4. Budget what you have till then." />)
    expect(screen.queryByText('Add your income')).toBeNull()
    expect(screen.getByText('Your pay lands Nov 4. Budget what you have till then.')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Add what you have now'))
    expect(onAddIncome).toHaveBeenCalled()
  })
})
