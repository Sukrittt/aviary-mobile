import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, Share, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { UserPlus } from '@/src/components/shared/icons'
import { HeaderButton, ScreenHeader } from '@/src/components/shared/ScreenHeader'
import { BottomSheet } from '@/src/components/shared/Modal'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { Toggle } from '@/src/components/ui/Toggle'
import { Alert } from '@/src/components/ui/AlertHost'
import { Avatar } from '@/src/components/budgets/MemberAvatars'
import {
  BudgetRefusedError,
  cancelInvite,
  createInvite,
  deleteBudget,
  getBudgetMembers,
  removeMember,
  transferBudget,
  setNotifyOthers,
  updateBudget,
  type BudgetInvite,
  getBudgets,
  type BudgetList,
  type BudgetMember,
} from '@/src/api/spaces'
import { budgetsKey, useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { currentUserId } from '@/src/api/accessMode'
import { activeBudgetId } from '@/src/lib/activeBudget'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { fallbackBudgetId, firstName, joinedOn, MAX_MEMBERS } from '@/src/lib/budgetMembership'
import { formatDateShort } from '@/src/lib/format'
import { toLocalDateString } from '@/src/lib/date'
import { BudgetIcon } from '@/src/components/budgets/BudgetIcon'

const oops = () => Alert.alert("Couldn't do that", 'Check your connection and try again.')

function joinedLabel(iso: string | null): string {
  if (!iso) return 'Joined a while back'
  return `Joined ${joinedOn(iso)}`
}

export function inviteMessage(name: string, invite: BudgetInvite): string {
  return `Join our ${name} budget on Aviary: ${invite.url} · Code ${invite.code}`
}

type Confirm = { kind: 'leave' } | { kind: 'pick-owner' } | { kind: 'transfer'; member: BudgetMember } | { kind: 'remove'; member: BudgetMember } | { kind: 'delete' } | { kind: 'rename' }

/**
 * One budget's people. The owner invites (share sheet plus a big code),
 * removes, renames and deletes; a member can leave. Everyone picks whether
 * they hear about what the others log.
 */
export default function BudgetMembersScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ id?: string }>()
  const { budgets, active } = useBudgetSpaces()
  const id = params.id ?? active?.id ?? ''
  const budget = budgets.find((b) => b.id === id)
  const name = budget?.name ?? 'this'
  const uid = currentUserId()
  const membersKey = ['budget-members', id]
  const q = useQuery({ queryKey: membersKey, queryFn: () => getBudgetMembers(id), enabled: !!id })
  const owner = (q.data?.role ?? budget?.role) === 'owner'
  const members = q.data?.members ?? budget?.members ?? []
  const [freshInvite, setFreshInvite] = useState<BudgetInvite | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [typed, setTyped] = useState('')
  const [saved, setSaved] = useState(false)
  const [notify, setNotify] = useState<boolean | null>(null)
  const notifyOn = notify ?? q.data?.notifyOthers ?? false

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: membersKey })
    void queryClient.invalidateQueries({ queryKey: budgetsKey })
  }

  const share = (invite: BudgetInvite) => Share.share({ message: inviteMessage(name, invite) }).catch(() => {})

  const invite = useMutation({
    mutationFn: () => createInvite(id),
    onSuccess: (inv) => {
      setFreshInvite(inv)
      refresh()
      void share(inv)
    },
    onError: (err) => {
      if (err instanceof BudgetRefusedError && err.code === 'FULL') Alert.alert(`${name} is full`, `${MAX_MEMBERS} people is the most a budget can have.`)
      else oops()
    },
  })

  // Optimistic: the invite leaves the list on tap; a failed cancel puts it back.
  const cancel = useMutation({
    mutationFn: (code: string) => cancelInvite(id, code),
    onMutate: (code) => {
      const before = queryClient.getQueryData<typeof q.data>(membersKey)
      if (before) queryClient.setQueryData(membersKey, { ...before, invites: before.invites?.filter((i) => i.code !== code) })
      if (freshInvite?.code === code) setFreshInvite(null)
      return { before }
    },
    onSuccess: refresh,
    onError: (_, __, ctx) => {
      if (ctx?.before) queryClient.setQueryData(membersKey, ctx.before)
      oops()
    },
  })

  const toggleNotify = useMutation({
    mutationFn: (next: boolean) => setNotifyOthers(id, next),
    onMutate: (next) => setNotify(next),
    onError: (_, next) => {
      setNotify(!next)
      oops()
    },
  })

  // Out of a budget that's gone (or you're gone from): open another first if it was the open one.
  async function leaveTo() {
    const list = await queryClient.fetchQuery({ queryKey: budgetsKey, queryFn: getBudgets, staleTime: 0 }).catch(() => queryClient.getQueryData<BudgetList>(budgetsKey))
    if (uid && (activeBudgetId() ?? uid) === id) await switchBudget(queryClient, uid, fallbackBudgetId(list, id))
    router.back()
  }

  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(id, userId),
    onSuccess: async (_, userId) => {
      setConfirm(null)
      if (userId === 'me') return leaveTo()
      refresh()
    },
    onError: oops,
  })

  const destroy = useMutation({
    mutationFn: () => deleteBudget(id, typed.trim()),
    onSuccess: () => {
      setConfirm(null)
      return leaveTo()
    },
    onError: oops,
  })

  const rename = useMutation({
    mutationFn: () => updateBudget(id, { name: typed.trim() }),
    onSuccess: () => {
      setSaved(true)
      void queryClient.invalidateQueries({ queryKey: budgetsKey })
    },
    onError: oops,
  })

  const transfer = useMutation({
    mutationFn: (userId: string) => transferBudget(id, userId),
    onSuccess: () => {
      setSaved(true)
      refresh()
    },
    onError: oops,
  })

  // The shared success beat on Save, then the sheet goes.
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => {
      setSaved(false)
      setConfirm(null)
    }, 1100)
    return () => clearTimeout(timer)
  }, [saved])

  const invites = q.data?.invites ?? []
  const full = members.length >= MAX_MEMBERS
  const openSheet = (c: Confirm) => {
    setTyped(c.kind === 'rename' ? budget?.name ?? '' : '')
    setConfirm(c)
  }

  const label = (text: string) => <Text style={[styles.sectionLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{text}</Text>
  const button = (text: string, onPress: () => void, color: string, opts?: { disabled?: boolean; testID?: string }) => (
    <Pressable testID={opts?.testID} onPress={onPress} disabled={opts?.disabled} accessibilityRole="button" style={[styles.button, { backgroundColor: tokens.card, borderColor: tokens.border, opacity: opts?.disabled ? 0.5 : 1 }]}>
      <Text style={[styles.buttonText, { color, fontFamily: fontFamily.bodySemiBold }]}>{text}</Text>
    </Pressable>
  )

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScreenHeader
        onBack={() => router.back()}
        title={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {budget ? <BudgetIcon budget={budget} size={20} color={tokens.text} /> : null}
            <Text numberOfLines={1} accessibilityRole="header" style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{name}</Text>
          </View>
        }
        right={owner ? <HeaderButton label="Rename" onPress={() => openSheet({ kind: 'rename' })} /> : null}
      />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}>
        {q.isError && !budget ? (
          <Text style={[styles.note, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{"Couldn't load the people in this budget. Check your connection and try again."}</Text>
        ) : null}

        {label(`People · ${members.length} of ${MAX_MEMBERS}`)}
        <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          {members.map((m) => {
            const isOwner = m.role === 'owner'
            const you = m.userId === uid
            return (
              <View key={m.userId} style={styles.memberRow} testID={`member-${m.userId}`}>
                <Avatar name={m.name} avatarUrl={m.avatarUrl} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={[styles.memberName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{you ? (m.name ? `${m.name} (you)` : 'You') : m.name ?? 'Someone'}</Text>
                  <Text style={[styles.meta, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{`${isOwner ? 'Owner' : 'Member'} · ${joinedLabel(m.joinedAt)}`}</Text>
                </View>
                {owner && !you ? (
                  <Pressable onPress={() => openSheet({ kind: 'remove', member: m })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${m.name ?? 'them'}`}>
                    <Text style={[styles.link, { color: tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          })}
        </View>

        {owner ? (
          <>
            <Pressable
              testID="invite"
              onPress={() => !invite.isPending && invite.mutate()}
              disabled={invite.isPending || full}
              accessibilityRole="button"
              style={[styles.invite, { backgroundColor: tokens.accent, opacity: invite.isPending || full ? 0.5 : 1 }]}
            >
              <UserPlus size={18} color={tokens.onAccent} weight="bold" />
              <Text style={[styles.inviteText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{invite.isPending ? 'Making an invite…' : full ? `${name} is full` : 'Invite'}</Text>
            </Pressable>
            {freshInvite ? (
              <View style={[styles.codeCard, { backgroundColor: tokens.accentSoft }]}>
                <Text style={[styles.meta, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>Their code</Text>
                <Text testID="invite-code" selectable style={[styles.bigCode, { color: tokens.accentInk, fontFamily: fontFamily.displaySemiBold }]}>{freshInvite.code}</Text>
                <Text style={[styles.meta, { color: tokens.accentInk, fontFamily: fontFamily.bodyMedium }]}>{'They tap the link, or pick "Join with a code" in Budgets.'}</Text>
              </View>
            ) : null}

            {invites.length ? (
              <>
                {label('Waiting to join')}
                <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                  {invites.map((inv) => (
                    <View key={inv.code} style={styles.memberRow}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.memberName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold, letterSpacing: 2 }]}>{inv.code}</Text>
                        <Text style={[styles.meta, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{`Works until ${formatDateShort(toLocalDateString(new Date(inv.expiresAt)))}`}</Text>
                      </View>
                      <Pressable onPress={() => void share(inv)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Share ${inv.code} again`}>
                        <Text style={[styles.link, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>Share again</Text>
                      </Pressable>
                      <Pressable onPress={() => cancel.mutate(inv.code)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Cancel ${inv.code}`}>
                        <Text style={[styles.link, { color: tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>Cancel</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : null}

        {members.length > 1 && q.data ? (
          <View style={[styles.card, styles.toggleRow, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.memberName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Tell me when others log</Text>
              <Text style={[styles.meta, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>A quick ping when someone adds an expense here.</Text>
            </View>
            <Toggle value={notifyOn} onValueChange={(next) => toggleNotify.mutate(next)} accessibilityLabel="Tell me when others log" />
          </View>
        ) : null}

        {owner && budget?.personal ? (
          <Text style={[styles.note, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>Your personal budget stays yours.</Text>
        ) : owner && budget && members.length >= 2 ? (
          button('Make someone else the owner', () => openSheet({ kind: 'pick-owner' }), tokens.text, { testID: 'transfer-owner' })
        ) : null}

        {owner
          ? budget && !budget.personal
            ? button('Delete budget', () => openSheet({ kind: 'delete' }), tokens.coral, { testID: 'delete-budget' })
            : null
          : button('Leave budget', () => openSheet({ kind: 'leave' }), tokens.coral, { testID: 'leave-budget' })}
      </ScrollView>

      <BottomSheet visible={confirm !== null} onClose={() => setConfirm(null)}>
        {confirm?.kind === 'leave' ? (
          <>
            <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{`Leave ${name}?`}</Text>
            <Text style={[styles.sheetBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{`You'll lose access to ${name} budget. Expenses you logged stay in it.`}</Text>
            <SheetButtons tokens={tokens} confirm="Leave budget" cancel="Stay" busy={remove.isPending} onConfirm={() => remove.mutate('me')} onCancel={() => setConfirm(null)} />
          </>
        ) : confirm?.kind === 'remove' ? (
          <>
            <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{`Remove ${firstName(confirm.member.name) ?? 'them'}?`}</Text>
            <Text style={[styles.sheetBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{`${firstName(confirm.member.name) ?? 'This person'} loses access to ${name}. What they logged stays.`}</Text>
            <SheetButtons tokens={tokens} confirm="Remove" cancel="Keep them" busy={remove.isPending} onConfirm={() => remove.mutate(confirm.member.userId)} onCancel={() => setConfirm(null)} />
          </>
        ) : confirm?.kind === 'delete' ? (
          <>
            <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{`Delete ${name}?`}</Text>
            <Text style={[styles.sheetBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{`Everyone in it loses access. You can restore it for 30 days. Type ${name} to confirm.`}</Text>
            <TextInput value={typed} onChangeText={setTyped} placeholder={name} placeholderTextColor={tokens.text3} accessibilityLabel="Budget name to confirm" autoCorrect={false} style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]} />
            <SheetButtons tokens={tokens} confirm="Delete budget" cancel="Keep it" busy={destroy.isPending} disabled={typed.trim() !== budget?.name} onConfirm={() => destroy.mutate()} onCancel={() => setConfirm(null)} />
          </>
        ) : confirm?.kind === 'pick-owner' ? (
          <>
            <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Who takes over?</Text>
            {members
              .filter((m) => m.userId !== uid)
              .map((m) => (
                <Pressable key={m.userId} onPress={() => setConfirm({ kind: 'transfer', member: m })} accessibilityRole="button" accessibilityLabel={`Make ${m.name ?? 'them'} the owner`} style={styles.memberRow}>
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size={36} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text numberOfLines={1} style={[styles.memberName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{m.name ?? 'Someone'}</Text>
                    {!m.name && <Text style={[styles.meta, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{joinedLabel(m.joinedAt)}</Text>}
                    {m.lapsed ? <Text style={[styles.meta, { color: tokens.warnInk, fontFamily: fontFamily.bodySemiBold }]}>Not subscribed</Text> : null}
                  </View>
                </Pressable>
              ))}
          </>
        ) : confirm?.kind === 'transfer' ? (
          <>
            <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{`Make ${firstName(confirm.member.name) ?? 'them'} the owner of ${name}?`}</Text>
            <Text style={[styles.sheetBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
              {confirm.member.lapsed
                ? `${firstName(confirm.member.name) ?? 'They'} isn't subscribed, so ${name} goes read-only for everyone, you included, until they are. Only they can invite, remove or delete. You stay in it.`
                : `${firstName(confirm.member.name) ? `${firstName(confirm.member.name)}'s` : 'Their'} plan covers ${name} from now on, and only they can invite, remove or delete. You stay in it.`}
            </Text>
            <View style={styles.sheetButtons}>
              <Pressable onPress={() => setConfirm(null)} disabled={saved} accessibilityRole="button" style={[styles.sheetButton, { backgroundColor: tokens.pillBg }]}>
                <Text style={[styles.inviteText, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>Not now</Text>
              </Pressable>
              <Pressable
                testID="confirm-transfer"
                onPress={() => !transfer.isPending && transfer.mutate(confirm.member.userId)}
                disabled={transfer.isPending || saved}
                accessibilityRole="button"
                style={[styles.sheetButton, { backgroundColor: saved ? tokens.successBg : tokens.accent, opacity: transfer.isPending ? 0.5 : 1 }]}
              >
                {saved ? <CheckIcon color={tokens.onSuccess} /> : <Text style={[styles.inviteText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{transfer.isPending ? 'One sec…' : 'Make them owner'}</Text>}
              </Pressable>
            </View>
          </>
        ) : confirm?.kind === 'rename' ? (
          <>
            <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Rename budget</Text>
            <TextInput value={typed} onChangeText={setTyped} maxLength={40} autoFocus accessibilityLabel="Budget name" style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]} />
            <Pressable
              onPress={() => !rename.isPending && rename.mutate()}
              disabled={!typed.trim() || rename.isPending || saved}
              accessibilityRole="button"
              style={[styles.sheetConfirm, { backgroundColor: saved ? tokens.successBg : tokens.accent, opacity: !typed.trim() || rename.isPending ? 0.5 : 1 }]}
            >
              {saved ? <CheckIcon color={tokens.onSuccess} /> : <Text style={[styles.inviteText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{rename.isPending ? 'Saving…' : 'Save'}</Text>}
            </Pressable>
          </>
        ) : null}
      </BottomSheet>
    </View>
  )
}

function SheetButtons({ tokens, confirm, cancel, busy, disabled, onConfirm, onCancel }: {
  tokens: ReturnType<typeof useTheme>['tokens']
  confirm: string
  cancel: string
  busy: boolean
  disabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <View style={styles.sheetButtons}>
      <Pressable onPress={onCancel} accessibilityRole="button" style={[styles.sheetButton, { backgroundColor: tokens.pillBg }]}>
        <Text style={[styles.inviteText, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>{cancel}</Text>
      </Pressable>
      <Pressable onPress={onConfirm} disabled={busy || disabled} accessibilityRole="button" style={[styles.sheetButton, { backgroundColor: tokens.coral, opacity: busy || disabled ? 0.5 : 1 }]}>
        <Text style={[styles.inviteText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{busy ? 'One sec…' : confirm}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 19, flexShrink: 1 },
  scroll: { padding: 16, gap: 12 },
  sectionLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  memberName: { fontSize: 15 },
  meta: { fontSize: 12 },
  link: { fontSize: 13 },
  note: { fontSize: 13, textAlign: 'center' },
  invite: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  inviteText: { fontSize: 15 },
  codeCard: { borderRadius: 18, padding: 16, alignItems: 'center', gap: 6 },
  bigCode: { fontSize: 36, letterSpacing: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  button: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { fontSize: 15 },
  sheetTitle: { fontSize: 18, marginBottom: 8 },
  sheetBody: { fontSize: 14, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, marginTop: 12 },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  sheetButton: { flex: 1, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  sheetConfirm: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
})
