import { fireEvent } from '@testing-library/react-native'
import { Plus } from '@/src/components/shared/icons'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { QuickAddMenu } from './QuickAddMenu'

it('runs the picked action and closes', () => {
  const onPress = jest.fn()
  const onClose = jest.fn()
  const { getByLabelText } = renderWithProviders(
    <QuickAddMenu items={[{ label: 'Add income', icon: Plus, tint: '#000', onPress }]} onClose={onClose} />,
  )
  fireEvent.press(getByLabelText('Add income'))
  expect(onPress).toHaveBeenCalled()
  expect(onClose).toHaveBeenCalled()
})

it('closes on a tap outside the card', () => {
  const onClose = jest.fn()
  const { getByTestId } = renderWithProviders(<QuickAddMenu items={[]} onClose={onClose} />)
  fireEvent.press(getByTestId('quick-add-scrim'))
  expect(onClose).toHaveBeenCalled()
})
