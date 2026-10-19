import { useState, type ReactNode } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Check, MagnifyingGlass, PencilSimple } from './icons'
import { CATEGORY_ICON_COMPONENTS } from './CategoryIcon'
import { BottomSheet } from './Modal'
import { searchCategoryIcons, type CategoryIconKey } from '@/src/lib/categoryIcons'
import { CATEGORY_COLORS, colorTint, type CategoryColor } from '@/src/lib/emoji'

/** "ForkKnife" → "Fork knife", for accessibility labels. */
export function iconLabel(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The tile beside a category's (or group's) name: shows its icon on its tint
 * and, tapped, opens a searchable grid of every catalog icon in its own sheet,
 * stacked over whichever sheet the tile lives in.
 */
export function CategoryIconPicker({ value, onChange, tint, disabled, children }: {
  value: CategoryIconKey
  onChange: (key: CategoryIconKey) => void
  /** The tile's background and icon colour, from categoryTint(). */
  tint: { bg: string; ink: string }
  disabled?: boolean
  /** The name input, laid out beside the tile. */
  children: ReactNode
}) {
  const { tokens } = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const Current = CATEGORY_ICON_COMPONENTS[value]
  const matches = searchCategoryIcons(query)

  function close() {
    setOpen(false)
    setQuery('')
  }

  function pick(key: CategoryIconKey) {
    onChange(key)
    close()
  }

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={() => setOpen(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Icon: ${iconLabel(value)}. Change icon`}
          accessibilityState={{ expanded: open }}
          style={[styles.tile, { backgroundColor: tint.bg, borderColor: tokens.borderStrong }]}
        >
          <Current size={24} color={tint.ink} />
          <View style={[styles.badge, { backgroundColor: tokens.card, borderColor: tokens.borderStrong }]}>
            <PencilSimple size={10} weight="bold" color={tokens.text} />
          </View>
        </Pressable>
        {children}
      </View>
      <BottomSheet visible={open} onClose={close}>
        <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Pick an icon</Text>
        <View style={[styles.search, { backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong }]}>
          <MagnifyingGlass size={16} color={tokens.text3} />
          <TextInput
            style={[styles.searchInput, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search icons"
            placeholderTextColor={tokens.text3}
            accessibilityLabel="Search icons"
            returnKeyType="done"
            onSubmitEditing={() => matches[0] && pick(matches[0])}
          />
        </View>
        {matches.length ? (
          <View style={styles.grid}>
            {matches.map((key) => {
              const Icon = CATEGORY_ICON_COMPONENTS[key]
              const on = key === value
              return (
                <Pressable
                  key={key}
                  onPress={() => pick(key)}
                  accessibilityRole="button"
                  accessibilityLabel={iconLabel(key)}
                  accessibilityState={{ selected: on }}
                  style={styles.cell}
                >
                  <View style={[styles.option, on && { backgroundColor: tokens.accentSoft }]}>
                    <Icon size={24} color={on ? tokens.accentInk : tokens.text} />
                  </View>
                </Pressable>
              )
            })}
          </View>
        ) : (
          <Text style={[styles.empty, { color: tokens.text3 }]}>No icons match that. Try another word.</Text>
        )}
      </BottomSheet>
    </View>
  )
}

const COLOR_LABELS: Record<CategoryColor, string> = {
  mint: 'Green', violet: 'Purple', blue: 'Blue', accent: 'Orange', warn: 'Yellow', coral: 'Red',
}

/** A row of the six tints, for picking a category's or group's colour. */
export function ColorSwatches({ value, onChange, disabled }: {
  value: CategoryColor
  onChange: (color: CategoryColor) => void
  disabled?: boolean
}) {
  const { tokens } = useTheme()
  return (
    <View style={styles.swatches} accessibilityRole="radiogroup">
      {CATEGORY_COLORS.map((color) => {
        const { bg, ink } = colorTint(color, tokens)
        const on = color === value
        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={COLOR_LABELS[color]}
            accessibilityState={{ selected: on }}
            hitSlop={4}
            style={[styles.swatch, { backgroundColor: bg, borderColor: on ? ink : 'transparent' }]}
          >
            <View style={[styles.swatchDot, { backgroundColor: ink }]}>
              {on && <Check size={14} weight="bold" color={tokens.cardSolid} />}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  tile: { width: 52, minHeight: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge: { position: 'absolute', right: -5, bottom: -5, width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  // Six equal columns; the highlight is a fixed square centred in each, so it
  // stays square on any width instead of stretching to the column.
  cell: { width: `${100 / 6}%`, height: 56, alignItems: 'center', justifyContent: 'center' },
  option: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 13, paddingVertical: 8, fontFamily: fontFamily.bodySemiBold },
})
