import { groupByDay, incomesInWindow, stablePhotoUrl, type FeedItem } from './activityFeed'
import type { ExpenseRow, IncomeRow } from '@/src/types'

const row = (id: string, date: string) => ({ id, date, item: id }) as ExpenseRow
const inc = (id: string, date: string) => ({ id, date, label: id }) as IncomeRow
const ids = (items: FeedItem[]) =>
  items.map((i) => (i.kind === 'day' ? i.date : i.kind === 'card' ? i.txn.id : i.income.id))

describe('groupByDay', () => {
  it('puts one day label ahead of each run of same-day rows', () => {
    const items = groupByDay([row('a', '2026-10-12'), row('b', '2026-10-12'), row('c', '2026-10-11')])
    expect(ids(items)).toEqual(['2026-10-12', 'a', 'b', '2026-10-11', 'c'])
  })

  it('slots income in by date, ahead of that day\'s spends', () => {
    const items = groupByDay(
      [row('a', '2026-10-12'), row('b', '2026-10-10')],
      [inc('old', '2026-10-01'), inc('pay', '2026-10-12'), inc('mid', '2026-10-11')],
    )
    expect(ids(items)).toEqual(['2026-10-12', 'pay', 'a', '2026-10-11', 'mid', '2026-10-10', 'b', '2026-10-01', 'old'])
  })

  it('is empty for no rows', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('incomesInWindow', () => {
  const rows = [row('a', '2026-10-12'), row('b', '2026-10-05')]
  const incomes = [inc('new', '2026-10-15'), inc('in', '2026-10-08'), inc('old', '2026-10-01')]

  it('keeps everything when the whole feed is loaded', () => {
    expect(incomesInWindow(incomes, rows, { hasNewer: false, hasOlder: false }).map((i) => i.id)).toEqual(['new', 'in', 'old'])
  })

  it('holds back income older or newer than the loaded pages', () => {
    expect(incomesInWindow(incomes, rows, { hasNewer: true, hasOlder: true }).map((i) => i.id)).toEqual(['in'])
  })
})

describe('stablePhotoUrl', () => {
  it('keeps the first signed URL for a photo while it is still fresh', () => {
    const first = stablePhotoUrl('https://blob.test/u/e1-a.jpg?sig=1', 0)
    expect(stablePhotoUrl('https://blob.test/u/e1-a.jpg?sig=2', 10 * 60 * 1000)).toBe(first)
  })

  it('takes the new URL before the old one can expire', () => {
    // The server may hand out a URL with only 30 of its 60 minutes left.
    stablePhotoUrl('https://blob.test/u/e2-a.jpg?sig=1', 0)
    expect(stablePhotoUrl('https://blob.test/u/e2-a.jpg?sig=2', 26 * 60 * 1000)).toBe('https://blob.test/u/e2-a.jpg?sig=2')
  })

  it('treats a replaced photo (new path) as new', () => {
    stablePhotoUrl('https://blob.test/u/e3-a.jpg?sig=1', 0)
    expect(stablePhotoUrl('https://blob.test/u/e3-b.jpg?sig=1', 1000)).toBe('https://blob.test/u/e3-b.jpg?sig=1')
  })

  it('forgets the oldest photos past its cap instead of growing forever', () => {
    stablePhotoUrl('https://blob.test/u/old.jpg?sig=1', 0)
    for (let i = 0; i < 500; i++) stablePhotoUrl(`https://blob.test/u/p${i}.jpg?sig=1`, 0)
    expect(stablePhotoUrl('https://blob.test/u/old.jpg?sig=2', 1000)).toBe('https://blob.test/u/old.jpg?sig=2')
  })
})
