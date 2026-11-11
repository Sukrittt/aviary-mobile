import { act, fireEvent } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { DeltaBar, DELTA_DELAY, DELTA_DURATION } from './DeltaBar'

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

  it('transitions the full fill color from the old threshold to the new threshold', () => {
    const { getByTestId } = renderBar({ from: 50, to: 95, amount: 10 })
    const base = getByTestId('delta-bar-base-color')
    const delta = getByTestId('delta-bar-delta-color')

    expect(StyleSheet.flatten(base.props.style).backgroundColor).toBe('rgba(31, 122, 77, 1)')
    expect(StyleSheet.flatten(delta.props.style).backgroundColor).toBe('rgba(31, 122, 77, 1)')

    settle()

    expect(StyleSheet.flatten(base.props.style).backgroundColor).toBe('rgba(234, 179, 8, 1)')
    expect(StyleSheet.flatten(delta.props.style).backgroundColor).toBe('rgba(234, 179, 8, 1)')
  })

  it('floors a near-invisible delta to a minimum visible width', () => {
    const { getByTestId } = renderBar({ from: 50, to: 50.1, amount: 1 })
    settle()
    const style = StyleSheet.flatten(getByTestId('delta-bar-delta').props.style)
    expect(style.width).toBeCloseTo((2.4 / 100) * 200)
  })

  it.each([125])('keeps the amount tag inside the track at %s%% used', (from) => {
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
