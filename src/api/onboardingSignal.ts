// Tells the root layout the setup wizard just finished, so it can flip its
// local `onboarded` state — and with it the Stack.Protected guards — immediately
// instead of waiting for a re-fetch that only runs when hasSession changes.
// `elsewhere`: setup was finished on another device, so this one skips the
// trial notice (seen there) and goes straight Home.
type Listener = (opts: { elsewhere: boolean }) => void
const subs = new Set<Listener>()

export function onOnboarded(fn: Listener): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function signalOnboarded({ elsewhere = false }: { elsewhere?: boolean } = {}): void {
  for (const fn of subs) fn({ elsewhere })
}
