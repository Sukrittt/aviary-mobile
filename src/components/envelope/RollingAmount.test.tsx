import { act, render } from '@testing-library/react-native'
import { View } from 'react-native'
import { RollingAmount } from './RollingAmount'

const money = (n: number) => `₹${n}`
const amount = (play: number) => <RollingAmount from={1000} to={3050} play={play} format={money} />

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

const tones = { up: { color: 'green', bg: 'mint' }, down: { color: 'red', bg: 'pink' } }

describe('RollingAmount', () => {
  it('is red while a shortfall counts down, then settles into its own color', () => {
    const { getByText } = render(<RollingAmount from={8000} to={7450} play={1} format={money} tones={tones} textStyle={{ color: 'green' }} />)
    expect(getByText('₹8000')).toHaveStyle({ color: 'red' })
    act(() => jest.advanceTimersByTime(2500))
    expect(getByText('₹7450')).toHaveStyle({ color: 'green' })
  })

  it('just shows the amount when not playing', () => {
    const { getByText } = render(amount(0))
    expect(getByText('₹3050')).toBeTruthy()
  })

  it('holds the old amount while off screen, then counts in once it scrolls into view', () => {
    pillY = 5000
    const { getByText } = render(amount(1))
    act(() => jest.advanceTimersByTime(1000))
    expect(getByText('₹1000')).toBeTruthy()

    pillY = 100
    act(() => jest.advanceTimersByTime(2500))
    expect(getByText('₹3050')).toBeTruthy()
  })

  it('starts over from the old amount on the next play', () => {
    const { getByText, rerender } = render(amount(1))
    act(() => jest.advanceTimersByTime(2500))
    expect(getByText('₹3050')).toBeTruthy()
    rerender(amount(2))
    expect(getByText('₹1000')).toBeTruthy()
  })
})
