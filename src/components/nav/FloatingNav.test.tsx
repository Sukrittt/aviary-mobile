import { act, fireEvent } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { Animated } from 'react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import {
  FloatingNav,
  slotOffset,
  indexFromOffset,
  slotProximity,
  addSlotShift,
  navStateFor,
} from './FloatingNav'

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error' },
}))

// RNTL can't simulate a real drag/snap gesture, so drag-to-navigate is
// covered by hand (see the plan's verification steps), not here.

describe('slotOffset / indexFromOffset', () => {
  it('round-trips slot offsets back to their index', () => {
    for (let i = 0; i < 5; i++) {
      expect(indexFromOffset(slotOffset(i), 5)).toBe(i)
    }
  })

  it('rounds a mid-drag offset to the nearest slot', () => {
    expect(indexFromOffset(slotOffset(1) + 1, 5)).toBe(1)
    expect(indexFromOffset(slotOffset(2) - 30, 5)).toBe(2)
  })

  it('clamps below the first and above the last slot', () => {
    expect(indexFromOffset(-1000, 5)).toBe(0)
    expect(indexFromOffset(1000, 5)).toBe(4)
  })
})

// Drives both the size falloff and the ring hand-off, so a break here means
// the wrong circle is big / ringed mid-drag.
describe('slotProximity', () => {
  it('is 0 for the slot sitting at centre', () => {
    for (let i = 0; i < 5; i++) {
      expect(slotProximity(slotOffset(i), i)).toBe(0)
    }
  })

  it('is 1 for a neighbouring slot and stays clamped beyond it', () => {
    expect(slotProximity(slotOffset(2), 1)).toBe(1)
    expect(slotProximity(slotOffset(2), 3)).toBe(1)
    expect(slotProximity(slotOffset(2), 0)).toBe(1)
    expect(slotProximity(slotOffset(2), 4)).toBe(1)
  })

  it('hands over linearly and symmetrically across a drag', () => {
    const midway = slotOffset(1) + (slotOffset(2) - slotOffset(1)) / 2
    expect(slotProximity(midway, 1)).toBeCloseTo(0.5)
    expect(slotProximity(midway, 2)).toBeCloseTo(0.5)
    // A quarter of the way from slot 1 to slot 2: slot 1 still dominates.
    const quarter = slotOffset(1) + (slotOffset(2) - slotOffset(1)) / 4
    expect(slotProximity(quarter, 1)).toBeCloseTo(0.25)
    expect(slotProximity(quarter, 2)).toBeCloseTo(0.75)
  })
})

describe('addSlotShift', () => {
  it('is positive (add slot to the right) for slots left of the add slot', () => {
    expect(addSlotShift('index')).toBeGreaterThan(0)
    expect(addSlotShift('activity')).toBeGreaterThan(0)
  })

  it('is negative (add slot to the left) for slots right of the add slot', () => {
    expect(addSlotShift('envelopes')).toBeLessThan(0)
    expect(addSlotShift('more')).toBeLessThan(0)
  })

  it('is a fixed multiple of the slot width, and shrinks with distance to the add slot', () => {
    expect(addSlotShift('index')).toBe(144)
    expect(addSlotShift('activity')).toBe(72)
  })
})

describe('navStateFor', () => {
  it('is visible with the matching route active on a tab path', () => {
    expect(navStateFor('/')).toEqual({ active: 'index', addActive: false, visible: true })
    expect(navStateFor('/activity')).toEqual({ active: 'activity', addActive: false, visible: true })
  })

  it('is visible with the add slot active on the log-expense path', () => {
    expect(navStateFor('/modals/log-expense', true)).toEqual({ active: null, addActive: true, visible: true })
  })

  it('is not visible on a path outside the tabs and log-expense', () => {
    expect(navStateFor('/insights')).toEqual({ active: null, addActive: false, visible: false })
    expect(navStateFor('/modals/move-money')).toEqual({ active: null, addActive: false, visible: false })
    expect(navStateFor('/(auth)/welcome')).toEqual({ active: null, addActive: false, visible: false })
  })
})

