import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { TrendChart } from './TrendChart'

it('shows the empty illustration once there is genuinely no data', () => {
  const screen = renderWithProviders(<TrendChart data={[]} />)
  expect(screen.getByTestId('trend-empty')).toBeTruthy()
})

it('hides the empty illustration while data is still loading', () => {
  const screen = renderWithProviders(<TrendChart data={[]} loading />)
  expect(screen.queryByTestId('trend-empty')).toBeNull()
})
