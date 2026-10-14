// Non-color design tokens. Scheme-independent, so these are plain constants
// rather than part of ThemeTokens — but they are re-exported from useTheme()
// so a component only needs one hook to style itself.

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const

export const type = {
  micro: 12,
  caption: 13,
  body: 15,
  bodyLg: 17,
  title: 22,
  heading: 28,
  display: 40,
  hero: 56,
} as const

export const motion = {
  fast: 140,
  base: 220,
  slow: 380,
  /** Default press/enter spring. Reanimated `withSpring` config. */
  spring: { damping: 15, stiffness: 180 },
  /** Snappier variant for small elements (chips, icons). */
  springTight: { damping: 18, stiffness: 260 },
} as const

/**
 * Shadow presets. iOS reads shadow*, Android reads elevation — both are set.
 * `floating` is the detached nav circles; they sit on arbitrary content and
 * need to separate from it without a bar or scrim behind them.
 */
export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const

/**
 * Height occupied by the floating nav backdrop (including its shadow bleed
 * and bottom gap). Screens add their normal page spacing after this so the
 * final row can scroll completely above the nav.
 */
export const NAV_HEIGHT = 110
