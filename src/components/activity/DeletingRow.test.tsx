import { Text } from 'react-native'
import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { DeletingRow } from './DeletingRow'

const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 60 } } }

it('still runs the delete when the row unmounts mid-collapse', () => {
  const onDone = jest.fn()
  const screen = renderWithProviders(<DeletingRow active onDone={onDone}><Text>Tea</Text></DeletingRow>)
  expect(onDone).not.toHaveBeenCalled()
  screen.unmount()
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('runs it once when the collapse finishes, not again on unmount', () => {
  const onDone = jest.fn()
  const screen = renderWithProviders(<DeletingRow active onDone={onDone}><Text>Tea</Text></DeletingRow>)
  fireEvent(screen.getByText('Tea'), 'layout', layout)
  expect(onDone).toHaveBeenCalledTimes(1)
  screen.unmount()
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('never runs for a row that was not being deleted', () => {
  const onDone = jest.fn()
  renderWithProviders(<DeletingRow active={false} onDone={onDone}><Text>Tea</Text></DeletingRow>).unmount()
  expect(onDone).not.toHaveBeenCalled()
})
