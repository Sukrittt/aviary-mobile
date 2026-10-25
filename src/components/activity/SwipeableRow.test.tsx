import { Text } from 'react-native'
import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { SwipeableRow } from './SwipeableRow'

// Renders both action slots up front, like the real one, and turns a press
// on "drag" into the drag-start callback.
type MockSwipeableProps = {
  children: unknown
  renderLeftActions?: (...args: unknown[]) => unknown
  renderRightActions?: (...args: unknown[]) => unknown
  onSwipeableOpenStartDrag?: (direction: string) => void
}
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't reference out-of-scope imports (hoisting)
  const { createElement, forwardRef } = require('react')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- same
  const { Pressable, View } = require('react-native')
  const Swipeable = forwardRef(function MockSwipeable({ children, renderLeftActions, renderRightActions, onSwipeableOpenStartDrag }: MockSwipeableProps, _ref: unknown) {
    const progress = { value: 0 }
    const methods = { close: () => {}, reset: () => {} }
    return createElement(
      View,
      null,
      renderLeftActions?.(progress, progress, methods),
      renderRightActions?.(progress, progress, methods),
      createElement(Pressable, { testID: 'drag', onPress: () => onSwipeableOpenStartDrag?.('right') }),
      children,
    )
  })
  return { __esModule: true, default: Swipeable }
})

// The icons sit at scale 0 until a drag reveals them; mounted on every row,
// Android re-attached two extra SVGs a row on each switch to Activity.
it('mounts the action icons once the row is dragged, not before', () => {
  const { getByTestId, getByText, queryByTestId } = renderWithProviders(
    <SwipeableRow onDelete={jest.fn()} onEdit={jest.fn()}>
      <Text>Groceries</Text>
    </SwipeableRow>,
  )
  expect(getByText('Groceries')).toBeTruthy()
  expect(queryByTestId('phosphor-react-native-trash-bold')).toBeNull()
  expect(queryByTestId('phosphor-react-native-pencil-simple-bold')).toBeNull()
  fireEvent.press(getByTestId('drag'))
  expect(getByTestId('phosphor-react-native-trash-bold')).toBeTruthy()
  expect(getByTestId('phosphor-react-native-pencil-simple-bold')).toBeTruthy()
})

// Icon-only buttons: without a label a screen reader just says "button".
it('labels the swipe actions for screen readers', () => {
  const onDelete = jest.fn()
  const onEdit = jest.fn()
  const { getByLabelText } = renderWithProviders(
    <SwipeableRow onDelete={onDelete} onEdit={onEdit}>
      <Text>Groceries</Text>
    </SwipeableRow>,
  )
  fireEvent.press(getByLabelText('Delete'))
  fireEvent.press(getByLabelText('Edit'))
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onEdit).toHaveBeenCalledTimes(1)
})