describe('FloatingNav', () => {
  it('taps a route circle and calls onSelect with its name', () => {
    const onSelect = jest.fn()
    const { getByLabelText } = renderWithProviders(
      <FloatingNav active="index" onSelect={onSelect} onAdd={jest.fn()} />,
    )
    fireEvent.press(getByLabelText('Envelopes'))
    expect(onSelect).toHaveBeenCalledWith('envelopes')
  })

  it('taps the add circle and calls onAdd', () => {
    const onAdd = jest.fn()
    const { getByLabelText } = renderWithProviders(
      <FloatingNav active="index" onSelect={jest.fn()} onAdd={onAdd} />,
    )
    fireEvent.press(getByLabelText('Log expense'))
    expect(onAdd).toHaveBeenCalled()
  })

  it('marks the active route selected and the others not', () => {
    const { getByLabelText } = renderWithProviders(
      <FloatingNav active="envelopes" onSelect={jest.fn()} onAdd={jest.fn()} />,
    )
    expect(getByLabelText('Envelopes').props.accessibilityState.selected).toBe(true)
    expect(getByLabelText('Home').props.accessibilityState.selected).toBe(false)
  })

  it('marks the add slot selected when addActive, keeping the Log expense label', () => {
    const { getByLabelText } = renderWithProviders(
      <FloatingNav active={null} addActive onSelect={jest.fn()} onAdd={jest.fn()} />,
    )
    expect(getByLabelText('Log expense').props.accessibilityState.selected).toBe(true)
  })

  it('tapping the add circle while addActive still fires onAdd (submit, not back)', () => {
    const onAdd = jest.fn()
    const { getByLabelText } = renderWithProviders(
      <FloatingNav active={null} addActive onSelect={jest.fn()} onAdd={onAdd} />,
    )
    fireEvent.press(getByLabelText('Log expense'))
    expect(onAdd).toHaveBeenCalled()
  })

  it('shakes with an error haptic instead of submitting when the active add form is invalid', () => {
    jest.mocked(Haptics.impactAsync).mockClear()
    jest.mocked(Haptics.notificationAsync).mockClear()
    const shakeAnimation = { start: jest.fn() }
    const sequenceSpy = jest.spyOn(Animated, 'sequence').mockReturnValue(shakeAnimation as never)
    const onAdd = jest.fn()
    const onAddInvalid = jest.fn()
    const { getByLabelText } = renderWithProviders(
      <FloatingNav active={null} addActive addInvalid onSelect={jest.fn()} onAdd={onAdd} onAddInvalid={onAddInvalid} />,
    )
    const circle = getByLabelText('Log expense')

    expect(circle.props.accessibilityState.disabled).toBe(false)
    act(() => {
      fireEvent.press(circle)
    })

    expect(onAdd).not.toHaveBeenCalled()
    expect(onAddInvalid).toHaveBeenCalledTimes(1)
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error)
    expect(Haptics.impactAsync).not.toHaveBeenCalled()
    expect(sequenceSpy).toHaveBeenCalled()
    expect(shakeAnimation.start).toHaveBeenCalled()
    sequenceSpy.mockRestore()
  })

  it('disables and shows a spinner on the add circle while addSaving', () => {
    const onAdd = jest.fn()
    const { getByLabelText, getByTestId } = renderWithProviders(
      <FloatingNav active={null} addActive addSaving onSelect={jest.fn()} onAdd={onAdd} />,
    )
    const circle = getByLabelText('Log expense')
    expect(circle.props.accessibilityState.disabled).toBe(true)
    fireEvent.press(circle)
    expect(onAdd).not.toHaveBeenCalled()
    expect(getByTestId('nav-add-saving')).toBeTruthy()
  })

  it('disables and shows a check on the add circle while addSuccess', () => {
    const onAdd = jest.fn()
    const { getByLabelText, getByTestId, getAllByTestId } = renderWithProviders(
      <FloatingNav active={null} addActive addSuccess onSelect={jest.fn()} onAdd={onAdd} />,
    )
    const circle = getByLabelText('Log expense')
    expect(circle.props.accessibilityState.disabled).toBe(true)
    fireEvent.press(circle)
    expect(onAdd).not.toHaveBeenCalled()
    expect(getByTestId('nav-add-success')).toBeTruthy()
    expect(getByTestId('success-confetti').props.pointerEvents).toBe('none')
    expect(getAllByTestId(/^success-particle-/)).toHaveLength(8)
  })
})
