import { StyleSheet } from 'react-native'
import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { lightTokens } from '@/src/theme/tokens'
import { ProgressBar } from './ProgressBar'

// react-native's jest preset defaults useColorScheme() to 'light', so the
// default render in tests uses lightTokens.

function fillStyle(pct: number) {
  const { getByTestId } = renderWithProviders(<ProgressBar pct={pct} />)
  const flat = getByTestId('progress-bar-fill').props.style.flat()
  return Object.assign({}, ...flat)
}

describe('ProgressBar', () => {
  it('uses text3 (muted) when exactly at 100%', () => {
    expect(fillStyle(100).backgroundColor).toBe(lightTokens.text3)
  })

  it('uses coral above 90%', () => {
    expect(fillStyle(95).backgroundColor).toBe(lightTokens.coral)
  })

  it('uses warn above 75%', () => {
    expect(fillStyle(80).backgroundColor).toBe(lightTokens.warn)
  })

  it('uses mint at or below 75%', () => {
    expect(fillStyle(50).backgroundColor).toBe(lightTokens.mint)
  })

  it('clamps width to 100 for values over 100', () => {
    expect(fillStyle(150).width).toBe('100%')
  })

  it('clamps width to 0 for negative values', () => {
    expect(fillStyle(-10).width).toBe('0%')
  })

  // The whole point of `from` is the starting position: the bar has to sit at
  // the pre-expense fill during the delay, not at zero.
  it('holds the animated fill at `from` until the tween runs', () => {
    const { getByTestId } = renderWithProviders(<ProgressBar pct={80} from={50} />)
    fireEvent(getByTestId('progress-bar-track'), 'layout', { nativeEvent: { layout: { width: 200 } } })
    const width = StyleSheet.flatten(getByTestId('progress-bar-fill').props.style).width
    expect((width as any)._value ?? width).toBe(100)
  })

  // A bar that crosses 75% mid-tween has to redden *while* it grows. Reading the
  // colour off the destination alone painted the end state from the first frame.
  it('hands the colour over as the animated fill crosses a threshold', () => {
    const { getByTestId } = renderWithProviders(<ProgressBar pct={80} from={50} />)
    fireEvent(getByTestId('progress-bar-track'), 'layout', { nativeEvent: { layout: { width: 200 } } })
    // Still at the 50% mark, so still mint — warn only arrives with the width.
    // An interpolated colour resolves to rgba(), so compare against that form.
    expect(StyleSheet.flatten(getByTestId('progress-bar-fill').props.style).backgroundColor).toBe(
      'rgba(31, 122, 77, 1)',
    )
  })
})
