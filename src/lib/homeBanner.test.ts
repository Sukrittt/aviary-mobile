import { firstBanner } from './homeBanner'

describe('firstBanner', () => {
  it('picks the highest-priority banner that applies', () => {
    expect(firstBanner([['update', false, false], ['trial', true, false], ['rollover', true, false]])).toBe('trial')
  })

  it('skips a dismissed banner for the next one', () => {
    expect(firstBanner([['trial', true, true], ['rollover', true, false]])).toBe('rollover')
  })

  it('holds the slot while a higher banner is still loading its dismissal', () => {
    expect(firstBanner([['trial', true, null], ['rollover', true, false]])).toBeNull()
  })

  it('ignores a loading banner that does not apply', () => {
    expect(firstBanner([['trial', false, null], ['rollover', true, false]])).toBe('rollover')
  })

  it('shows nothing when nothing applies', () => {
    expect(firstBanner([['update', false, false], ['nudge', false, false]])).toBeNull()
  })
})
