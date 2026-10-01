import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { EmptyState } from './EmptyState'

it('exposes the explanation and next step while hiding the decorative scene', () => {
  const onPress = jest.fn()
  const screen = renderWithProviders(
    <EmptyState
      title="Nothing turned up"
      description="Try clearing your filters."
      mood="searching"
      action={{ label: 'Clear filters', onPress }}
    />,
  )
  expect(screen.getByRole('header', { name: 'Nothing turned up' })).toBeTruthy()
  expect(screen.getByText('Try clearing your filters.')).toBeTruthy()
  expect(screen.getAllByRole('button')).toHaveLength(1)
  fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }))
  expect(onPress).toHaveBeenCalledTimes(1)
})

it('supports informational empty states without an action', () => {
  const screen = renderWithProviders(<EmptyState title="Nothing spent yet" description="Your spending will land here." />)
  expect(screen.getByText('Your spending will land here.')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
})

it('supports distinct subject scenes and the compact chart treatment', () => {
  const screen = renderWithProviders(
    <EmptyState
      compact
      subject="insights"
      title="No trend yet"
      description="A few expenses will make this chart useful."
    />,
  )
  expect(screen.getByRole('header', { name: 'No trend yet' })).toBeTruthy()
})
