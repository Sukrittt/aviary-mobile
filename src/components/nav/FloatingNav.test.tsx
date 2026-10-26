import { useState } from 'react'
import { act, fireEvent } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { Animated, StyleSheet } from 'react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import {
  FloatingNav,
  navStateFor,
  nextNavCover,
  tabsState,
  type NavCover,
  type NavRoute,
} from './FloatingNav'

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid' },
  NotificationFeedbackType: { Error: 'error' },
}))

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
    fireEvent.press(getByLabelText('Categories'))
    expect(onSelect).toHaveBeenCalledWith('envelopes')
  })

  // The layer each glyph sits on is what fades; the glyph's own props never change.
  const layerOpacity = (glyph: ReturnType<ReturnType<typeof renderWithProviders>['getByTestId']>) => {
    for (let n = glyph.parent; n; n = n.parent) {
      const opacity = typeof n.type === 'string' ? StyleSheet.flatten(n.props.style)?.opacity : undefined
      if (opacity !== undefined) return opacity
    }
  }

  it('shows the active tab glyph filled and the rest regular', () => {
    const { getByTestId } = renderWithProviders(
      <FloatingNav active="activity" onSelect={jest.fn()} onAdd={jest.fn()} />,
    )
    expect(layerOpacity(getByTestId('phosphor-react-native-receipt-fill'))).toBe(1)
    expect(layerOpacity(getByTestId('phosphor-react-native-receipt-regular'))).toBe(0)
    expect(layerOpacity(getByTestId('phosphor-react-native-house-regular'))).toBe(1)
    expect(layerOpacity(getByTestId('phosphor-react-native-house-fill'))).toBe(0)
  })

  // A new SVG paints a frame or more late on Android, so the switch mustn't build one.
  it('keeps every tab glyph mounted across a switch', () => {
    function Nav() {
      const [active, setActive] = useState<NavRoute>('index')
      return <FloatingNav active={active} onSelect={setActive} onAdd={jest.fn()} />
    }
    const { getAllByTestId, getByLabelText } = renderWithProviders(<Nav />)
    const before = getAllByTestId(/^phosphor-react-native-(house|receipt|squares-four|user)-/)
    fireEvent(getByLabelText('Activity'), 'pressIn')
    expect(getByLabelText('Activity').props.accessibilityState.selected).toBe(true)
    const after = getAllByTestId(/^phosphor-react-native-(house|receipt|squares-four|user)-/)
    expect(after).toHaveLength(8)
    after.forEach((glyph, i) => expect(glyph).toBe(before[i]))
  })

  // Tab bars switch on touch-down; waiting for the finger to lift added ~100ms to every switch.
  it('selects a route on touch-down, without firing again on release', () => {
    const onSelect = jest.fn()
    const { getByLabelText } = renderWithProviders(
      <FloatingNav active="index" onSelect={onSelect} onAdd={jest.fn()} />,
    )
    fireEvent(getByLabelText('Activity'), 'pressIn')
    expect(onSelect).toHaveBeenCalledWith('activity')
    fireEvent.press(getByLabelText('Activity'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('keeps the add circle on release, so long-press still opens the menu', () => {
    const onAdd = jest.fn()
    const { getByLabelText } = renderWithProviders(
      <FloatingNav active="index" onSelect={jest.fn()} onAdd={onAdd} />,
    )
    fireEvent(getByLabelText('Log expense'), 'pressIn')
    expect(onAdd).not.toHaveBeenCalled()
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
    expect(getByLabelText('Categories').props.accessibilityState.selected).toBe(true)
    expect(getByLabelText('Home').props.accessibilityState.selected).toBe(false)
  })

  it('marks the add slot selected when addActive, keeping the Log expense label', () => {
    const { getByLabelText } = renderWithProviders(
      <FloatingNav active={null} addActive onSelect={jest.fn()} onAdd={jest.fn()} />,
    )
    expect(getByLabelText('Log expense').props.accessibilityState.selected).toBe(true)
  })

  // The screen cuts on touch-down, so the nav has to cut with it. A slide or
  // fade left the old tab lit over the new screen, and the screen's mount
  // froze the slide halfway on Android.
  it('moves the highlight and the fill to the new tab in the same render, with one tick', () => {
    jest.mocked(Haptics.impactAsync).mockClear()
    function Nav() {
      const [active, setActive] = useState<NavRoute>('index')
      return <FloatingNav active={active} onSelect={setActive} onAdd={jest.fn()} />
    }
    const { getByLabelText, getByTestId, queryByTestId } = renderWithProviders(<Nav />)
    fireEvent(getByLabelText('Categories'), 'pressIn')
    expect(StyleSheet.flatten(getByTestId('nav-highlight').props.style).left).toBe(5 + 2 * 56)
    expect(getByTestId('phosphor-react-native-squares-four-fill')).toBeTruthy()
    expect(queryByTestId('phosphor-react-native-house-fill')).toBeNull()
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1)
  })

  it('hides the highlight on log-expense, where no tab is current', () => {
    const { getByTestId } = renderWithProviders(
      <FloatingNav active={null} addActive onSelect={jest.fn()} onAdd={jest.fn()} />,
    )
    expect(StyleSheet.flatten(getByTestId('nav-highlight').props.style).opacity).toBe(0)
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

describe('nextNavCover', () => {
  const walk = (paths: string[]) =>
    paths.reduce<NavCover>((s, p) => nextNavCover(s, p, p === '/modals/log-expense'), { path: paths[0], tab: 'index', covered: false, arriving: false })

  it('covers the tabs when a nav-less screen is pushed over them, keeping the last tab', () => {
    expect(walk(['/', '/more', '/account/archive'])).toEqual({ path: '/account/archive', tab: 'more', covered: true, arriving: false })
  })

  it('stays covered through a deeper push', () => {
    expect(walk(['/more', '/account/recurring', '/account/recurring-suggestions']).covered).toBe(true)
  })

  it('marks the pop back onto a tab as arriving, so the overlay waits for the slide to finish', () => {
    expect(walk(['/more', '/insights', '/more'])).toEqual({ path: '/more', tab: 'more', covered: false, arriving: true })
  })

  it('never covers for log-expense, whose nav morphs in place', () => {
    const s = walk(['/', '/modals/log-expense', '/'])
    expect(s.covered || s.arriving).toBe(false)
  })

  it('leaves a nav-less screen opened from log-expense to the overlay', () => {
    expect(walk(['/', '/modals/log-expense', '/modals/scan-bill']).covered).toBe(false)
  })
})

describe('tabsState', () => {
  it('finds the tabs navigator under expo-router\'s root stack', () => {
    const tabs = { key: 'tab-1', index: 0, routes: [{ name: 'index' }] }
    expect(tabsState({ key: 'root', routes: [{ name: '__root', state: { key: 'stack', routes: [{ name: '(auth)/email' }, { name: '(tabs)', state: tabs }] } }] })).toBe(tabs)
  })

  it('picks the topmost tabs when a replace stacked a second copy over the first', () => {
    const hidden = { key: 'tab-1', index: 3, routes: [{ name: 'index' }] }
    const shown = { key: 'tab-2', index: 3, routes: [{ name: 'index' }] }
    expect(tabsState({ key: 'root', routes: [{ name: '__root', state: { key: 'stack', routes: [{ name: '(tabs)', state: hidden }, { name: '(tabs)', state: shown }] } }] })).toBe(shown)
  })

  it('is undefined while the tabs aren\'t mounted', () => {
    expect(tabsState(undefined)).toBeUndefined()
    expect(tabsState({ routes: [{ name: '__root', state: { routes: [{ name: '(auth)/welcome' }] } }] })).toBeUndefined()
  })
})
