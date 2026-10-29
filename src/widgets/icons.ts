// RemoteViews has no icon font support — SvgWidget takes a raw SVG string.
// Hand-written Lucide-style strokes; the in-app icons are Phosphor, which
// RemoteViews can't render as components.
export function plusSvg(strokeColor: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`
}

/** lucide TrendingUp / TrendingDown, same stroke style as the rest. */
export function trendingSvg(dir: 'up' | 'down', strokeColor: string): string {
  const body = dir === 'down' ? '<path d="M22 17l-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>' : '<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}

/** lucide ArrowRight. */
export function arrowRightSvg(strokeColor: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>`
}
