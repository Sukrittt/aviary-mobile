import { useState, type ReactNode } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { MagnifyingGlass, PencilSimple } from './icons'
import { CATEGORY_ICON_COMPONENTS } from './CategoryIcon'
import { searchCategoryIcons, type CategoryIconKey } from '@/src/lib/categoryIcons'

/** "ForkKnife" → "Fork knife", for accessibility labels. */
export function iconLabel(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The tile beside a category's (or group's) name: shows its icon on its tint
 * and, tapped, opens a searchable grid of every catalog icon below the row.
 * Inline rather than a popover, since it lives inside a bottom sheet.
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

  function pick(key: CategoryIconKey) {
    onChange(key)
    setOpen(false)
    setQuery('')
  }

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={() => setOpen(!open)}
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
      {open && (
        <View style={[styles.panel, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
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
            <ScrollView style={styles.grid} contentContainerStyle={styles.gridContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
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
                    style={[styles.option, on && { backgroundColor: tokens.accentSoft }]}
                  >
                    <Icon size={22} color={on ? tokens.accentInk : tokens.text} />
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : (
            <Text style={[styles.empty, { color: tokens.text3 }]}>No icons match that. Try another word.</Text>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  tile: { width: 52, minHeight: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge: { position: 'absolute', right: -5, bottom: -5, width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { marginTop: 10, borderWidth: 1, borderRadius: 16, padding: 10, gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  grid: { maxHeight: 220 },
  gridContent: { flexDirection: 'row', flexWrap: 'wrap' },
  option: { width: '16.66%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  empty: { fontSize: 13, paddingVertical: 8 },
})
