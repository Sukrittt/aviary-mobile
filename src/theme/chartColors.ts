import type { ThemeTokens } from './tokens'

// Shared color cycle for anything that assigns one color per category/type/segment:
// investments' allocation bar and subscriptions' rows. The category-breakdown donut
// uses CATEGORY_CHART_COLORS instead.
// Kept in one place so they don't drift out of sync with each other.
export const CHART_COLOR_CYCLE: (keyof ThemeTokens)[] = ['blue', 'mint', 'violet', 'accent', 'coral', 'warn']

/** The category-breakdown donut's palette (tokens chart1..chart8), as on Web. */
export const CATEGORY_CHART_COLORS = ['chart1', 'chart2', 'chart3', 'chart4', 'chart5', 'chart6', 'chart7', 'chart8'] as const

/** A category's (or group's) wedge colour: its position in the user's own list,
 *  so the first eight never share a colour and a colour doesn't move with this
 *  month's spend rank. Keys missing from the list fall back to a name hash. */
// ponytail: reordering the list repaints wedges; a stored per-category colour fixes that once the picker lands.
export function categoryChartColor(key: string, order: readonly string[], tokens: ThemeTokens): string {
  let index = order.indexOf(key)
  if (index < 0) {
    // Same hash as Web's avatarHash, so both apps pick the same fallback.
    index = 0
    for (let i = 0; i < key.length; i++) index = (index * 31 + key.charCodeAt(i)) >>> 0
  }
  return tokens[CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length]]
}
