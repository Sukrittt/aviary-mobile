import { useEffect, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import Reanimated, { FadeInUp, ZoomIn, useReducedMotion } from 'react-native-reanimated'
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
import { MAX_MEMBERS, firstName } from '@/src/lib/budgetMembership'
import { BudgetIcon } from '@/src/components/budgets/BudgetIcon'
import { CodeTiles } from '@/src/components/budgets/CodeTiles'
import { Avatar } from '@/src/components/budgets/MemberAvatars'
import { ChipSplash } from '@/src/components/budgets/ChipSplash'
import { HandPointing, Users } from '@/src/components/shared/icons'
import { tap } from '@/src/lib/haptics'

const CODE_LENGTH = 6
const FACE = 36
const FACE_STEP = FACE - 8
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

/** How many people are already in the budget you're about to join. */
export function whoIsIn(members: number | undefined, inviter: string | null | undefined): string | null {
  if (!members) return null
  return members === 1 ? `Just ${inviter || 'the owner'} so far` : `${members} people already in`
}

/**
 * Join someone's budget with the code from their invite. The code is
 * previewed first, so you see whose budget it is before you're in it. Then,
 * once per budget, a welcome: your face drops in next to everyone else's.
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
  // Kept from the preview: switching into the budget swaps the query cache, preview included.
  const [welcome, setWelcome] = useState<JoinPreview['budget'] | null>(null)
  const [splash, setSplash] = useState(false)
  const reduceMotion = useReducedMotion()

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
  const wrongCode = invite?.status === 'not_found' || refused === 'NOT_FOUND'

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
    setWelcome(budget ?? null)
  }

  // Your face lands, then the burst around it.
  useEffect(() => {
    if (!welcome || reduceMotion) return
    const timer = setTimeout(() => {
      tap()
      setSplash(true)
    }, 420)
    return () => clearTimeout(timer)
  }, [welcome, reduceMotion])

  // The shared success beat, then into the budget.
  useEffect(() => {
    if (!joined) return
    const timer = setTimeout(() => void open(joined, true), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined])

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: tokens.border }]}>
      <Pressable onPress={() => done(!!welcome)} hitSlop={12} disabled={!!joined && !welcome}>
        <Text style={[styles.headerAction, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{welcome ? 'Close' : 'Cancel'}</Text>
      </Pressable>
      <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Join a budget</Text>
      <View style={{ width: 52 }} />
    </View>
  )

  if (welcome) {
    const budget = welcome
    // The list was refetched before this shows, so it has everyone, you included.
    const joinedBudget = budgets.find((b) => b.id === budget.id)
    const uid = currentUserId()
    const me = joinedBudget?.members.find((m) => m.userId === uid)
    const others = (joinedBudget?.members ?? []).filter((m) => m.userId !== uid).slice(0, 4)
    const name = firstName(me?.name)
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg }]}>
        {header}
        <View style={[styles.body, styles.introBody]} testID="budget-welcome">
          <View style={[styles.hero, { backgroundColor: tokens.accentSoft }]}>
            <BudgetIcon budget={budget} size={40} color={tokens.accentInk} />
          </View>
          <Text style={[styles.introTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{name ? `You're in, ${name}` : "You're in"}</Text>
          <Text style={[styles.introText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            {`Everything anyone logs in ${budget.name} lands here, and you'll see who added what.`}
          </Text>
          <View style={styles.faces}>
            {others.map((m, i) => (
              <View key={m.userId} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                <Avatar name={m.name} avatarUrl={m.avatarUrl} size={FACE} />
              </View>
            ))}
            <Reanimated.View testID="welcome-you" entering={reduceMotion ? undefined : ZoomIn.delay(200).springify().damping(12)} style={{ marginLeft: others.length ? -8 : 0 }}>
              <Avatar name={me?.name ?? 'You'} avatarUrl={me?.avatarUrl ?? null} size={FACE} />
            </Reanimated.View>
            {splash && (
              <ChipSplash center={{ x: others.length * FACE_STEP + FACE / 2, y: FACE / 2 }} color={tokens.accent} softColor={tokens.accentInk} onDone={() => setSplash(false)} />
            )}
          </View>
          <View style={[styles.tip, { backgroundColor: tokens.pillBg }]}>
            <HandPointing size={18} color={tokens.accentInk} />
            <Text style={[styles.tipText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Tap the budget at the top of Home to switch.</Text>
          </View>
          <Pressable
            onPress={() => done(true)}
            accessibilityRole="button"
            style={[styles.confirmButton, { backgroundColor: tokens.accent, alignSelf: 'stretch' }]}
          >
            <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{"Let's go"}</Text>
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
          <Text style={[styles.headline, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Got an invite?</Text>
          <CodeTiles
            value={code}
            onChange={(t) => {
              join.reset()
              setCode(cleanCode(t))
            }}
            length={CODE_LENGTH}
            autoFocus={!params.code}
            editable={!joined}
            error={wrongCode}
            shakeFor={wrongCode ? code : ''}
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
          <Reanimated.View key={budget.id} entering={reduceMotion ? undefined : FadeInUp.springify().damping(16)} style={[styles.card, styles.invite, { backgroundColor: tokens.pillBg }]}>
            <View style={[styles.hero, { backgroundColor: tokens.accentSoft }]}>
              <BudgetIcon budget={budget} size={36} color={tokens.accentInk} />
            </View>
            <Text style={[styles.cardTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
              {alreadyIn ? `You're already in ${budget.name}` : invite?.inviter ? `${invite.inviter} invited you to ${budget.name}` : `You're invited to ${budget.name}`}
            </Text>
            {!alreadyIn && whoIsIn(invite?.members, invite?.inviter) ? (
              <View style={styles.whoIn}>
                <Users size={16} color={tokens.text3} />
                <Text style={[styles.cardText, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{whoIsIn(invite?.members, invite?.inviter)}</Text>
              </View>
            ) : null}
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
          </Reanimated.View>
        ) : (
          <Text style={[styles.note, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{"Pop in the 6 letters and numbers from the invite you got."}</Text>
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
  field: { gap: 16, paddingTop: 8 },
  headline: { fontSize: 24, textAlign: 'center' },
  hero: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  invite: { paddingTop: 22, gap: 10 },
  whoIn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  faces: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  tipText: { fontSize: 13 },
  note: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  card: { borderRadius: 16, padding: 16, gap: 8, alignItems: 'center' },
  cardTitle: { fontSize: 18, textAlign: 'center' },
  cardText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  confirmButton: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginTop: 8, alignSelf: 'stretch' },
  confirmText: { fontSize: 16 },
  introBody: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  introTitle: { fontSize: 22, textAlign: 'center' },
  introText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
})
