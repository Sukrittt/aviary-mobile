const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Device-local calendar date ("YYYY-MM-DD") for a given instant. Everything the
 * user logs is dated by the day it is *for them*, matching how the server's
 * `nowIn(user.timezone)` dates the same user's cron work — see `syncTimezone`
 * in `src/api/account.ts`, which keeps the two zones aligned.
 */
export function toLocalDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today's device-local calendar date. */
export function todayLocal(): string {
  return toLocalDateString()
}

/**
 * Local date + full offset-suffixed timestamp for right now, minted on the
 * device (`2026-09-21T08:30:15+05:30`) — the same shape as Web's
 * `lib/http.ts::nowIn()`. Used so an offline expense is stamped with the day it
 * was actually logged, not the day the queue happens to flush.
 */
// Keep in sync with Web/lib/http.ts.
export function nowLocal(at: Date = new Date()): { date: string; timestamp: string } {
  const offset = -at.getTimezoneOffset()
  const abs = Math.abs(offset)
  const date = toLocalDateString(at)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  const suffix = `${offset < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  return { date, timestamp: `${date}T${time}${suffix}` }
}

/** The device's IANA timezone (e.g. `America/New_York`). */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Parse a server date. A bare `YYYY-MM-DD` is a calendar day, so it becomes
 * local midnight of that day; `new Date('2026-11-01')` would read it as UTC
 * midnight and show Oct 31 anywhere west of UTC. Full timestamps parse as-is.
 */
export function parseLocalDate(str: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(str)
}

/** "Today", "Yesterday", else "Saturday, 12 October" (plus the year when it isn't this one). */
export function formatDayLabel(iso: string, today: Date = new Date()): string {
  const d = parseLocalDate(iso)
  if (Number.isNaN(d.getTime())) return iso
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === toLocalDateString(today)) return 'Today'
  if (iso === toLocalDateString(yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  })
}

/** "1:30 pm" for a server timestamp, or '' when it doesn't parse. */
export function formatTime(timestamp: string): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
}
