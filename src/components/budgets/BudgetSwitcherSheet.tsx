import { Pressable, Text, View, StyleSheet } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { BottomSheet } from '@/src/components/shared/Modal'
import { Check, GearSix, Lock, Plus, UserPlus } from '@/src/components/shared/icons'
import { Button } from '@/src/components/ui/Button'
import { budgetsKey, useBudgetList, useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { useBillingStatus } from '@/src/hooks/useBillingStatus'
import { restoreBudget } from '@/src/api/spaces'
import { Alert } from '@/src/components/ui/AlertHost'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { currentUserId } from '@/src/api/accessMode'
import { tap } from '@/src/lib/haptics'
import { MemberAvatars } from './MemberAvatars'
import { BudgetLimitNote } from './BudgetLimitNote'
import { BudgetIcon } from './BudgetIcon'

/**
 * Every budget this person can open in one grouped card, the open one tinted
 * and ticked, plus "New budget" and "Join with a code". Each row's gear (or a
 * long press) opens its members. `onSwitch` runs after a switch to another one.
 * Opened from the home header's budget chip, or More → Budgets.
 */
export function BudgetSwitcherSheet({ visible, onClose, onSwitch }: { visible: boolean; onClose: () => void; onSwitch?: (id: string) => void }) {
  const { tokens } = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { budgets, active, atLimit, count, limit } = useBudgetSpaces()
  const restorable = (useBudgetList().data?.deleted ?? []).filter((d) => d.canRestore)
  // Their own plan lapsed: every budget they own is shut, only the ones others pay for open.
  const { data: billing } = useBillingStatus()
  const ownLocked = !!billing && billing.enforced && !billing.allowed

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
    if (uid && id !== active?.id) void switchBudget(queryClient, uid, id).then(() => onSwitch?.(id))
  }

  const go = (href: string) => {
    tap()
    onClose()
    router.push(href as Href)
  }
  const members = (id: string) => go(`/budget-members?id=${encodeURIComponent(id)}`)

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Your budgets</Text>
      <View style={[styles.list, { backgroundColor: tokens.pillBg }]}>
        {budgets.map((b, i) => {
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
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
                { backgroundColor: selected ? tokens.accentSoft : pressed ? tokens.border : 'transparent' },
              ]}
            >
              <BudgetIcon budget={b} size={24} color={tokens.text} />
              <View style={styles.rowMain}>
                <Text numberOfLines={1} style={[styles.name, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{b.name}</Text>
                {shared || b.readOnly || (ownLocked && b.role === 'owner') ? (
                  <View style={styles.meta}>
                    {shared ? <MemberAvatars members={b.members} size={20} /> : null}
                    {shared && b.role === 'owner' ? (
                      <View style={[styles.badge, { backgroundColor: tokens.bg }]}>
                        <Text style={[styles.badgeText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Owner</Text>
                      </View>
                    ) : null}
                    {b.readOnly ? (
                      <View style={[styles.badge, styles.readOnly, { backgroundColor: tokens.warnSoft }]}>
                        <Lock size={11} color={tokens.warnInk} weight="fill" />
                        <Text style={[styles.badgeText, { color: tokens.warnInk, fontFamily: fontFamily.bodySemiBold }]}>Read-only</Text>
                      </View>
                    ) : null}
                    {ownLocked && b.role === 'owner' ? (
                      <View style={[styles.badge, styles.readOnly, { backgroundColor: tokens.warnSoft }]}>
                        <Lock size={11} color={tokens.warnInk} weight="fill" />
                        <Text style={[styles.badgeText, { color: tokens.warnInk, fontFamily: fontFamily.bodySemiBold }]}>Locked</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {selected ? <Check size={18} color={tokens.accentInk} weight="bold" /> : null}
              <Pressable testID={`budget-settings-${b.id}`} onPress={() => members(b.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${b.name} members and settings`}>
                <GearSix size={20} color={tokens.text2} />
              </Pressable>
            </Pressable>
          )
        })}
      </View>

      {restorable.map((d) => (
        <View key={d.id} style={[styles.row, styles.deleted, { borderColor: tokens.border }]}>
          <BudgetIcon budget={d} size={24} color={tokens.text3} />
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
      ) : null}
      {/* At the limit, New budget drops out and Join takes the row. */}
      <View style={styles.actions}>
        {atLimit ? null : (
          <View style={styles.action}>
            <Button testID="new-budget" label="New budget" icon={Plus} size="small" onPress={() => go('/modals/new-budget')} />
          </View>
        )}
        <View style={styles.action}>
          <Button testID="join-budget" label="Join with a code" icon={UserPlus} size="small" variant="secondary" onPress={() => go('/modals/join-budget')} />
        </View>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18, marginBottom: 14 },
  list: { borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  deleted: { marginTop: 8, borderRadius: 14, borderStyle: 'dashed', borderWidth: 1 },
  rowMain: { flex: 1, gap: 4 },
  name: { fontSize: 15 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 12 },
  readOnly: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: { flex: 1 },
})
