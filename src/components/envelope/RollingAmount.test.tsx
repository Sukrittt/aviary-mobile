import { useState } from 'react'
import { act } from '@testing-library/react-native'
import { StyleSheet, View } from 'react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { RollingAmount, rollSteps } from './RollingAmount'

const tones = { up: { color: 'green', bg: 'mint' }, down: { color: 'red', bg: 'pink' } }
const amount = (play: number, from = 1000, to = 3050) => (
  <RollingAmount from={from} to={to} play={play} color="green" size={12} weight="bodySemiBold" tones={tones} />
)
const bg = (r: ReturnType<typeof renderWithProviders>) => StyleSheet.flatten(r.getByTestId('rolling-pill').props.style).backgroundColor

// Where measureInWindow reports the pill: on screen unless a test moves it.
let pillY = 100
beforeEach(() => {
  pillY = 100
  jest.useFakeTimers()
  jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (cb) { cb(0, pillY, 80, 20) })
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('rollSteps', () => {
  it('eases out and always lands exactly on the new amount', () => {
    const steps = rollSteps(1000, 3050)
    expect(steps).toHaveLength(5)
    expect(steps.at(-1)).toBe(3050)
    expect(steps[0] - 1000).toBeGreaterThan(steps[4] - steps[3])
  })
})

describe('RollingAmount', () => {
  it('just shows the amount when not playing', () => {
    const r = renderWithProviders(amount(0))
    expect(r.getByLabelText('₹3,050')).toBeTruthy()
  })

  it('holds the old amount while off screen, then ticks in once it scrolls into view', () => {
    pillY = 5000
    const r = renderWithProviders(amount(1))
    act(() => jest.advanceTimersByTime(3000))
    expect(r.getByLabelText('₹1,000')).toBeTruthy()
    expect(bg(r)).toBe('mint')

    pillY = 100
    act(() => jest.advanceTimersByTime(3500))
    expect(r.getByLabelText('₹3,050')).toBeTruthy()
    expect(bg(r)).toBeUndefined()
  })

  it('is red while a shortfall counts down', () => {
    pillY = 5000
    const r = renderWithProviders(amount(1, 8000, 7450))
    expect(r.getByLabelText('₹8,000')).toBeTruthy()
    expect(bg(r)).toBe('pink')
  })

  it('starts over from the old amount on the next play', () => {
    // A harness owns `play`, since rerender would drop renderWithProviders' providers.
    let replay = () => {}
    function Harness() {
      const [play, setPlay] = useState(1)
      replay = () => setPlay((p) => p + 1)
      return amount(play)
    }
    const r = renderWithProviders(<Harness />)
    act(() => jest.advanceTimersByTime(3500))
    expect(r.getByLabelText('₹3,050')).toBeTruthy()
    act(() => replay())
    expect(r.getByLabelText('₹1,000')).toBeTruthy()
  })
})
