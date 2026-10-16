import type { ThemeTokens } from '@/src/theme/tokens'
// Category/group names from the API may embed a legacy emoji as the leading
// character (e.g. "🏠 Rent"). splitEmoji() pulls that out; categoryIcons.ts
// maps it to an icon.
// Skin-tone modifiers ride along, so "👨🏽‍🍳 Cook" splits to "Cook".
const LEADING_EMOJI_RE = /^(\p{Extended_Pictographic}\p{Emoji_Modifier}?(?:️|‍\p{Extended_Pictographic}\p{Emoji_Modifier}?)*)\s*/u

export function splitEmoji(raw: string): { icon: string; text: string } {
  const trimmed = raw.trim()
  const match = trimmed.match(LEADING_EMOJI_RE)
  if (match) {
    const text = trimmed.slice(match[0].length).trim()
    if (text) return { icon: match[1], text }
  }
  return { icon: '', text: trimmed }
}

type TintTokens = Pick<ThemeTokens,
  'mint' | 'mintSoft' | 'violet' | 'violetSoft' | 'blue' | 'blueSoft' |
  'accentInk' | 'accentSoft' | 'warnInk' | 'warnSoft' | 'coral' | 'coralSoft'>

// A soft tint and the icon colour that sits on it, cycled by a hash of the
// name's words (as on Web) so one category is never two colours.
const TINTS: ((t: TintTokens) => { bg: string; ink: string })[] = [
  (t) => ({ bg: t.mintSoft, ink: t.mint }),
  (t) => ({ bg: t.violetSoft, ink: t.violet }),
  (t) => ({ bg: t.blueSoft, ink: t.blue }),
  (t) => ({ bg: t.accentSoft, ink: t.accentInk }),
  (t) => ({ bg: t.warnSoft, ink: t.warnInk }),
  (t) => ({ bg: t.coralSoft, ink: t.coral }),
]

export function categoryTint(name: string, tokens: TintTokens): { bg: string; ink: string } {
  const text = splitEmoji(name).text
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return TINTS[hash % TINTS.length](tokens)
}

// Light mode's inks are dark enough to carry an icon glyph but read loud as a
// big donut wedge on a white card, so chart fills sit 15% toward white. Dark
// mode's inks are already the bright set and pass through.
const CHART_SOFTEN = 0.15

export function chartInk(ink: string, scheme: 'light' | 'dark'): string {
  if (scheme === 'dark' || !/^#[0-9a-f]{6}$/i.test(ink)) return ink
  const n = parseInt(ink.slice(1), 16)
  const ch = (v: number) => Math.round(v + (255 - v) * CHART_SOFTEN).toString(16).padStart(2, '0')
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}
