import { sampleSteps, scrubDay } from './LineChart'

it('samples the held value at even steps, unsoftened', () => {
  const data = [{ x: 0, y: 100 }, { x: 5, y: 250 }, { x: 10, y: 250 }]
  expect(sampleSteps(data, 11, 0)).toEqual([100, 100, 100, 100, 100, 250, 250, 250, 250, 250, 250])
})

it('softens a jump into a ramp without moving flat ends', () => {
  const ys = sampleSteps([{ x: 0, y: 0 }, { x: 5, y: 30 }, { x: 10, y: 30 }], 11, 1)
  expect(ys[0]).toBe(0)
  expect(ys.at(-1)).toBe(30)
  expect(ys.slice(3, 7)).toEqual([0, 10, 20, 30])
})

// Local midnights: scrubbing snaps to the calendar day the pill shows.
const day = (n: number) => new Date(2026, 0, 1 + n).getTime()

it('snaps the touch to the nearest local day, inside the data', () => {
  expect(scrubDay(day(0), day(10), 0.31)).toBe(day(3))
  expect(scrubDay(day(0), day(10), 0.36)).toBe(day(4))
  expect(scrubDay(day(0), day(10), -1)).toBe(day(0))
  expect(scrubDay(day(0), day(10), 2)).toBe(day(10))
})
