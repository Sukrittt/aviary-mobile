import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { SetupDone } from './SetupDone'

it('promises the first-week recap', () => {
  const { getByText } = renderWithProviders(<SetupDone income={50000} groupCount={3} categoryCount={8} onFinish={jest.fn()} />)
  expect(getByText('Log 7 days to unlock your first recap')).toBeTruthy()
})
