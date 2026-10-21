import { useEffect, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import Reanimated, { FadeIn, ZoomIn, useReducedMotion } from 'react-native-reanimated'
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
import { HandPointing, Hourglass, LinkSimple, MagnifyingGlass, Stack, UserPlus, Users, WifiSlash } from '@/src/components/shared/icons'
import { Button } from '@/src/components/ui/Button'
import { InviteSkeleton } from '@/src/components/shared/TabSkeleton'
import { tap } from '@/src/lib/haptics'

const CODE_LENGTH = 6
const FACE = 36
const FACE_STEP = FACE - 8
const introKey = (spaceId: string) => `aviary-budget-intro:${spaceId}`

export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

export type Blocked = { kind: 'wrong' | 'expired' | 'limit' | 'full' | 'offline'; title: string; body: string }

/**
 * Why this invite can't be used, in words, or null when it can. `refused` is
 * the server's `{error}` from the join itself, which can differ from the
 * preview (the budget filled up meanwhile).
 */
export function blockedReason(invite: JoinPreview, refused: string | null | undefined, ctx: { limit: number; atLimit: boolean }): Blocked | null {
  const name = invite.budget?.name ?? 'This budget'
  const inviter = invite.inviter || 'whoever sent it'
  if (invite.status === 'not_found' || refused === 'NOT_FOUND') return { kind: 'wrong', title: 'No invite with that code', body: 'Check it against the message you got and try again.' }
  if (invite.status !== 'ok' || refused === 'EXPIRED') return { kind: 'expired', title: 'This invite has expired', body: `Ask ${inviter} to send you a fresh one.` }
  if (refused === 'LIMIT_REACHED' || (refused === undefined && ctx.atLimit)) return { kind: 'limit', title: `You're at ${ctx.limit} budgets`, body: `Leave one to make room for ${name}.` }
  if (refused === 'FULL' || (refused === undefined && (invite.members ?? 0) >= MAX_MEMBERS)) return { kind: 'full', title: `${name} is full`, body: `${MAX_MEMBERS} people is the most a budget can have.` }
  if (refused !== undefined) return OFFLINE
  return null
}

const OFFLINE: Blocked = { kind: 'offline', title: "Couldn't reach Aviary", body: 'Check your connection and try again.' }

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
  // Nothing to show for the code yet: the how-to sits right under the tiles instead of mid-screen.
  const showHelp = !(complete && (preview.isLoading || preview.isError)) && !blocked && !budget
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
            <Reanimated.View testID="welcome-you" entering={reduceMotion ? undefined : ZoomIn.delay(200).springify().damping(18)} style={{ marginLeft: others.length ? -8 : 0 }}>
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
      <ScrollView contentContainerStyle={[styles.body, styles.grow, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <View style={styles.titles}>
            <Text style={[styles.headline, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Got an invite?</Text>
            <Text style={[styles.subhead, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>Pop in the 6-character code you were sent.</Text>
          </View>
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

        <View style={[styles.result, showHelp && styles.resultTop]}>
          {complete && preview.isLoading ? (
            <InviteSkeleton />
          ) : complete && preview.isError ? (
            <BlockedCard blocked={OFFLINE} action="Try again" onAction={() => void preview.refetch()} />
          ) : blocked ? (
            <BlockedCard
              blocked={blocked}
              action={blocked.kind === 'wrong' || blocked.kind === 'expired' ? 'Try another code' : blocked.kind === 'offline' ? 'Try again' : undefined}
              onAction={() => (blocked.kind === 'offline' ? join.mutate() : (join.reset(), setCode('')))}
            />
          ) : budget ? (
            <Reanimated.View key={budget.id} entering={reduceMotion ? undefined : FadeIn.duration(200)} style={[styles.card, styles.invite, { backgroundColor: tokens.pillBg }]}>
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
            <WhereToFind />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const BLOCKED_ICON = { wrong: MagnifyingGlass, expired: Hourglass, limit: Stack, full: Users, offline: WifiSlash }

/** Why the code can't be used, with the one thing you can do about it. */
function BlockedCard({ blocked, action, onAction }: { blocked: Blocked; action?: string; onAction: () => void }) {
  const { tokens } = useTheme()
  const reduceMotion = useReducedMotion()
  const Icon = BLOCKED_ICON[blocked.kind]
  return (
    <Reanimated.View key={blocked.kind} testID="join-blocked" entering={reduceMotion ? undefined : FadeIn.duration(200)} style={styles.blocked} accessibilityRole="alert">
      <View style={[styles.blockedIcon, { backgroundColor: tokens.warnSoft }]}>
        <Icon size={26} color={tokens.warnInk} />
      </View>
      <Text style={[styles.cardTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{blocked.title}</Text>
      <Text style={[styles.cardText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{blocked.body}</Text>
      {action ? <Button label={action} variant="secondary" size="small" onPress={onAction} style={styles.blockedAction} /> : null}
    </Reanimated.View>
  )
}

/** Where the code lives: a look-alike of the invite message, the code lit up, and what to do without one. */
function WhereToFind() {
  const { tokens } = useTheme()
  const tips = [
    { icon: LinkSimple, text: "Got the link instead? Tap it and we'll fill this in." },
    { icon: UserPlus, text: 'No invite yet? Ask the budget owner to send you one.' },
  ]
  return (
    <View testID="where-to-find" style={styles.where}>
      <Text style={[styles.whereLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{"Where's my code?"}</Text>
      <View style={[styles.bubble, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
        <Text style={[styles.bubbleText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>Join our budget on Aviary</Text>
        <Text style={[styles.bubbleText, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>useaviary.com/join/…</Text>
        <View style={styles.bubbleCodeRow}>
          <Text style={[styles.bubbleText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>Code</Text>
          <View style={[styles.bubbleCode, { backgroundColor: tokens.accentSoft }]}>
            <Text style={[styles.bubbleCodeText, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}>K7P2QX</Text>
          </View>
          <Text style={[styles.bubbleHint, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>like this</Text>
        </View>
      </View>
      {tips.map(({ icon: Icon, text }) => (
        <View key={text} style={styles.whereTip}>
          <Icon size={18} color={tokens.accentInk} />
          <Text style={[styles.whereTipText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{text}</Text>
        </View>
      ))}
    </View>
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
  grow: { flexGrow: 1 },
  // Tiles stay put up top; whatever the code turns up sits in the middle of what's left.
  blocked: { alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  blockedIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  blockedAction: { marginTop: 8, alignSelf: 'center' },
  result: { flex: 1, justifyContent: 'center', gap: 18 },
  resultTop: { justifyContent: 'flex-start', paddingTop: 12 },
  field: { gap: 16, paddingTop: 8 },
  titles: { gap: 6 },
  headline: { fontSize: 24, textAlign: 'center' },
  subhead: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  where: { gap: 12 },
  whereLabel: { fontSize: 13, textAlign: 'center' },
  bubble: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 2, alignSelf: 'stretch' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  bubbleCode: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  bubbleCodeText: { fontSize: 15, letterSpacing: 1.5 },
  bubbleHint: { fontSize: 12 },
  whereTip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  whereTipText: { fontSize: 13, lineHeight: 18, flex: 1 },
  hero: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  invite: { paddingTop: 22, gap: 10 },
  whoIn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  faces: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  tipText: { fontSize: 13 },
  card: { borderRadius: 16, padding: 16, gap: 8, alignItems: 'center' },
  cardTitle: { fontSize: 18, textAlign: 'center' },
  cardText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  confirmButton: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginTop: 8, alignSelf: 'stretch' },
  confirmText: { fontSize: 16 },
  introBody: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  introTitle: { fontSize: 22, textAlign: 'center' },
  introText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
})
