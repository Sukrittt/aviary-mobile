// A queue snapshot is not ownership of an entry. Sync and Undo must re-read
// it while holding the same lock, including the POST/DELETE and disk writes.
const operations = new Map<string, Promise<unknown>>()

export function withExpenseLock<T>(owner: string, clientId: string, operation: () => Promise<T>): Promise<T> {
  const key = JSON.stringify([owner, clientId])
  const previous = operations.get(key) ?? Promise.resolve()
  const result = previous.catch(() => {}).then(operation)
  operations.set(key, result)
  void result.finally(() => {
    if (operations.get(key) === result) operations.delete(key)
  }).catch(() => {})
  return result
}
