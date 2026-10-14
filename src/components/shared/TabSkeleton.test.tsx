import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { ActivitySkeleton, EnvelopesSkeleton, HomeSkeleton } from './TabSkeleton'

it.each([
  ['Activity', ActivitySkeleton],
  ['Categories', EnvelopesSkeleton],
])('keeps the %s header in place while the body loads', (title, Skeleton) => {
  const screen = renderWithProviders(<Skeleton />)
  expect(screen.getByRole('header', { name: title })).toBeTruthy()
  expect(screen.getByLabelText('Loading')).toBeTruthy()
})

it('draws Home without any loading phrase', () => {
  const screen = renderWithProviders(<HomeSkeleton />)
  expect(screen.getByTestId('tab-skeleton')).toBeTruthy()
  expect(screen.queryByText(/…/)).toBeNull()
})
