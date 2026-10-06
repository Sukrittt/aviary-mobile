/**
 * Local visual-review switch for the illustrated empty states.
 *
 * It is intentionally on for development builds and off for production and
 * tests. Remove the call sites (and this file) once the review is finished.
 */
export const FORCE_EMPTY_STATE_PREVIEW = __DEV__ && process.env.NODE_ENV !== 'test'

const PREVIEW_EMPTY: never[] = []

export function emptyForPreview<T>(rows: T[]): T[] {
  return FORCE_EMPTY_STATE_PREVIEW ? PREVIEW_EMPTY : rows
}
