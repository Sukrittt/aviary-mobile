import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Chip } from '@/src/components/ui/Chip'
import { useAddCategory } from '@/src/hooks/useCategories'
import { useGroupIcons, useGroups } from '@/src/hooks/useGroups'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { categoryIconKey } from '@/src/lib/categoryIcons'
import { splitEmoji } from '@/src/lib/emoji'
import { useOnline } from '@/src/lib/netStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import type { CategoryRow } from '@/src/types'

/** Mounted for each new category so cancelled drafts never carry into the next visit. */
export function AddCategoryForm({ onCreated }: {
  onCreated: (category: CategoryRow) => void
}) {
  const { tokens, space, radius, type } = useTheme()
  const groups = useGroups().data ?? []
  const groupIcons = useGroupIcons()
  const addCategory = useAddCategory()
  const online = useOnline()
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [error, setError] = useState('')
  const canSave = !!name.trim() && online && !addCategory.isPending

  function save() {
    if (!canSave) return
    const category = { name: name.trim(), group, icon: categoryIconKey(name.trim(), undefined, group) }
    setError('')
    addCategory.mutate(category, {
      onSuccess: () => onCreated(category),
      onError: (err) => setError(
        err instanceof Error && err.message.includes('already exists')
          ? 'That name is already taken. Try a different name.'
          : 'Failed to add category. Try again.',
      ),
    })
  }

  return (
    <View style={{ gap: space.md }}>
      <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>Add category</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <CategoryIcon name={name} group={group} size={22} color={tokens.text2} />
        <TextInput
          accessibilityLabel="Category name"
          value={name}
          onChangeText={setName}
          placeholder="New category name"
          placeholderTextColor={tokens.text3}
          autoFocus
          editable={!addCategory.isPending}
          returnKeyType="done"
          onSubmitEditing={save}
          style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong, borderRadius: radius.md, color: tokens.text, fontFamily: fontFamily.bodyMedium, fontSize: type.body }]}
        />
      </View>
      <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>Group</Text>
      <View pointerEvents={addCategory.isPending ? 'none' : 'auto'} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Chip label="Other" selected={!group} onPress={() => setGroup('')} />
        {groups.map((g) => <Chip key={g} label={splitEmoji(g).text} icon={(color) => <CategoryIcon kind="group" name={g} icon={groupIcons.get(g)} size={14} color={color} />} selected={group === g} onPress={() => setGroup(g)} />)}
      </View>
      {!online && <Text style={{ color: tokens.text3 }}>You can add categories once you&apos;re back online.</Text>}
      {!!error && <Text accessibilityRole="alert" style={{ color: tokens.coral, fontFamily: fontFamily.bodyMedium }}>{error}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save category"
        disabled={!canSave}
        onPress={save}
        style={{ padding: space.md, alignItems: 'center', backgroundColor: tokens.accent, borderRadius: radius.md, opacity: canSave ? 1 : 0.5 }}
      >
        <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold }}>{addCategory.isPending ? 'Saving…' : 'Save category'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  input: { flex: 1, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
})
