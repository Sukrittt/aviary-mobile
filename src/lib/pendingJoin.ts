// An invite link (envelope://join/<code>) waiting for a signed-in app to open
// it. Set by app/+native-intent.ts, taken by BudgetAccessWatcher, which only
// mounts once signed in: a link tapped while signed out opens after sign-in.
// ponytail: memory only, so a link tapped signed out is lost if the app is killed before sign-in.

let pending: string | null = null
const subs = new Set<() => void>()

export function setPendingJoinCode(code: string): void {
  pending = code.toUpperCase()
  subs.forEach((fn) => fn())
}

export function takePendingJoinCode(): string | null {
  const code = pending
  pending = null
  return code
}

/** The waiting code, left in place: the root layout routes a new account to it instead of setup. */
export function peekPendingJoinCode(): string | null {
  return pending
}

export function onPendingJoinCode(fn: () => void): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

/** `ABC123` out of envelope://join/ABC123 or https://…/join/ABC123. */
export function joinCodeFromPath(path: string): string | null {
  return /(?:^|\/)join\/([A-Za-z0-9]{6})(?=$|[/?#])/.exec(path)?.[1]?.toUpperCase() ?? null
}
