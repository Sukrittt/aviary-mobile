import { groupByDay, stablePhotoUrl } from './activityFeed'
import type { ExpenseRow } from '@/src/types'

const row = (id: string, date: string) => ({ id, date, item: id }) as ExpenseRow

describe('groupByDay', () => {
  it('puts one day label ahead of each run of same-day rows', () => {
    const items = groupByDay([row('a', '2026-10-12'), row('b', '2026-10-12'), row('c', '2026-10-11')])
    expect(items.map((i) => (i.kind === 'day' ? i.date : i.txn.id))).toEqual(['2026-10-12', 'a', 'b', '2026-10-11', 'c'])
  })

  it('is empty for no rows', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('stablePhotoUrl', () => {
  it('keeps the first signed URL for a photo while it is still fresh', () => {
    const first = stablePhotoUrl('https://blob.test/u/e1-a.jpg?sig=1', 0)
    expect(stablePhotoUrl('https://blob.test/u/e1-a.jpg?sig=2', 10 * 60 * 1000)).toBe(first)
  })

  it('takes the new URL once the old one is close to expiring', () => {
    stablePhotoUrl('https://blob.test/u/e2-a.jpg?sig=1', 0)
    expect(stablePhotoUrl('https://blob.test/u/e2-a.jpg?sig=2', 51 * 60 * 1000)).toBe('https://blob.test/u/e2-a.jpg?sig=2')
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
