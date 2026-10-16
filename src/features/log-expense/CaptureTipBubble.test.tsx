import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { CaptureTipBubble } from './CaptureTipBubble'

function renderBubble() {
  const onTry = jest.fn()
  const onDismiss = jest.fn()
  const screen = renderWithProviders(
    <CaptureTipBubble anchor={{ top: 0, left: 0, size: 36 }} title="Been a couple of days?" body="Type it in." onTry={onTry} onDismiss={onDismiss} />,
  )
  return { ...screen, onTry, onDismiss }
}

it('opens the tip from anywhere on the card', () => {
  const { getByText, onTry, onDismiss } = renderBubble()
  fireEvent.press(getByText('Type it in.'))
  expect(onTry).toHaveBeenCalledTimes(1)
  expect(onDismiss).not.toHaveBeenCalled()
})

it('only the X dismisses it', () => {
  const { getByLabelText, onTry, onDismiss } = renderBubble()
  fireEvent.press(getByLabelText('Dismiss tip'))
  expect(onDismiss).toHaveBeenCalledTimes(1)
  expect(onTry).not.toHaveBeenCalled()
})
