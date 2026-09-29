// The server caps each account's monthly AI spend (Web/lib/ai/allowance.ts) and
// answers 429 with this code once it is spent. That is a different thing from
// the burst rate limiter's plain 429, and from a network error: retrying does
// nothing until the 1st, so the app says so instead of showing "try again".

import { track } from './analytics'

/** Matches `AI_ALLOWANCE_EXCEEDED` in Web/lib/ai/allowance.ts. */
export const AI_ALLOWANCE_EXCEEDED = 'AI_ALLOWANCE_EXCEEDED'

export class AiAllowanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiAllowanceError'
  }
}

export function isAiAllowanceError(err: unknown): err is AiAllowanceError {
  return err instanceof AiAllowanceError
}

const listeners = new Set<() => void>()

/** Called whenever a user-initiated AI request is refused for the allowance. Returns an unsubscribe function. */
export function onAiAllowanceExceeded(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Throws `AiAllowanceError` when `resp` is the allowance refusal, else does
 * nothing. `notify` opens the dedicated screen (see the root layout), so it is
 * for things the user just asked for — chat. Bill scan passes `false` too: its own
 * screen shows the allowance state. The automatic daily
 * brief passes `false`: an unprompted full-screen interruption for something
 * they never asked for is worse than a quiet note on the card.
 */
export async function rejectIfAllowanceExceeded(
  resp: Response,
  notify: boolean,
  feature: 'brief' | 'chat' | 'scan' = 'chat',
): Promise<void> {
  if (resp.status !== 429) return
  const body = await resp.clone().json().catch(() => null)
  if (body?.code !== AI_ALLOWANCE_EXCEEDED) return
  // How often the cap bites, and on what, is the input to pricing it.
  track('ai_allowance_hit', { feature })
  if (notify) for (const fn of listeners) fn()
  throw new AiAllowanceError(typeof body.error === 'string' ? body.error : "You've used this month's AI allowance.")
}

/** When the allowance resets: the first instant of next month, UTC — the server's month boundary. */
export function nextAllowanceReset(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}
