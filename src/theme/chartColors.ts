import type { ThemeTokens } from './tokens'

// Shared color cycle for anything that assigns one color per category/type/segment:
// investments' allocation bar and subscriptions' rows. The category-breakdown donut
// uses categoryTint instead, so each category matches its icon tile on Home.
// Kept in one place so they don't drift out of sync with each other.
export const CHART_COLOR_CYCLE: (keyof ThemeTokens)[] = ['blue', 'mint', 'violet', 'accent', 'coral', 'warn']
