import { ADD_HINT_GAP_DAYS, addHintDue } from './useAddHint'

const DAY_MS = 86_400_000
const NOW = Date.parse('2026-10-30T12:00:00Z')
const ago = (days: number) => NOW - days * DAY_MS

describe('addHintDue', () => {
  it('shows for a first expense ever', () => {
    expect(addHintDue(null, null, NOW)).toBe(true)
    expect(addHintDue(null, undefined, NOW)).toBe(true)
  })

  it('stays quiet until the gap has passed, then shows', () => {
    expect(addHintDue(String(ago(ADD_HINT_GAP_DAYS - 1)), null, NOW)).toBe(false)
    expect(addHintDue(String(ago(ADD_HINT_GAP_DAYS)), null, NOW)).toBe(true)
  })

  it('goes by this device over the account when it has logged here', () => {
    expect(addHintDue(String(ago(1)), new Date(ago(300)).toISOString(), NOW)).toBe(false)
  })

  it('falls back to the first expense on a device with no log of its own', () => {
    expect(addHintDue(null, new Date(ago(300)).toISOString(), NOW)).toBe(true)
    expect(addHintDue(null, new Date(ago(2)).toISOString(), NOW)).toBe(false)
  })
})
