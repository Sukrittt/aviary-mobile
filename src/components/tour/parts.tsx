import type { ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/shared/CategoryIcon'
import type { CategoryIconKey } from '@/src/lib/categoryIcons'

/** The small uppercase caption the tour uses above a block of demo rows. */
export function SectionLabel({ children }: { children: string }) {
  const { tokens, type, space } = useTheme()
  return (
    <Text
      style={[
        styles.sectionLabel,
        { color: tokens.text3, fontFamily: fontFamily.bodyBold, fontSize: type.micro, paddingTop: space.xs },
      ]}
    >
      {children}
    </Text>
  )
}

/** A demo tile's glyph, from the same Phosphor set real categories wear. */
export function TourIcon({ icon, size = 18, color }: { icon: CategoryIconKey; size?: number; color?: string }) {
  const { tokens } = useTheme()
  const Glyph = CATEGORY_ICON_COMPONENTS[icon]
  return <Glyph size={size} color={color ?? tokens.text2} />
}

/**
 * One demo row: icon tile, name, a note under it, and whatever the chapter
 * wants on the right. Shared by the assign, move and rollover demos, which are
 * the same row with a different right-hand side.
 */
export function TourRow({
  icon,
  name,
  note,
  noteColor,
  right,
  highlight,
}: {
  icon: CategoryIconKey
  name: string
  note: string
  noteColor?: string
  right: ReactNode
  highlight?: boolean
}) {
  const { tokens, radius, space, type } = useTheme()
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: highlight ? tokens.accentSoft : tokens.cardSolid,
          borderColor: highlight ? tokens.accent : tokens.border,
          borderRadius: radius.md,
          padding: space.md,
          gap: space.md,
        },
      ]}
    >
      <View style={[styles.tile, { backgroundColor: tokens.inputBg, borderRadius: radius.sm }]}>
        <TourIcon icon={icon} />
      </View>
      <View style={styles.rowBody}>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ color: noteColor ?? tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
          {note}
        </Text>
      </View>
      {right}
    </View>
  )
}

/** Flat mint or accent callout the chapters drop under a completed action. */
export function ResultCard({ tone, children }: { tone: 'mint' | 'accent'; children: ReactNode }) {
  const { tokens, radius, space } = useTheme()
  return (
    <View
      style={{
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        backgroundColor: tone === 'mint' ? tokens.mintSoft : tokens.accentSoft,
        borderColor: tone === 'mint' ? tokens.mint : tokens.accent,
      }}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  sectionLabel: { letterSpacing: 1, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  tile: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
})
