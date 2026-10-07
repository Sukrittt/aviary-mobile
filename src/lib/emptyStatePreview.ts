/**
 * Local visual-review switch for the illustrated empty states.
 *
 * Flip to true locally to see every screen's empty state with real data loaded.
 * Keep it false in commits: on, it blanks all data in every dev build (Expo Go).
 */
export const FORCE_EMPTY_STATE_PREVIEW = false

const PREVIEW_EMPTY: never[] = []

export function emptyForPreview<T>(rows: T[]): T[] {
  return FORCE_EMPTY_STATE_PREVIEW ? PREVIEW_EMPTY : rows
}
