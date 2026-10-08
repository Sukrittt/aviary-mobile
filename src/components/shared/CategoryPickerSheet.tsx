import { useMemo, useState, type ReactNode } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { categoryEmoji, groupEmoji, splitEmoji } from '@/src/lib/emoji'
import { useCategories } from '@/src/hooks/useCategories'
import { useGroups } from '@/src/hooks/useGroups'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useRecentCategories } from '@/src/hooks/useRecentCategories'
import { deriveRecentsFromExpenses } from '@/src/lib/recentCategories'
import { BottomSheet } from '@/src/components/shared/Modal'
import { Chip } from '@/src/components/ui/Chip'
import { Icon } from '@/src/components/shared/Icon'
import { EMPTY } from '@/src/lib/constants'
import { Check } from 'lucide-react-native'

/** Below this many categories, search + recents shortcuts aren't worth the extra chrome. */
const RECENTS_MIN_CATEGORIES = 8
const MAX_RECENT_SHOWN = 6

interface Props {
  visible: boolean
  onClose: () => void
  value: string
  onSelect: (category: string) => void
  /** Label for the "clear the link" row. Defaults to a generic "No category"; null hides the row. */
  noneLabel?: string | null
  /** Sheet heading. Defaults to "Category". */
  title?: string
  /** Rendered below the category list, e.g. log-expense's "Add category" action. */
  footer?: ReactNode
  /** Replaces the picker with a creation form in the same native modal. */
  creationForm?: ReactNode
}

/**
 * Grouped + searchable category picker, with a "Recently used" chip rail
 * pinned above the groups. The one category-picking surface in the app —
 * log-expense, scan-bill review, the activity filter, subscriptions and
 * recurring expenses all render this instead of hand-rolling their own list.
 */
export function CategoryPickerSheet({
  visible,
  onClose,
  value,
  onSelect,
  noneLabel = 'No category linked',
  title = 'Category',
  footer,
  creationForm,
}: Props) {
  const { tokens } = useTheme()
  const categoriesQ = useCategories()
  const groupsQ = useGroups()
  const expensesQ = useRecentExpenses()
  const { recents, record } = useRecentCategories()
  const [search, setSearch] = useState('')

  const categories = categoriesQ.data ?? EMPTY
  const groups = groupsQ.data ?? EMPTY

  const groupedCategories = useMemo(() => {
    const byGroup = new Map<string, typeof categories>()
    for (const c of categories) {
      const g = c.group || ''
      const arr = byGroup.get(g) ?? []
      arr.push(c)
      byGroup.set(g, arr)
    }
    // Groups the category list names but the group list doesn't go last rather
    // than missing: with no group list at all (offline before it has ever been
    // cached) grouping off `groups` alone dropped every grouped category, and
    // the picker offered nothing but "No category".
    const extra = [...byGroup.keys()].filter((g) => g && !groups.includes(g))
    const named = [...groups, ...extra].map((g) => ({ name: g, items: byGroup.get(g) ?? [] }))
    const other = byGroup.get('') ?? []
    return other.length > 0 ? [...named, { name: '', items: other }] : named
  }, [categories, groups])

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return groupedCategories
    const q = search.trim().toLowerCase()
    return groupedCategories
      .map((g) => ({ ...g, items: g.items.filter((c) => c.name.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0)
  }, [groupedCategories, search])

  // The device's own MRU once it has one; the expense history seeds it before
  // that (first launch after this shipped, or a fresh install).
  const recentNames = recents.length > 0 ? recents : deriveRecentsFromExpenses(expensesQ.data ?? EMPTY, categories)
  const groupByName = useMemo(() => new Map(categories.map((c) => [c.name, c.group])), [categories])
  const recentCategories = recentNames
    .filter((name) => groupByName.has(name))
    .slice(0, MAX_RECENT_SHOWN)
  const showRecents = !search.trim() && categories.length >= RECENTS_MIN_CATEGORIES && recentCategories.length > 0

  function pick(category: string) {
    onSelect(category)
    if (category) record(category)
    setSearch('')
    onClose()
  }

  return (
    <BottomSheet visible={visible} onClose={() => { onClose(); setSearch('') }}>
      {creationForm ?? (<>
      <Text style={[styles.title, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{title}</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search categories…"
        placeholderTextColor={tokens.text3}
        autoCorrect={false}
        style={[styles.search, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
      />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {noneLabel !== null && (
          <Pressable
            style={[styles.noneOption, value === '' && { backgroundColor: tokens.chipActiveBg }]}
            onPress={() => pick('')}
          >
            <Text style={[styles.optionText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{noneLabel}</Text>
            {value === '' && <Icon icon={Check} size={16} color={tokens.accentInk} strokeWidth={2.5} />}
          </Pressable>
        )}
        {showRecents && (
          <View style={styles.recentsSection}>
            <Text style={[styles.groupLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>
              Recently used
            </Text>
            <View style={[styles.recentsRow, { gap: 8 }]}>
              {recentCategories.map((name) => (
                <Chip
                  key={name}
                  selected={value === name}
                  icon={categoryEmoji(name, groupByName.get(name))}
                  label={splitEmoji(name).text}
                  onPress={() => pick(name)}
                />
              ))}
            </View>
          </View>
        )}
        {filteredCategories.map(
          (group) =>
            group.items.length > 0 && (
              <View key={group.name || 'other'}>
                <Text style={[styles.groupLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>
                  {group.name ? `${groupEmoji(group.name)} ${splitEmoji(group.name).text}` : 'Other'}
                </Text>
                <View style={[styles.groupItems, { borderLeftColor: tokens.border }]}>
                  {group.items.map((c, i) => (
                    <Pressable
                      key={c.name}
                      style={[
                        styles.option,
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
                        value === c.name && { backgroundColor: tokens.chipActiveBg },
                      ]}
                      onPress={() => pick(c.name)}
                    >
                      <Text style={[styles.optionText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>
                        {categoryEmoji(c.name, group.name)} {splitEmoji(c.name).text}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ),
        )}
        {search.trim() && filteredCategories.length === 0 && (
          <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, textAlign: 'center', paddingTop: 32 }}>
            No categories found
          </Text>
        )}
      </ScrollView>
      {footer}
      </>)}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, marginBottom: 8 },
  scroll: { height: 420 },
  option: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 },
  noneOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, marginBottom: 4 },
  optionText: { fontSize: 14 },
  groupLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 2, paddingHorizontal: 8 },
  groupItems: { borderLeftWidth: StyleSheet.hairlineWidth, marginLeft: 8, paddingLeft: 4 },
  recentsSection: { marginBottom: 4 },
  recentsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
})
