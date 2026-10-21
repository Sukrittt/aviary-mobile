import { useEffect, useState } from 'react'
import { count, listFailed, onChange, type PendingExpense } from '@/src/lib/pendingExpenses'

/** What this device holds that the server doesn't have yet: still queued, and given up on. Live. */
export function useUnsyncedExpenses(): { pending: number; failed: PendingExpense[] } {
  const [state, setState] = useState<{ pending: number; failed: PendingExpense[] }>({ pending: 0, failed: [] })
  useEffect(() => {
    let alive = true
    const load = () => {
      Promise.all([count(), listFailed()])
        .then(([pending, failed]) => { if (alive) setState({ pending, failed }) })
        .catch(() => {})
    }
    load()
    const off = onChange(load)
    return () => { alive = false; off() }
  }, [])
  return state
}
