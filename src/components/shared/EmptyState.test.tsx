import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { EmptyState, sceneFor } from './EmptyState'

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

it('keeps each subject on its own scene and falls back to the mood scene', () => {
  expect(sceneFor('expenses')).toBe('expenses')
  expect(sceneFor('subscriptions')).toBe('subscriptions')
  expect(sceneFor('holdings')).toBe('holdings')
  expect(sceneFor('recurring')).toBe('snoozing')
  expect(sceneFor('scans', 'searching')).toBe('scans')
  expect(sceneFor('insights')).toBe('insights')
  // Activity: empty list dozes, a filter with no results searches.
  expect(sceneFor('expenses', 'snoozing')).toBe('snoozing')
  expect(sceneFor('expenses', 'searching')).toBe('searching')
  expect(sceneFor('archive', 'searching')).toBe('searching')
  expect(sceneFor('chat', 'searching')).toBe('searching')
})

it.each(['expenses', 'subscriptions', 'holdings', 'recurring', 'scans', 'chat', 'archive', 'envelopes', 'insights'] as const)(
  'renders the %s scene',
  (subject) => {
    const screen = renderWithProviders(<EmptyState subject={subject} title="Empty" description="Nothing here." />)
    expect(screen.getByTestId(`empty-state-scene-${sceneFor(subject)}`, { includeHiddenElements: true })).toBeTruthy()
  },
)

it('renders a still scene under reduced motion', () => {
  const reanimated = jest.requireMock('react-native-reanimated')
  const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true)
  const screen = renderWithProviders(<EmptyState subject="holdings" title="Room to grow" description="No holdings yet." />)
  expect(screen.getByTestId('empty-state-scene-holdings', { includeHiddenElements: true })).toBeTruthy()
  spy.mockRestore()
})
