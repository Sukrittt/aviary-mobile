import { fireEvent } from '@testing-library/react-native'
import type { ReactTestInstance } from 'react-test-renderer'

/** RNTL can't drag, so confirm a SlideToConfirm the way a screen reader does. */
export function slide(el: ReactTestInstance) {
  fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } })
}
