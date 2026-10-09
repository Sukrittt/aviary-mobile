import * as Haptics from 'expo-haptics'

const RIPPLE_MS = 250
// The taptic engine smears ticks closer than ~20ms, so past this a longer
// list feels the same anyway.
const MAX_TICKS = 12

/** Tick times (ms) for a ripple of `count` items, evenly spread over `ms`. */
export function rippleTickTimes(count: number, ms = RIPPLE_MS): number[] {
  const n = Math.min(Math.max(count, 0), MAX_TICKS)
  return Array.from({ length: n }, (_, i) => Math.round((i * ms) / n))
}

/** One selection tick per item, landing on a light thud at `ms`, so a bigger batch reads as a longer roll. */
export function rippleHaptic(count: number, ms = RIPPLE_MS) {
  for (const t of rippleTickTimes(count, ms)) setTimeout(() => Haptics.selectionAsync().catch(() => {}), t)
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), ms)
}
