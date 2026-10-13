import { parseLocalDate } from './date'
import { formatDate, formatDateShort } from './format'
import { lastSpentLabel } from '@/src/components/envelope/EnvelopeRow'

// Runs under UTC in the main suite and again under America/New_York and
// Asia/Kolkata via `npm run test:tz` (see jest.config.js). Every expectation
// here must hold in all three zones: a date-only string is a calendar day,
// never an instant.
describe(`date-only strings in ${process.env.TZ}`, () => {
  afterEach(() => jest.useRealTimers())

  it('parses YYYY-MM-DD as local midnight of that day', () => {
    const d = parseLocalDate('2026-11-01')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 1, 0])
  })

  it('still parses full timestamps as instants', () => {
    expect(parseLocalDate('2026-11-01T10:00:00Z').getTime()).toBe(Date.UTC(2026, 10, 1, 10))
  })

  it('returns an invalid date for garbage', () => {
    expect(Number.isNaN(parseLocalDate('nope').getTime())).toBe(true)
  })

  it('formats the same calendar day it was given', () => {
    expect(formatDate('2026-11-01')).toBe('1 Nov 2026')
    expect(formatDateShort('2026-10-04')).toBe('4 Oct')
  })

  it('counts last-spent days by calendar day, not elapsed hours', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 10, 18, 0) })
    expect(lastSpentLabel('2026-10-08')).toBe('2d ago')
    expect(lastSpentLabel('2026-10-09')).toBe('Yesterday')
    expect(lastSpentLabel('2026-08-01')).toBe('1 Aug')
  })
})
