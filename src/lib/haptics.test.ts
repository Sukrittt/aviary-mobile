import { rippleTickTimes } from './haptics'

describe('rippleTickTimes', () => {
  it('gives one tick per item, starting immediately', () => {
    expect(rippleTickTimes(3)).toEqual([0, 83, 167])
  })

  it('caps long lists at 12 ticks inside the ripple window', () => {
    const times = rippleTickTimes(40)
    expect(times).toHaveLength(12)
    expect(Math.max(...times)).toBeLessThan(250)
  })

  it('gives no ticks for nothing to move', () => {
    expect(rippleTickTimes(0)).toEqual([])
  })
})
