import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { BudgetRefusedError, joinBudget, previewJoin, type JoinPreview } from '@/src/api/spaces'
import { budgetsKey, useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { signalOnboarded } from '@/src/api/onboardingSignal'
import { currentUserId } from '@/src/api/accessMode'
import { MAX_MEMBERS } from '@/src/lib/budgetMembership'
import { BudgetIcon } from '@/src/components/budgets/BudgetIcon'
import { HandPointing } from '@/src/components/shared/icons'

const CODE_LENGTH = 6
const introKey = (spaceId: string) => `aviary-budget-intro:${spaceId}`

export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

/**
 * Why this invite can't be used, in words, or null when it can. `refused` is
 * the server's `{error}` from the join itself, which can differ from the
 * preview (the budget filled up meanwhile).
 */
export function blockedReason(invite: JoinPreview, refused: string | null | undefined, ctx: { limit: number; atLimit: boolean }): string | null {
  const name = invite.budget?.name ?? 'This budget'
  const inviter = invite.inviter || 'whoever sent it'
  if (invite.status === 'not_found' || refused === 'NOT_FOUND') return "That code doesn't match an invite. Check it and try again."
  if (invite.status !== 'ok' || refused === 'EXPIRED') return `This invite has expired. Ask ${inviter} for a new one.`
  if (refused === 'LIMIT_REACHED' || (refused === undefined && ctx.atLimit)) return `You're at ${ctx.limit} budgets. Leave one to join.`
  if (refused === 'FULL' || (refused === undefined && (invite.members ?? 0) >= MAX_MEMBERS)) return `${name} is full. ${MAX_MEMBERS} people is the most a budget can have.`
  if (refused !== undefined) return 'Check your connection and try again.'
  return null
}

/**
 * Join someone's budget with the code from their invite. The code is
 * previewed first, so you see whose budget it is before you're in it; then
 * two short cards, once per budget, on how sharing works.
 */
export default function JoinBudgetModal() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ code?: string; fresh?: string }>()
  // `fresh`: a new account that came in through an invite, sent here instead of setup.
  const fresh = params.fresh === '1'
  const { budgets, limit, atLimit } = useBudgetSpaces()
  const [code, setCode] = useState(() => cleanCode(params.code ?? ''))
  const [joined, setJoined] = useState<string | null>(null)
  const [intro, setIntro] = useState<0 | 1 | null>(null)

  const complete = code.length === CODE_LENGTH
  const preview = useQuery({ queryKey: ['join', code], queryFn: () => previewJoin(code), enabled: complete, staleTime: 30_000 })
  const invite = complete ? preview.data : undefined
  const budget = invite?.budget
  const alreadyIn = !joined && !!budget && budgets.some((b) => b.id === budget.id)

  const join = useMutation({
    mutationFn: () => joinBudget(code),
    // Already in it (joined on another device): just open it.
    onSuccess: (res) => (res.already ? void open(res.spaceId, false) : setJoined(res.spaceId)),
  })
  // undefined: not tried yet. null: refused for no reason we have words for.
  const refused = join.error ? (join.error instanceof BudgetRefusedError ? join.error.code : null) : undefined
  const blocked = invite && !alreadyIn ? blockedReason(invite, refused, { limit, atLimit }) : null

  // Leave the modal. A new account has nothing under it: joining makes them
  // set up (the budget they joined is), and backing out means their own setup.
  function done(joinedOne: boolean) {
    if (!fresh) return router.back()
    if (!joinedOne) return router.replace('/setup' as Href)
    signalOnboarded({ elsewhere: true })
    setTimeout(() => router.replace('/(tabs)' as Href), 0)
  }

  async function open(spaceId: string, showIntro: boolean) {
    // The fresh list first, so nothing reads the new budget as one you're not in.
    await queryClient.refetchQueries({ queryKey: budgetsKey }).catch(() => {})
    const uid = currentUserId()
    if (uid) await switchBudget(queryClient, uid, spaceId)
    const seen = showIntro ? await AsyncStorage.getItem(introKey(spaceId)).catch(() => '1') : '1'
    if (seen) {
      done(true)
      return
    }
    void AsyncStorage.setItem(introKey(spaceId), '1').catch(() => {})
    setIntro(0)
  }

  // The shared success beat, then into the budget.
  useEffect(() => {
    if (!joined) return
    const timer = setTimeout(() => void open(joined, true), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined])

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: tokens.border }]}>
      <Pressable onPress={() => done(intro !== null)} hitSlop={12} disabled={!!joined && intro === null}>
        <Text style={[styles.headerAction, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{intro === null ? 'Cancel' : 'Close'}</Text>
      </Pressable>
      <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Join a budget</Text>
      <View style={{ width: 52 }} />
    </View>
  )

  if (intro !== null && budget) {
    const cards = [
      { icon: <BudgetIcon budget={budget} size={40} color={tokens.accentInk} />, title: `You and ${invite?.inviter ?? 'the owner'} share this budget`, body: "Everything anyone logs lands here, and you'll see who added what." },
      { icon: <HandPointing size={40} color={tokens.accentInk} />, title: 'Switch budgets from here', body: 'Tap the budget name at the top of Home to hop between your budgets.' },
    ]
    const card = cards[intro]
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg }]}>
        {header}
        <View style={[styles.body, styles.introBody]} testID={`budget-intro-${intro}`}>
          {card.icon}
          <Text style={[styles.introTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{card.title}</Text>
          <Text style={[styles.introText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{card.body}</Text>
          <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{`${intro + 1} of ${cards.length}`}</Text>
          <Pressable
            onPress={() => (intro === 0 ? setIntro(1) : done(true))}
            accessibilityRole="button"
            style={[styles.confirmButton, { backgroundColor: tokens.accent, alignSelf: 'stretch' }]}
          >
            <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{intro === 0 ? 'Next' : 'Got it'}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: tokens.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {header}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Invite code</Text>
          <TextInput
            value={code}
            onChangeText={(t) => {
              join.reset()
              setCode(cleanCode(t))
            }}
            placeholder="ABC123"
            placeholderTextColor={tokens.text3}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus={!params.code}
            maxLength={CODE_LENGTH}
            editable={!joined}
            accessibilityLabel="Invite code"
            style={[styles.codeInput, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}
          />
        </View>

        {complete && preview.isLoading ? (
          <Text style={[styles.note, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>Looking it up…</Text>
        ) : complete && preview.isError ? (
          <Text style={[styles.note, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{"Couldn't check that code. Check your connection and try again."}</Text>
        ) : blocked ? (
          <View testID="join-blocked" style={[styles.card, { backgroundColor: tokens.pillBg }]}>
            <Text style={[styles.cardText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{blocked}</Text>
          </View>
        ) : budget ? (
          <View style={[styles.card, { backgroundColor: tokens.pillBg }]}>
            <BudgetIcon budget={budget} size={32} color={tokens.text} />
            <Text style={[styles.cardTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
              {alreadyIn ? `You're already in ${budget.name}` : `Join ${budget.name} budget?`}
            </Text>
            <Text style={[styles.cardText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
              {alreadyIn ? 'Open it and pick up where you left off.' : 'Your own budget stays exactly as it is.'}
            </Text>
            <Pressable
              onPress={() => (alreadyIn ? void open(budget.id, false) : !join.isPending && join.mutate())}
              disabled={join.isPending || !!joined}
              accessibilityRole="button"
              style={[styles.confirmButton, { backgroundColor: joined ? tokens.successBg : tokens.accent, opacity: join.isPending ? 0.5 : 1 }]}
            >
              {joined ? (
                <CheckIcon color={tokens.onSuccess} />
              ) : (
                <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>
                  {alreadyIn ? `Open ${budget.name}` : join.isPending ? 'Joining…' : `Join ${budget.name}`}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.note, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{"It's the 6 letters and numbers in the invite you got."}</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAction: { fontSize: 14, width: 52 },
  headerTitle: { fontSize: 16 },
  body: { padding: 20, gap: 18 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeInput: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 28, letterSpacing: 6, textAlign: 'center' },
  note: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  card: { borderRadius: 16, padding: 16, gap: 8, alignItems: 'center' },
  cardTitle: { fontSize: 18, textAlign: 'center' },
  cardText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  confirmButton: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginTop: 8, alignSelf: 'stretch' },
  confirmText: { fontSize: 16 },
  introBody: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  introTitle: { fontSize: 22, textAlign: 'center' },
  introText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  hint: { fontSize: 12 },
})
