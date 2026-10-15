import { netWorthHistory, valueAt, historySince, percentChange } from './netWorthHistory'
import type { HoldingEventRow, HoldingRow } from '@/src/types'

const holding = (name: string, value: number) => ({ name, value: String(value) }) as HoldingRow
const event = (holding_name: string, previous_value: number, new_value: number, timestamp: string) =>
  ({ holding_name, previous_value: String(previous_value), new_value: String(new_value), timestamp }) as HoldingEventRow

const NOW = Date.parse('2026-10-03T00:00:00Z')

// Starts at the first event, not a same-instant point before it (that drew
// a vertical hook at the chart's left edge).
it('walks back from current values through each event', () => {
  const points = netWorthHistory(
    [holding('A', 150), holding('B', 50)],
    [
      event('A', 100, 120, '2026-09-01T00:00:00Z'),
      event('A', 120, 150, '2026-09-10T00:00:00Z'),
    ],
    NOW,
  )
  expect(points.map((p) => p.value)).toEqual([170, 200, 200])
  expect(points.at(-1)!.t).toBe(NOW)
})

it('sorts events by time regardless of input order', () => {
  const points = netWorthHistory(
    [holding('A', 150)],
    [
      event('A', 120, 150, '2026-09-10T00:00:00Z'),
      event('A', 100, 120, '2026-09-01T00:00:00Z'),
    ],
    NOW,
  )
  expect(points.map((p) => p.value)).toEqual([120, 150, 150])
})

it('ignores events for holdings that no longer exist', () => {
  const points = netWorthHistory(
    [holding('A', 100)],
    [event('Gone', 0, 500, '2026-09-01T00:00:00Z'), event('A', 80, 100, '2026-09-02T00:00:00Z')],
    NOW,
  )
  expect(points.map((p) => p.value)).toEqual([100, 100])
})

it('returns nothing without events', () => {
  expect(netWorthHistory([holding('A', 100)], [], NOW)).toEqual([])
})

describe('valueAt', () => {
  const points = [
    { t: 10, value: 100 },
    { t: 20, value: 150 },
    { t: 30, value: 150 },
  ]
  // Values only change at events, so between points it holds the last one.
  it('holds the last value at or before t', () => {
    expect(valueAt(points, 10)).toBe(100)
    expect(valueAt(points, 19)).toBe(100)
    expect(valueAt(points, 20)).toBe(150)
    expect(valueAt(points, 99)).toBe(150)
  })
  it('uses the first value before history starts', () => {
    expect(valueAt(points, 0)).toBe(100)
  })
})

describe('historySince', () => {
  const points = [
    { t: 10, value: 100 },
    { t: 20, value: 150 },
    { t: 30, value: 150 },
  ]
  it('starts the range at the value held on its first day', () => {
    expect(historySince(points, 15)).toEqual([
      { t: 15, value: 100 },
      { t: 20, value: 150 },
      { t: 30, value: 150 },
    ])
  })
  it('keeps everything when the range reaches past the first event', () => {
    expect(historySince(points, 5)).toEqual(points)
  })
  it('stays a flat line when nothing changed inside the range', () => {
    expect(historySince(points, 25)).toEqual([
      { t: 25, value: 150 },
      { t: 30, value: 150 },
    ])
  })
})

describe('percentChange', () => {
  it('is the change over the start', () => {
    expect(percentChange(200, 250)).toBe(25)
    expect(percentChange(200, 150)).toBe(-25)
  })
  // A tiny base makes a meaningless number (Fold's "631.9%").
  it('is null from a zero, negative or tiny base', () => {
    expect(percentChange(0, 100)).toBeNull()
    expect(percentChange(-50, 100)).toBeNull()
    expect(percentChange(10, 200)).toBeNull()
  })
})
