// Every icon a category or group can wear, keyed by its Phosphor name (the
// keys of CATEGORY_ICONS in src/lib/categoryIcons.ts). Drawn from generated
// regular-weight paths (scripts/gen-category-icon-paths.mjs), not Phosphor's
// modules: those carry all six weights, ~650 KB for this catalog.
import Svg, { Path } from 'react-native-svg'
import type { IconWeight } from './icons'
import { CATEGORY_ICON_PATHS } from './categoryIconPaths'
import { categoryIconKey, groupIconKey, type CategoryIconKey } from '@/src/lib/categoryIcons'

type GlyphProps = {
  size?: number
  color?: string
  /** Only regular is generated; accepted so call sites match Phosphor's. */
  weight?: IconWeight
}
export type CategoryGlyph = (props: GlyphProps) => React.JSX.Element

function glyph(key: CategoryIconKey): CategoryGlyph {
  const Glyph = ({ size = 24, color = '#000' }: GlyphProps) => (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill={color}>
      <Path d={CATEGORY_ICON_PATHS[key]} />
    </Svg>
  )
  Glyph.displayName = `${key}Glyph`
  return Glyph
}

export const CATEGORY_ICON_COMPONENTS = Object.fromEntries(
  (Object.keys(CATEGORY_ICON_PATHS) as CategoryIconKey[]).map((key) => [key, glyph(key)]),
) as Record<CategoryIconKey, CategoryGlyph>

interface Props {
  /** The category's (or group's) full name, emoji and all. */
  name: string
  /** The icon the user picked, from the category's or group's `icon` field. */
  icon?: string
  group?: string
  kind?: 'category' | 'group'
  size?: number
  color?: string
  weight?: IconWeight
}

/** A category's icon, resolved from its picked icon, emoji or name. */
export function CategoryIcon({ name, icon, group, kind = 'category', size = 18, color, weight = 'regular' }: Props) {
  const key = kind === 'group' ? groupIconKey(name, icon) : categoryIconKey(name, icon, group)
  const Icon = CATEGORY_ICON_COMPONENTS[key]
  return <Icon size={size} color={color} weight={weight} />
}
