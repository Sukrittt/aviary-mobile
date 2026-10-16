import { toLocalDateString, todayLocal, nowLocal, deviceTimezone, formatTime } from './date'

// Jest pins TZ=UTC (see jest.config.js), so "local" here is UTC.
describe('toLocalDateString', () => {
  it('uses the device calendar date, not a fixed offset', () => {
    expect(toLocalDateString(new Date(2026, 7, 31, 23, 30))).toBe('2026-08-31')
    expect(toLocalDateString(new Date(2026, 8, 1, 0, 5))).toBe('2026-09-01')
  })

  it('defaults to the current instant', () => {
    expect(todayLocal()).toBe(toLocalDateString())
  })
})

describe('nowLocal', () => {
  it('returns date plus an offset-suffixed timestamp', () => {
    expect(nowLocal(new Date(2026, 8, 21, 8, 30, 15))).toEqual({
      date: '2026-09-21',
      timestamp: '2026-09-21T08:30:15+00:00',
    })
  })

  it('formats west, east and half-hour offsets from getTimezoneOffset', () => {
    const at = (offsetMin: number) => Object.assign(new Date(2026, 8, 21, 8, 30, 15), { getTimezoneOffset: () => offsetMin })
    expect(nowLocal(at(420)).timestamp.endsWith('-07:00')).toBe(true) // Los Angeles
    expect(nowLocal(at(-330)).timestamp.endsWith('+05:30')).toBe(true) // India
    expect(nowLocal(at(-345)).timestamp.endsWith('+05:45')).toBe(true) // Nepal
  })
})

describe('deviceTimezone', () => {
  it('returns an IANA name', () => {
    expect(deviceTimezone()).toMatch(/^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/)
  })
})

describe('formatTime', () => {
  it('reads a timestamp as a short local time, and blanks a bad one', () => {
    expect(formatTime(new Date(2026, 9, 15, 13, 5).toISOString())).toMatch(/^1:05\s?pm$/)
    expect(formatTime('nope')).toBe('')
  })
})
