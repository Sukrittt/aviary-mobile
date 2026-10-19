import { Pressable, Text, View, StyleSheet } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { BottomSheet } from '@/src/components/shared/Modal'
import { Check, Plus } from '@/src/components/shared/icons'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { currentUserId } from '@/src/api/accessMode'
import { tap } from '@/src/lib/haptics'
import { MemberAvatars } from './MemberAvatars'
import { BudgetLimitNote } from './BudgetLimitNote'

/**
 * Every budget this person can open, the open one ticked, plus "New budget".
 * Opened from the home header's budget chip, or More → Budgets.
 */
export function BudgetSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { budgets, active, atLimit, count, limit } = useBudgetSpaces()

  const open = (id: string) => {
    tap()
    onClose()
    const uid = currentUserId()
    if (uid && id !== active?.id) void switchBudget(queryClient, uid, id)
  }

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
            </Pressable>
          )
        })}
      </View>

      {atLimit ? (
        <View style={{ marginTop: 12 }}>
          <BudgetLimitNote count={count} limit={limit} onContact={onClose} />
        </View>
      ) : (
        <Pressable
          testID="new-budget"
          onPress={() => {
            tap()
            onClose()
            router.push('/modals/new-budget' as Href)
          }}
          accessibilityRole="button"
          style={[styles.action, { borderColor: tokens.border }]}
        >
          <Plus size={18} color={tokens.accentInk} weight="bold" />
          <Text style={[styles.actionText, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>New budget</Text>
        </Pressable>
      )}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18, marginBottom: 14 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12 },
  emoji: { fontSize: 24 },
  rowMain: { flex: 1, gap: 4 },
  name: { fontSize: 15 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 12 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14 },
  actionText: { fontSize: 15 },
})
