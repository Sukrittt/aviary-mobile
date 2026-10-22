import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { SetupDone } from './SetupDone'

it('promises the first-week recap', () => {
  const { getByText } = renderWithProviders(<SetupDone income={50000} groupCount={3} categoryCount={8} onFinish={jest.fn()} />)
  expect(getByText('Your first-week recap lands in 7 days')).toBeTruthy()
})

it('says the budget is live, with the first expense and the trial as one line', () => {
  const { getByText } = renderWithProviders(
    <SetupDone income={50000} groupCount={2} categoryCount={4} firstExpense={{ amount: 250, category: 'Eating out' }} trialDays={45} onFinish={jest.fn()} />,
  )
  expect(getByText('Your first expense is in. Home opens right on it.')).toBeTruthy()
  expect(getByText('₹250 · Eating out')).toBeTruthy()
  expect(getByText('Your first 45 days are free. No card, nothing to cancel.')).toBeTruthy()
})

it('leaves the first expense out when it was skipped', () => {
  const { queryByText, getByText } = renderWithProviders(<SetupDone income={0} groupCount={2} categoryCount={4} onFinish={jest.fn()} />)
  expect(queryByText('First expense')).toBeNull()
  expect(getByText('Your first 30 days are free. No card, nothing to cancel.')).toBeTruthy()
})
