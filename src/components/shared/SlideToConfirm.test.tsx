import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { slide } from '@/src/test-utils/slide'
import { SlideToConfirm } from './SlideToConfirm'

it('confirms through the screen reader action, never a plain tap', () => {
  const onConfirm = jest.fn()
  const screen = renderWithProviders(<SlideToConfirm label="Slide to log it" onConfirm={onConfirm} />)
  const el = screen.getByLabelText('Slide to log it')
  fireEvent.press(el)
  expect(onConfirm).not.toHaveBeenCalled()
  slide(el)
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

it('does nothing while disabled', () => {
  const onConfirm = jest.fn()
  const screen = renderWithProviders(<SlideToConfirm label="Slide to log it" onConfirm={onConfirm} disabled />)
  slide(screen.getByLabelText('Slide to log it'))
  expect(onConfirm).not.toHaveBeenCalled()
})
