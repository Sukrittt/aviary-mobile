import { act, fireEvent } from '@testing-library/react-native'
import { Animated, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { DeltaBar, DELTA_DELAY, DELTA_DURATION, DELTA_EASING, DELTA_HOLD } from './DeltaBar'

jest.useFakeTimers()
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}))

function renderBar(props: { from: number; to: number; amount: number }) {
  const utils = renderWithProviders(<DeltaBar {...props} />)
  fireEvent(utils.getByTestId('delta-bar-wrap'), 'layout', { nativeEvent: { layout: { width: 200 } } })
  return utils
}

function settle() {
  act(() => {
    jest.advanceTimersByTime(DELTA_DELAY + DELTA_DURATION + 50)
  })
}

describe('DeltaBar', () => {
  it('ticks haptics as each segment fills, then thuds when the delta lands', () => {
    jest.mocked(Haptics.selectionAsync).mockClear()
    jest.mocked(Haptics.impactAsync).mockClear()
    renderBar({ from: 50, to: 80, amount: 10 })
    settle()
    // One tick per 1% of track crossed: 50% base, 30% delta.
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(50)
    const impacts = jest.mocked(Haptics.impactAsync).mock.calls.map(([style]) => style)
    expect(impacts.filter((s) => s === 'light')).toHaveLength(30)
    expect(impacts.at(-1)).toBe('medium')
  })

  it('scales fixed-width segments instead of animating layout width', () => {
    const { getByTestId } = renderBar({ from: 50, to: 80, amount: 10 })
    const base = StyleSheet.flatten(getByTestId('delta-bar-base').props.style)
    const delta = StyleSheet.flatten(getByTestId('delta-bar-delta').props.style)

    expect(base.width).toBe(100)
    expect(base.transformOrigin).toBe('left')
    expect(base.transform).toBeDefined()
    expect(delta.width).toBe(60)
    expect(delta.transformOrigin).toBe('left')
    expect(delta.transform).toBeDefined()
  })

  it('eases in visibly and settles gently at the end of both phases', () => {
    // An ease-in curve remains behind linear progress at its midpoint. The
    // base and delta width tracks both consume this shared easing function.
    expect(DELTA_EASING(0)).toBe(0)
    expect(DELTA_EASING(0.5)).toBeLessThan(0.3)
    // A pure cubic ease-in reaches the marker at peak speed and snaps to rest.
    expect(DELTA_EASING(1) - DELTA_EASING(0.99)).toBeLessThan(0.005)
    expect(DELTA_EASING(1)).toBe(1)
  })

  it('parks the ghost marker at the pre-expense position', () => {
    const { getByTestId } = renderBar({ from: 50, to: 80, amount: 10 })
    const style = StyleSheet.flatten(getByTestId('delta-bar-marker').props.style)
    expect(style.left).toBe(100) // 50% of 200px
  })

  it('starts the delta segment where the marker sits', () => {
    const { getByTestId } = renderBar({ from: 50, to: 80, amount: 10 })
    const style = StyleSheet.flatten(getByTestId('delta-bar-delta').props.style)
    expect(style.left).toBe(100)
  })

  it('grows the delta segment to span from -> to', () => {
    const { getByTestId } = renderBar({ from: 50, to: 80, amount: 10 })
    settle()
    const style = StyleSheet.flatten(getByTestId('delta-bar-delta').props.style)
    expect(style.width).toBeCloseTo((30 / 100) * 200)
  })

  it('holds briefly on the old value before growing the new segment', () => {
    const timing = jest.spyOn(Animated, 'timing')
    try {
      renderBar({ from: 50, to: 80, amount: 10 })
      const deltaConfig = timing.mock.calls
        .map(([, config]) => config)
        .find((config) => config.toValue === 1 && config.duration === DELTA_DURATION && config.delay === DELTA_DELAY)

      expect(DELTA_HOLD).toBe(500)
      expect(DELTA_DELAY).toBe(500 + 1000 + DELTA_HOLD)
      expect(DELTA_DURATION).toBe(1000)
      expect(timing.mock.calls.map(([, config]) => config)).toContainEqual(
        expect.objectContaining({ delay: 500, duration: 1000, easing: DELTA_EASING, useNativeDriver: true }),
      )
      expect(deltaConfig).toMatchObject({
        easing: DELTA_EASING,
        useNativeDriver: true,
      })
    } finally {
      timing.mockRestore()
    }
  })

  it('transitions the full fill color from the old threshold to the new threshold', () => {
    const { getByTestId } = renderBar({ from: 50, to: 95, amount: 10 })
    const base = getByTestId('delta-bar-base-color')
    const delta = getByTestId('delta-bar-delta-color')

    expect(StyleSheet.flatten(base.props.style).backgroundColor).toBe('rgba(31, 122, 77, 1)')
    expect(StyleSheet.flatten(delta.props.style).backgroundColor).toBe('rgba(31, 122, 77, 1)')

    settle()

    expect(StyleSheet.flatten(base.props.style).backgroundColor).toBe('rgba(215, 14, 58, 1)')
    expect(StyleSheet.flatten(delta.props.style).backgroundColor).toBe('rgba(215, 14, 58, 1)')
  })

  it('floors a near-invisible delta to a minimum visible width', () => {
    const { getByTestId } = renderBar({ from: 50, to: 50.1, amount: 1 })
    settle()
    const style = StyleSheet.flatten(getByTestId('delta-bar-delta').props.style)
    expect(style.width).toBeCloseTo((2.4 / 100) * 200)
  })

  it.each([94, 100, 125])('keeps the amount tag inside the track at %s%% used', (from) => {
    const { getByTestId } = renderBar({ from, to: 130, amount: 1750 })
    const tag = getByTestId('delta-bar-tag')
    fireEvent(tag, 'layout', { nativeEvent: { layout: { width: 80 } } })

    const assertInside = (width: number) => {
      const style = StyleSheet.flatten(tag.props.style)
      const translateX = style.transform[0].translateX
      expect(style.left).toBeGreaterThanOrEqual(0)
      expect(style.left + 80 + translateX).toBeLessThanOrEqual(width)
    }
    assertInside(200)
    settle()
    assertInside(200)
    fireEvent(getByTestId('delta-bar-wrap'), 'layout', { nativeEvent: { layout: { width: 160 } } })
    assertInside(160)
  })

  it('keeps the tag aligned to the marker when there is room', () => {
    const { getByTestId } = renderBar({ from: 30, to: 50, amount: 450 })
    fireEvent(getByTestId('delta-bar-tag'), 'layout', { nativeEvent: { layout: { width: 80 } } })
    settle()
    expect(StyleSheet.flatten(getByTestId('delta-bar-tag').props.style).left).toBe(60)
  })

  it('renders the signed amount on the tag', () => {
    const { getByText } = renderBar({ from: 50, to: 80, amount: 450 })
    expect(getByText('+₹450')).toBeTruthy()
  })
})
