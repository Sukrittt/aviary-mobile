// The Aviary bird mark, in its 512-unit artboard. Kept free of react-native
// imports so the headless widget task can draw it without pulling in
// react-native-svg (see src/widgets/bird.ts).
export const BIRD_BODY_PATH =
  'M 352 212 L 404 248 L 352 284 A 110 110 0 0 1 146 288 L 86 164 L 162 178 A 110 110 0 0 1 352 212 Z'
export const BIRD_EYE = { cx: 306, cy: 216, r: 19 } as const
/** Body with the eye punched out (fillRule evenodd). */
export const BIRD_PATH = `${BIRD_BODY_PATH} M 287 216 A 19 19 0 1 1 325 216 A 19 19 0 1 1 287 216 Z`
