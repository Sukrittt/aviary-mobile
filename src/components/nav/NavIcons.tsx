import { FolderOpen, House, Plus, Receipt, User, type IconWeight } from '@/src/components/shared/icons'

/**
 * The nav's own icon set: Phosphor glyphs, "regular" when idle and "fill" on
 * the selected tab so the active slot reads at a glance, not by color alone.
 * Plus stays bold in both states; it sits on a solid disc either way.
 */
export type NavGlyphProps = { size: number; color: string; weight?: IconWeight }
export type NavIconComponent = (props: NavGlyphProps) => React.ReactElement

export const HomeGlyph: NavIconComponent = (props) => <House {...props} />
export const ActivityGlyph: NavIconComponent = (props) => <Receipt {...props} />
export const EnvelopeGlyph: NavIconComponent = (props) => <FolderOpen {...props} />
export const ProfileGlyph: NavIconComponent = (props) => <User {...props} />
export const PlusGlyph: NavIconComponent = ({ size, color }) => <Plus size={size} color={color} weight="bold" />
