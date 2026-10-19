import { Pressable, Text, View, StyleSheet } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { BottomSheet } from '@/src/components/shared/Modal'
import { Check, DotsThreeVertical, Plus, UserPlus } from '@/src/components/shared/icons'
import { budgetsKey, useBudgetList, useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { restoreBudget } from '@/src/api/spaces'
import { Alert } from '@/src/components/ui/AlertHost'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { currentUserId } from '@/src/api/accessMode'
import { tap } from '@/src/lib/haptics'
import { MemberAvatars } from './MemberAvatars'
import { BudgetLimitNote } from './BudgetLimitNote'

/**
 * Every budget this person can open, the open one ticked, plus "New budget"
 * and "Join with a code". Each row's dots (or a long press) open its members.
 * Opened from the home header's budget chip, or More → Budgets.
 */
export function BudgetSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { budgets, active, atLimit, count, limit } = useBudgetSpaces()
  const restorable = (useBudgetList().data?.deleted ?? []).filter((d) => d.canRestore)

  const restore = (id: string) => {
    tap()
    restoreBudget(id)
      .then(() => queryClient.invalidateQueries({ queryKey: budgetsKey }))
      .catch(() => Alert.alert("Couldn't bring it back", 'Check your connection and try again.'))
  }

  const open = (id: string) => {
    tap()
    onClose()
    const uid = currentUserId()
    if (uid && id !== active?.id) void switchBudget(queryClient, uid, id)
  }

  const go = (href: string) => {
    tap()
    onClose()
    router.push(href as Href)
  }
  const members = (id: string) => go(`/budget-members?id=${encodeURIComponent(id)}`)

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Budgets</Text>
      <View style={styles.list}>
        {budgets.map((b) => {
          const selected = b.id === active?.id
          const shared = b.members.length > 1
          return (
            <Pressable
              key={b.id}
              testID={`budget-row-${b.id}`}
              onPress={() => open(b.id)}
              onLongPress={() => members(b.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${b.name}${b.role === 'owner' && shared ? ', you own it' : ''}`}
              style={[styles.row, { backgroundColor: selected ? tokens.accentSoft : tokens.pillBg, borderColor: selected ? tokens.accent : 'transparent' }]}
            >
              <Text style={styles.emoji}>{b.emoji}</Text>
              <View style={styles.rowMain}>
                <Text numberOfLines={1} style={[styles.name, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{b.name}</Text>
                {shared ? (
                  <View style={styles.meta}>
                    <MemberAvatars members={b.members} size={20} />
                    {b.role === 'owner' ? (
                      <View style={[styles.badge, { backgroundColor: tokens.bg }]}>
                        <Text style={[styles.badgeText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Owner</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {selected ? <Check size={18} color={tokens.accentInk} weight="bold" /> : null}
              <Pressable testID={`budget-settings-${b.id}`} onPress={() => members(b.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${b.name} members and settings`}>
                <DotsThreeVertical size={20} color={tokens.text2} weight="bold" />
              </Pressable>
            </Pressable>
          )
        })}
      </View>

      {restorable.map((d) => (
        <View key={d.id} style={[styles.row, styles.deleted, { borderColor: tokens.border }]}>
          <Text style={[styles.emoji, { opacity: 0.5 }]}>{d.emoji}</Text>
          <Text numberOfLines={1} style={[styles.name, styles.rowMain, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{`${d.name} · Deleted`}</Text>
          <Pressable onPress={() => restore(d.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Restore ${d.name}`}>
            <Text style={[styles.name, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>Restore</Text>
          </Pressable>
        </View>
      ))}

      {atLimit ? (
        <View style={{ marginTop: 12 }}>
          <BudgetLimitNote count={count} limit={limit} onContact={onClose} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable testID="new-budget" onPress={() => go('/modals/new-budget')} accessibilityRole="button" style={[styles.action, { borderColor: tokens.border }]}>
            <Plus size={18} color={tokens.accentInk} weight="bold" />
            <Text style={[styles.actionText, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>New budget</Text>
          </Pressable>
          <Pressable testID="join-budget" onPress={() => go('/modals/join-budget')} accessibilityRole="button" style={[styles.action, { borderColor: tokens.border }]}>
            <UserPlus size={18} color={tokens.accentInk} weight="bold" />
            <Text style={[styles.actionText, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>Join with a code</Text>
          </Pressable>
        </View>
      )}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18, marginBottom: 14 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12 },
  emoji: { fontSize: 24 },
  deleted: { marginTop: 8, borderStyle: 'dashed', borderWidth: 1 },
  rowMain: { flex: 1, gap: 4 },
  name: { fontSize: 15 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14 },
  actionText: { fontSize: 15 },
})
