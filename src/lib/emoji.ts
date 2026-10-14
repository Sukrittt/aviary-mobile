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
