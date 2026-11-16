import { useEffect, useState } from 'react'
import { list, listFailed, onChange, type PendingExpense } from '@/src/lib/pendingExpenses'

type Unsynced = { pending: number; queued: PendingExpense[]; failed: PendingExpense[] }

/** What this device holds that the server doesn't have yet: still queued, and given up on. Live. */
export function useUnsyncedExpenses(): Unsynced {
  const [state, setState] = useState<Unsynced>({ pending: 0, queued: [], failed: [] })
  useEffect(() => {
    let alive = true
    const load = () => {
      Promise.all([list(), listFailed()])
        .then(([queued, failed]) => { if (alive) setState({ pending: queued.length, queued, failed }) })
        .catch(() => {})
    }
    load()
    const off = onChange(load)
    return () => { alive = false; off() }
  }, [])
  return state
}
