import { useEffect, useState, type ReactNode } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import Reanimated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Check, MagnifyingGlass, PencilSimple } from './icons'
import { CATEGORY_ICON_COMPONENTS } from './CategoryIcon'
import { BottomSheet } from './Modal'
import { PopOnChange } from './PopOnChange'
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
        <PopOnChange value={tint.ink} style={styles.tileWrap}>
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
        </PopOnChange>
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
  // Animate the pick only once the user has made one, not on the sheet's open.
  const [live, setLive] = useState(false)
  return (
    <View style={styles.swatches} accessibilityRole="radiogroup">
      {CATEGORY_COLORS.map((color) => (
        <Swatch
          key={color}
          color={color}
          on={color === value}
          live={live}
          disabled={disabled}
          onPress={() => {
            if (color !== value) Haptics.selectionAsync().catch(() => {})
            setLive(true)
            onChange(color)
          }}
        />
      ))}
    </View>
  )
}

const PICK_SPRING = { mass: 0.6, damping: 8, stiffness: 300 }

/**
 * One tint. A fresh pick springs back, ripples one ring out and pops its tick
 * in. Once, not a loop: a pulse that keeps going reads as "look at me".
 */
function Swatch({ color, on, live, disabled, onPress }: {
  color: CategoryColor
  on: boolean
  live: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const { tokens } = useTheme()
  const { bg, ink } = colorTint(color, tokens)
  const scale = useSharedValue(1)
  const tick = useSharedValue(on ? 1 : 0)
  // 0 → 1 spreads the ring out and fades it; it rests at 1, invisible.
  const ripple = useSharedValue(1)

  useEffect(() => {
    if (!on) {
      tick.value = 0
      return
    }
    if (!live) return
    scale.value = withSequence(withTiming(0.85, { duration: 80 }), withSpring(1, PICK_SPRING))
    tick.value = 0
    tick.value = withSpring(1, PICK_SPRING)
    ripple.value = 0
    ripple.value = withTiming(1, { duration: 600 })
  }, [on, live, scale, tick, ripple])

  const swatchStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const tickStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tick.value }, { rotate: `${(1 - tick.value) * -30}deg` }],
  }))
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - ripple.value),
    transform: [{ scale: 1 + 0.6 * ripple.value }],
  }))

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={COLOR_LABELS[color]}
      accessibilityState={{ selected: on }}
      hitSlop={4}
    >
      <Reanimated.View style={[styles.swatch, { backgroundColor: bg, borderColor: on ? ink : 'transparent' }, swatchStyle]}>
        <Reanimated.View pointerEvents="none" style={[styles.ripple, { borderColor: ink }, rippleStyle]} />
        <View style={[styles.swatchDot, { backgroundColor: ink }]}>
          {on && (
            <Reanimated.View style={tickStyle}>
              <Check size={14} weight="bold" color={tokens.cardSolid} />
            </Reanimated.View>
          )}
        </View>
      </Reanimated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ripple: { position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: 22, borderWidth: 2 },
  tileWrap: { flexShrink: 0 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  tile: { flex: 1, width: 52, minHeight: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
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
