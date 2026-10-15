import type { ExpenseRow } from '@/src/types'

export type FeedItem =
  | { kind: 'day'; date: string }
  | { kind: 'card'; txn: ExpenseRow }

/** Rows arrive newest first; a day label goes ahead of each day's first card. */
export function groupByDay(rows: readonly ExpenseRow[]): FeedItem[] {
  const out: FeedItem[] = []
  let day = ''
  for (const txn of rows) {
    if (txn.date !== day) {
      day = txn.date
      out.push({ kind: 'day', date: day })
    }
    out.push({ kind: 'card', txn })
  }
  return out
}

// Every feed refetch re-signs every photo, and a new URL is a cache miss, so
// each image would reload on any write. Keep the first URL seen for a blob
// until shortly before it expires (the server signs feed URLs for an hour).
// Keyed by the path, which changes when a photo is replaced.
const REUSE_MS = 50 * 60 * 1000
const seen = new Map<string, { url: string; at: number }>()

export function stablePhotoUrl(url: string, now: number = Date.now()): string {
  const path = url.split('?')[0]
  const hit = seen.get(path)
  if (hit && now - hit.at < REUSE_MS) return hit.url
  seen.set(path, { url, at: now })
  return url
}
