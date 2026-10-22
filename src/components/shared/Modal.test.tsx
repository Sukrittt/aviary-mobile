import { useState } from 'react'
import { Modal, Text } from 'react-native'
import { act, fireEvent } from '@testing-library/react-native'
import * as Reanimated from 'react-native-reanimated'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { BottomSheet } from './Modal'

// useSafeAreaInsets falls back to a default inset set (via
// react-native-safe-area-context's jest mock) when rendered with no
// SafeAreaProvider ancestor, so no extra wrapping is needed here.

describe('BottomSheet', () => {
  it('renders its children when visible', () => {
    const { getByText } = renderWithProviders(
      <BottomSheet visible onClose={jest.fn()}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    )
    expect(getByText('Sheet content')).toBeTruthy()
  })

  it('renders nothing (RN Modal unmounts its content) when not visible', () => {
    const { queryByText } = renderWithProviders(
      <BottomSheet visible={false} onClose={jest.fn()}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    )
    expect(queryByText('Sheet content')).toBeNull()
  })

  it('closes on backdrop press', () => {
    const onClose = jest.fn()
    const { getByTestId } = renderWithProviders(
      <BottomSheet visible onClose={onClose}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    )
    fireEvent.press(getByTestId('bottom-sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the card itself is pressed', () => {
    const onClose = jest.fn()
    const { getByText } = renderWithProviders(
      <BottomSheet visible onClose={onClose}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    )
    // fireEvent.press invokes the onPress it finds with whatever event object
    // is given it (default {}); the sheet card's onPress calls stopPropagation.
    fireEvent.press(getByText('Sheet content'), { stopPropagation: jest.fn() })
    expect(onClose).not.toHaveBeenCalled()
  })

  // Regression: a Reanimated layout transition on the card stalled inside iOS's
  // Modal (which resizes its root after mount), painting the card ~70pt above
  // the screen's bottom while touches hit its real frame. Taps went dead.
  it('keeps the card off layout animations so paint and touch stay in sync', () => {
    const { getByTestId } = renderWithProviders(
      <BottomSheet visible onClose={jest.fn()}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    )
    expect(getByTestId('bottom-sheet-card').props.layout).toBeUndefined()
  })

  // Regression: animationType="slide" moved the whole modal, so the dim rode up
  // with the card like a curtain. The backdrop and card now animate on their own.
  it("doesn't let RN slide the modal (and its dim) as one block", () => {
    const { UNSAFE_getByType } = renderWithProviders(
      <BottomSheet visible onClose={jest.fn()}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    )
    expect(UNSAFE_getByType(Modal).props.animationType).toBe('none')
  })

  it('unmounts its content once the close animation finishes', () => {
    // rerender() would drop renderWithProviders' ThemeProvider, so the sheet
    // closes through state, the way callers close it.
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <BottomSheet visible={open} onClose={() => setOpen(false)}>
          <Text onPress={() => setOpen(false)}>Done</Text>
        </BottomSheet>
      )
    }
    // The reanimated mock settles withTiming at once; hold its completion
    // callback instead so the test sees the sheet mid-close.
    let finish: ((finished: boolean) => void) | undefined
    const spy = jest.spyOn(Reanimated, 'withTiming').mockImplementation(((toValue: number, _config: unknown, callback?: (finished: boolean) => void) => {
      finish = callback
      return toValue
    }) as typeof Reanimated.withTiming)
    const { getByText, queryByText } = renderWithProviders(<Harness />)
    fireEvent.press(getByText('Done'))
    expect(queryByText('Done')).toBeTruthy()
    act(() => finish?.(true))
    expect(queryByText('Done')).toBeNull()
    spy.mockRestore()
  })
})
