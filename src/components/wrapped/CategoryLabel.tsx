import { createContext, useContext } from 'react'
import { View, Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { splitEmoji } from '@/src/lib/emoji'

// Wrapped draws a category as its icon plus its name, never the emoji at the front
// of the name. The screen provides the icons each category was given
// (useCategoryIcons); without it a category falls back to its emoji or name.
export const CategoryIconsContext = createContext<Map<string, string>>(new Map())

/** The name without its leading emoji. */
export const categoryName = (category: string) => splitEmoji(category).text || category

/** The category's icon: the one it was given, else one matched from its emoji or name. */
export function WrappedCategoryIcon({ category, size, color }: { category: string; size: number; color: string }) {
  return <CategoryIcon name={category} icon={useContext(CategoryIconsContext).get(category)} size={size} color={color} />
}

export function CategoryLabel({
  category,
  color,
  iconColor = color,
  size,
  suffix = '',
  style,
}: {
  category: string
  color: string
  /** Defaults to `color`. */
  iconColor?: string
  size: number
  /** Appended to the name, e.g. " · 3 Sep". */
  suffix?: string
  style?: StyleProp<TextStyle>
}) {
  return (
    <View style={styles.row}>
      <WrappedCategoryIcon category={category} size={size} color={iconColor} />
      <Text style={[{ color }, style, styles.text]} numberOfLines={1}>
        {categoryName(category)}
        {suffix}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  text: { flexShrink: 1 },
})
