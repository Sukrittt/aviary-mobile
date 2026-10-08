export type ExpenseSynced = { owner: string; generation: number }
const listeners = new Set<(event: ExpenseSynced) => void>()

/** A headless drain has no query client; a mounted app can subscribe to its writes. */
export function onExpenseSynced(listener: (event: ExpenseSynced) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function emitExpenseSynced(event: ExpenseSynced): void {
  for (const listener of listeners) {
    // An observer must never prevent removing a successfully saved queue entry.
    try { listener(event) } catch { /* Other subscribers still receive the write. */ }
  }
}
