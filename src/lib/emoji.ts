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
  'accentInk' | 'accentSoft' | 'warnInk' | 'warnSoft' | 'coral' | 'coralSoft' |
  'pink' | 'pinkSoft' | 'indigo' | 'indigoSoft' | 'brown' | 'brownSoft' | 'slate' | 'slateSoft'>

// A soft tint and the icon colour that sits on it, by the key a category or
// group stores when the user picks a colour (Web's src/lib/categoryColors.ts).
const TINTS = {
  mint: (t: TintTokens) => ({ bg: t.mintSoft, ink: t.mint }),
  violet: (t: TintTokens) => ({ bg: t.violetSoft, ink: t.violet }),
  blue: (t: TintTokens) => ({ bg: t.blueSoft, ink: t.blue }),
  accent: (t: TintTokens) => ({ bg: t.accentSoft, ink: t.accentInk }),
  warn: (t: TintTokens) => ({ bg: t.warnSoft, ink: t.warnInk }),
  coral: (t: TintTokens) => ({ bg: t.coralSoft, ink: t.coral }),
  pink: (t: TintTokens) => ({ bg: t.pinkSoft, ink: t.pink }),
  indigo: (t: TintTokens) => ({ bg: t.indigoSoft, ink: t.indigo }),
  brown: (t: TintTokens) => ({ bg: t.brownSoft, ink: t.brown }),
  slate: (t: TintTokens) => ({ bg: t.slateSoft, ink: t.slate }),
}
export type CategoryColor = keyof typeof TINTS
/** Picker order, by hue (Web's src/lib/categoryColors.ts). */
export const CATEGORY_COLORS: CategoryColor[] = [
  'coral', 'accent', 'warn', 'mint', 'blue', 'indigo', 'violet', 'pink', 'brown', 'slate',
]
/** Hash order: changing it recolours every category without a picked colour. */
const HASH_COLORS: CategoryColor[] = ['mint', 'violet', 'blue', 'accent', 'warn', 'coral']

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === 'string' && Object.hasOwn(TINTS, value)
}

export function colorTint(color: CategoryColor, tokens: TintTokens): { bg: string; ink: string } {
  return TINTS[color](tokens)
}

/** A category's colour: the one the user picked, else one cycled by a hash of the name's words (as on Web). */
export function categoryColor(name: string, color?: string): CategoryColor {
  if (isCategoryColor(color)) return color
  const text = splitEmoji(name).text
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return HASH_COLORS[hash % HASH_COLORS.length]
}

export function categoryTint(name: string, tokens: TintTokens, color?: string): { bg: string; ink: string } {
  return TINTS[categoryColor(name, color)](tokens)
}

/** A group's colour: the one the user picked, else the accent every group tile wore before colours. */
export function groupColor(color?: string): CategoryColor {
  return isCategoryColor(color) ? color : 'accent'
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
