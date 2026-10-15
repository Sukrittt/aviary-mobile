import type { HoldingEventRow, HoldingRow } from '@/src/types'

export interface NetWorthPoint {
  /** Epoch ms. */
  t: number
  value: number
}

/** Net worth over time, rebuilt by walking holding events backward from the
 *  current values. Events for holdings that no longer exist (deleted/renamed)
 *  are skipped, and value edits made outside an event are folded into the
 *  starting point. Starts at the first event's result. Empty when there's no event history to draw. */
export function netWorthHistory(holdings: HoldingRow[], events: HoldingEventRow[], now = Date.now()): NetWorthPoint[] {
  const values = new Map(holdings.map((h) => [h.name, Number(h.value) || 0]))
  const relevant = events
    .filter((e) => values.has(e.holding_name))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  if (relevant.length === 0) return []

  const total = () => Array.from(values.values()).reduce((s, v) => s + v, 0)
  const points: NetWorthPoint[] = [{ t: now, value: total() }]
  for (let i = relevant.length - 1; i >= 0; i--) {
    const e = relevant[i]
    points.push({ t: Date.parse(e.timestamp), value: total() })
    values.set(e.holding_name, Number(e.previous_value) || 0)
  }
  return points.reverse()
}

/** Net worth at `t`. Values only move at events, so it's the last point at or
 *  before `t` (the first point's value before history starts). */
export function valueAt(points: NetWorthPoint[], t: number): number {
  let v = points[0]?.value ?? 0
  for (const p of points) {
    if (p.t > t) break
    v = p.value
  }
  return v
}

/** The history from `from` on, opened with the value held at `from` so the
 *  line starts at the range's left edge. */
export function historySince(points: NetWorthPoint[], from: number): NetWorthPoint[] {
  if (points.length === 0 || from <= points[0].t) return points
  return [{ t: from, value: valueAt(points, from) }, ...points.filter((p) => p.t > from)]
}

/** Percent change from `start`, or null when the base is too small for a
 *  percentage to mean anything (₹10 to ₹200 isn't a useful "1900%"). */
export function percentChange(start: number, end: number): number | null {
  if (start <= 0) return null
  const pct = ((end - start) / start) * 100
  return Math.abs(pct) >= 1000 ? null : pct
}

/** `date` minus `months`, landing on the last day of a shorter month instead
 *  of overflowing past it (31 Mar minus 1 is 28 Feb, not 3 Mar). */
export function monthsBefore(date: Date, months: number): Date {
  const d = new Date(date)
  d.setDate(1)
  d.setMonth(d.getMonth() - months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(date.getDate(), lastDay))
  return d
}
