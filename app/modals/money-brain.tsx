import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Reanimated from 'react-native-reanimated'
import { useBounce } from '@/src/hooks/useBounce'
import { ArrowLeft, ArrowRight, ArrowUp, Check, Clock, Plus } from 'lucide-react-native'
import { Alert } from '@/src/components/ui/AlertHost'
import { useTheme } from '@/src/theme/ThemeProvider'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { fontFamily } from '@/src/theme/fonts'
import { useBudgets } from '@/src/hooks/useBudgets'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useCategories } from '@/src/hooks/useCategories'
import { useGroups } from '@/src/hooks/useGroups'
import { useMoneyBrief } from '@/src/hooks/useMoneyBrief'
import { isAiAllowanceError } from '@/src/lib/aiAllowance'
import { useChatSessions, useChatSessionsCount } from '@/src/hooks/useChatSessions'
import { computeEnvelopeState, currentMonthKey } from '@/src/lib/envelope'

import { ProgressBar } from '@/src/components/envelope/ProgressBar'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { Icon } from '@/src/components/shared/Icon'
import { InsightCard } from '@/src/components/brain/InsightCard'
import { ChatHistoryList } from '@/src/components/brain/ChatHistoryList'
import { ChatMarkdown } from '@/src/components/brain/ChatMarkdown'
import { BrainThinking } from '@/src/components/brain/BrainThinking'
import { BirdLandingMark } from '@/src/components/splash/BirdLandingMark'
import { PopIn } from '@/src/components/shared/PopIn'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { streamChat, getChatSession, updateProposalStatus, CAPTURE_FAILED_MESSAGE, type ChatMessage } from '@/src/api/ai'
import { CaptureReview } from '@/src/components/brain/CaptureReview'
import { pickAck } from '@/src/lib/captureAck'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { startTimer, track } from '@/src/lib/analytics'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { useOnline } from '@/src/lib/netStatus'
import { useQuery } from '@tanstack/react-query'
import { getSystemStatus } from '@/src/api/systemStatus'
import { AiAllowanceScreen, AiUnavailableScreen } from '@/src/components/shared/AiUnavailableScreen'
import { FORCE_EMPTY_STATE_PREVIEW } from '@/src/lib/emptyStatePreview'

// Reveal cascade for the first paint of loaded brief content — see Heatmap.tsx
// for the same shared-value-driven pattern and why `entering` isn't used here.
const MOUNT_START_DELAY_MS = 100
const BLOCK_STAGGER_MS = 90
const ITEM_STAGGER_MS = 45
const ITEM_STAGGER_CAP_INDEX = 6

/** A chat turn as this screen holds it: `captureFailed` marks a reply that offers manual entry instead. */
type BrainMessage = ChatMessage & { captureFailed?: boolean }

type PendingSettle = { proposalId: string; status: 'submitted' | 'dismissed'; expenseIds: string[]; reply?: string }

/** Tappable examples on the empty capture screen; each one teaches a bit of the grammar. */
const CAPTURE_EXAMPLES = ['auto 240', 'lunch 150, coffee 80', 'turf 1200 split 6']

/** The line over Ask Aviary's reply to logged rows; a reopened chat may not know the count. */
function loggedLabel(count: number | undefined) {
  if (!count) return 'Logged'
  return count === 1 ? '1 spend logged' : `${count} spends logged`
}

/**
 * The server sends the end of a reply before it saves it, so the first try can
 * land before the proposal exists. A few spaced retries cover that; after them
 * it's best effort, since client_ids already stop a second log.
 */
function persistSettle(sessionId: string, settle: PendingSettle, attempt = 0) {
  updateProposalStatus(sessionId, settle.proposalId, settle.status, settle.expenseIds, settle.reply).catch(() => {
    if (attempt < 3) setTimeout(() => persistSettle(sessionId, settle, attempt + 1), 600 * (attempt + 1))
  })
}

/** An example on the empty capture screen. A tap drops it into the composer, so it ticks and dips toward it. */
function ExampleChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { tokens } = useTheme()
  const bounce = useBounce(6)
  return (
    <Reanimated.View style={bounce.style}>
      <Pressable
        onPressIn={bounce.onPressIn}
        onPressOut={bounce.onPressOut}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {})
          bounce.kick()
          onPress()
        }}
        accessibilityLabel={`Try "${label}"`}
        style={[styles.chip, { backgroundColor: tokens.pillBg, borderColor: tokens.border }]}
      >
        <Text style={[styles.chipText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>
      </Pressable>
    </Reanimated.View>
  )
}

/** Send, with a light tap and a little hop upward as the message goes. */
function SendButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { tokens } = useTheme()
  const bounce = useBounce(-5)
  return (
    <Reanimated.View style={bounce.style}>
      <Pressable
        onPressIn={bounce.onPressIn}
        onPressOut={bounce.onPressOut}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
          bounce.kick()
          onPress()
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Send"
        style={[styles.sendButton, { backgroundColor: tokens.accent, opacity: disabled ? 0.5 : 1 }]}
      >
        <Icon icon={ArrowUp} size={18} color={tokens.onAccent} />
      </Pressable>
    </Reanimated.View>
  )
}

export default function MoneyBrainModal() {
  const { formatCurrency } = useCurrency()
  const router = useRouter()
  // Opened from log-expense's "Log several at once": a focused composer for
  // typing spends, without the brief. It also skips the allowance screen,
  // since logging spends never counts against the allowance.
  const params = useLocalSearchParams<{ capture?: string }>()
  const captureMode = params.capture === '1'

  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const { hideAmounts } = usePrivacy()
  const online = useOnline()

  const budgetsQ = useBudgets()
  const expensesQ = useRecentExpenses()
  const categoriesQ = useCategories()
  const groupsQ = useGroups()
  const briefQ = useMoneyBrief()
  // staleTime 0: the kill switch is checked fresh on open; a failed brief re-checks it below.
  const statusQ = useQuery({ queryKey: ['system-status'], queryFn: getSystemStatus, staleTime: 0, retry: false })
  const refetchStatus = statusQ.refetch
  useEffect(() => {
    track('money_brain_opened')
  }, [])
  useEffect(() => {
    if (briefQ.isError) void refetchStatus()
  }, [briefQ.isError, refetchStatus])

  const month = currentMonthKey()
  const envelopeState = useMemo(
    () =>
      computeEnvelopeState(
        budgetsQ.data ?? [],
        expensesQ.data ?? [],
        month,
        categoriesQ.data ?? [],
        groupsQ.data ?? [],
      ),
    [budgetsQ.data, expensesQ.data, categoriesQ.data, groupsQ.data, month],
  )

  const spentPct =
    envelopeState.totalAssigned > 0
      ? Math.min(100, (envelopeState.totalSpent / envelopeState.totalAssigned) * 100)
      : envelopeState.totalSpent > 0
        ? 100
        : 0

  const brief = briefQ.data

  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [messages, setMessages] = useState<BrainMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  // Outcomes picked while a reply streams wait here until the chat exists on the server.
  const streamingRef = useRef(false)
  const pendingSettles = useRef<PendingSettle[]>([])
  // Proposals whose rows were just logged, waiting on Ask Aviary's reply to them.

  // True until the async brief load first finishes — gates the reveal to
  // genuinely-first content, not refetches or later re-renders of this same
  // mounted instance. A ref, not state: nothing needs a re-render off this flip.
  const revealedRef = useRef(false)
  const playReveal = !revealedRef.current
  useEffect(() => {
    if (!briefQ.isLoading) revealedRef.current = true
  }, [briefQ.isLoading])

  const [historyQueryText, setHistoryQueryText] = useState('')
  const [historyDebouncedQuery, setHistoryDebouncedQuery] = useState('')
  const [historyPage, setHistoryPage] = useState(1)

  // Debounce the search box before it reaches the server-side search param.
  useEffect(() => {
    const t = setTimeout(() => {
      setHistoryDebouncedQuery(historyQueryText)
      setHistoryPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [historyQueryText])

  const historyQuery = useChatSessions(view === 'history', { page: historyPage, query: historyDebouncedQuery })
  const historyCountQuery = useChatSessionsCount()

  useEffect(() => {
    return () => {
      const controller = abortRef.current
      abortRef.current = null
      controller?.abort()
    }
  }, [])

  /**
   * `source` separates the two ways a question gets asked: tapping one of the
   * brief's suggested chips, or typing one. Whether people compose their own
   * questions or only take what's offered is the thing worth knowing here.
   */
  function send(text: string, source: 'chip' | 'typed') {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    // After the guard, so this counts questions that actually went out rather
    // than empty taps on the send button. The question text itself stays out:
    // people ask their money app things they would not want logged.
    track('money_brain_query', { source })

    const history = [...messages, { role: 'user' as const, text: trimmed }]
    setMessages([...history, { role: 'model', text: '' }])
    setInput('')
    setSending(true)

    const controller = new AbortController()
    abortRef.current = controller
    const ownsRequest = () => abortRef.current === controller && !controller.signal.aborted
    const replyIndex = history.length
    streamingRef.current = true
    const elapsed = startTimer()
    const answered = (ok: boolean, reason?: string) =>
      track('money_brain_answered', { ok, seconds: elapsed(), ...(reason ? { reason } : {}) })

    streamChat(
      sessionId,
      history,
      (delta) => {
        if (!ownsRequest()) return
        setMessages((prev) => {
          if (!ownsRequest()) return prev
          const copy = [...prev]
          const reply = copy[replyIndex]
          copy[replyIndex] = { ...reply, text: reply.text + delta }
          return copy
        })
      },
      controller.signal,
      (proposal) => {
        if (!ownsRequest()) return
        track('capture_proposed', { rows: proposal.items.length })
        setMessages((prev) => {
          if (!ownsRequest()) return prev
          const copy = [...prev]
          copy[replyIndex] = { ...copy[replyIndex], proposal }
          return copy
        })
      },
    )
      .then((resolvedSessionId) => {
        if (!ownsRequest()) return
        answered(true)
        setSessionId(resolvedSessionId)
        streamingRef.current = false
        if (resolvedSessionId) for (const p of pendingSettles.current.splice(0)) persistSettle(resolvedSessionId, p)
      })
      .catch((err) => {
        if (!ownsRequest()) return
        const captureFailed = err instanceof Error && err.message === CAPTURE_FAILED_MESSAGE
        // A new chat aborts the old stream on purpose; that's not a failed answer.
        answered(false, captureFailed ? 'capture_failed' : isAiAllowanceError(err) ? 'ai_allowance' : 'error')
        setMessages((prev) => {
          if (!ownsRequest()) return prev
          const copy = [...prev]
          copy[replyIndex] = {
            role: 'model',
            text: captureFailed
              ? "Couldn't read that one. Add it by hand?"
              : isAiAllowanceError(err)
                ? "You've used this month's AI allowance."
                : 'Something went wrong. Try again.',
            captureFailed,
          }
          return copy
        })
      })
      .finally(() => {
        // A new chat aborted this stream and owns the screen now; leave its lock and queue alone.
        if (!ownsRequest()) return
        streamingRef.current = false
        setSending(false)
        // Cards logged mid-stream whose stream then failed: record them on the chat they came from, if it was saved.
        for (const p of pendingSettles.current.splice(0)) if (sessionId) persistSettle(sessionId, p)
      })
  }

  /**
   * Records a proposal's outcome on the chat, so reopening it shows the card
   * read-only. Logged rows get Ask Aviary's line right under the card at once
   * (src/lib/captureAck.ts); the server saves the same line. Dismissals get none.
   */
  function settleProposal(proposalId: string, status: 'submitted' | 'dismissed', expenseIds: string[]) {
    const reply = status === 'submitted' ? pickAck() : undefined
    setMessages((prev) => {
      const at = prev.findIndex((m) => m.proposal?.id === proposalId)
      if (at < 0) return prev
      const next = [...prev]
      next[at] = { ...next[at], proposal: { ...next[at].proposal!, status, expenseIds } }
      if (reply && !next[at + 1]?.ack) next.splice(at + 1, 0, { role: 'model', text: reply, ack: true })
      return next
    })
    const settle = { proposalId, status, expenseIds, reply }
    if (sessionId && !streamingRef.current) persistSettle(sessionId, settle)
    else pendingSettles.current.push(settle)
  }

  function stopCurrentRequest() {
    const controller = abortRef.current
    abortRef.current = null
    controller?.abort()
    streamingRef.current = false
    // Outcomes still waiting on the old chat go to it, not to the next one.
    for (const p of pendingSettles.current.splice(0)) if (sessionId) persistSettle(sessionId, p)
    setSending(false)
  }

  function startNewChat() {
    stopCurrentRequest()
    setMessages([])
    setSessionId(null)
    setInput('')
    setView('chat')
    setHistoryQueryText('')
    setHistoryPage(1)
  }

  async function openSession(id: string) {
    stopCurrentRequest()
    const controller = new AbortController()
    abortRef.current = controller
    const ownsRequest = () => abortRef.current === controller && !controller.signal.aborted
    try {
      const detail = await getChatSession(id)
      if (!ownsRequest()) return
      setMessages(detail.messages)
      setSessionId(detail.id)
      setView('chat')
    } catch {
      if (!ownsRequest()) return
      Alert.alert('Could not load chat', 'Check your connection and try again.')
    }
  }

  const lastMessage = messages[messages.length - 1]
  const awaitingFirstDelta = sending && lastMessage?.role === 'model' && lastMessage.text === '' && !lastMessage.proposal

  if (!online) return <OfflineScreen />
  if (statusQ.data?.aiDisabled) return <AiUnavailableScreen />
  if (!captureMode && isAiAllowanceError(briefQ.error)) return <AiAllowanceScreen />

  if (view === 'history') {
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Pressable
            onPress={() => setView('chat')}
            hitSlop={12}
            style={[styles.iconButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}
          >
            <Icon icon={ArrowLeft} size={18} color={tokens.text} />
          </Pressable>
          <Text
            style={[
              styles.title,
              { flex: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold, marginLeft: 12 },
            ]}
          >
            Chat history
          </Text>
          <Pressable onPress={startNewChat} style={[styles.newPill, { backgroundColor: tokens.accent }]}>
            <Icon icon={Plus} size={15} color={tokens.onAccent} strokeWidth={2.4} />
            <Text style={[styles.newPillText, { color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold }]}>
              New
            </Text>
          </Pressable>
        </View>
        <ChatHistoryList
          sessions={FORCE_EMPTY_STATE_PREVIEW ? [] : historyQuery.data?.sessions}
          loading={!FORCE_EMPTY_STATE_PREVIEW && historyQuery.isLoading}
          page={historyPage}
          pageCount={FORCE_EMPTY_STATE_PREVIEW ? 1 : historyQuery.data?.pageCount ?? 1}
          query={historyQueryText}
          onQueryChange={setHistoryQueryText}
          onClearQuery={() => {
            setHistoryQueryText('')
            setHistoryDebouncedQuery('')
            setHistoryPage(1)
          }}
          onPageChange={setHistoryPage}
          onSelect={openSession}
          onStartNewChat={startNewChat}
        />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: tokens.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.badge, { backgroundColor: tokens.accentSoft }]}>
            <BirdLandingMark size={26} color={tokens.accent} autoplay={false} perched />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
              {captureMode ? 'Log a few spends' : 'Ask Aviary'}
            </Text>
            <Text numberOfLines={1} style={[styles.subtitle, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
              {captureMode
                ? "Type them, I'll sort them"
                : brief ? `Reading ${brief.meta.txnCountThisMonth} transactions` : 'Reading your budget…'}
            </Text>
          </View>
        </View>
        {!captureMode && (
        <View style={[styles.headerActions, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
          <Pressable onPress={() => setView('history')} hitSlop={6} style={styles.pillButton}>
            <Icon icon={Clock} size={15} color={tokens.text2} />
            {historyCountQuery.data !== undefined && (
              <Text style={[styles.pillText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
                {historyCountQuery.data}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={startNewChat}
            hitSlop={6}
            style={[styles.pillButton, styles.pillButtonPrimary, { backgroundColor: tokens.accent }]}
          >
            <Icon icon={Plus} size={15} color={tokens.onAccent} strokeWidth={2.4} />
            <Text style={[styles.pillText, { color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold }]}>
              New
            </Text>
          </Pressable>
        </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {captureMode && messages.length === 0 && (
          <View style={{ flexGrow: 1, justifyContent: 'center', gap: 16 }}>
            <EmptyState
              subject="expenses"
              title="Dump your spends here"
              description="An amount and a word is enough. You'll check the list before anything's logged."
              style={{ paddingVertical: 0 }}
            />
            <View style={styles.exampleRow}>
              {CAPTURE_EXAMPLES.map((example, i) => (
                <PopIn key={example} play delay={MOUNT_START_DELAY_MS + BLOCK_STAGGER_MS + i * ITEM_STAGGER_MS}>
                  <ExampleChip label={example} onPress={() => setInput(example)} />
                </PopIn>
              ))}
            </View>
          </View>
        )}

        {!captureMode && !(messages.length === 0 && briefQ.isLoading) && (
        <PopIn play={playReveal} delay={MOUNT_START_DELAY_MS} style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Text style={[styles.cardLabel, { color: tokens.text2 }]}>THIS MONTH SO FAR</Text>
          <Text style={[styles.cardValue, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
            {formatCurrency(envelopeState.totalSpent, hideAmounts)} of{' '}
            {formatCurrency(envelopeState.totalAssigned, hideAmounts)} assigned
          </Text>
          <View style={{ marginTop: 8 }}>
            <ProgressBar pct={spentPct} />
          </View>
          {briefQ.isLoading ? (
            <View style={{ marginTop: 12 }}>
              <LoadingCaption />
            </View>
          ) : briefQ.isError ? (
            <View style={styles.errorRow}>
              <Text style={{ color: tokens.coral, fontSize: 12, fontFamily: fontFamily.bodyMedium, flex: 1 }}>
                Couldn&apos;t load your money brief.
              </Text>
              <Pressable onPress={() => briefQ.refetch()}>
                <Text style={{ color: tokens.accent, fontSize: 12, fontFamily: fontFamily.bodySemiBold }}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.narrative, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
              {brief?.narrative}
            </Text>
          )}
        </PopIn>
        )}

        {!captureMode && brief && (
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            {brief.cards.map((c, i) => (
              <PopIn
                key={i}
                play={playReveal}
                delay={MOUNT_START_DELAY_MS + BLOCK_STAGGER_MS + Math.min(i, ITEM_STAGGER_CAP_INDEX) * ITEM_STAGGER_MS}
              >
                <InsightCard
                  icon={c.icon}
                  title={c.title}
                  subtitle={c.subtitle}
                  valueLabel={c.valueLabel}
                  amount={c.amount}
                  tone={c.tone}
                  hideAmounts={hideAmounts}
                />
              </PopIn>
            ))}
          </View>
        )}

        {!captureMode && brief && brief.questions.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: tokens.text3 }]}>ASK ANYTHING</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {brief.questions.map((q, i) => (
                <PopIn
                  key={q}
                  play={playReveal}
                  delay={MOUNT_START_DELAY_MS + 2 * BLOCK_STAGGER_MS + Math.min(i, ITEM_STAGGER_CAP_INDEX) * ITEM_STAGGER_MS}
                >
                  <Pressable
                    onPress={() => send(q, 'chip')}
                    disabled={sending}
                    style={[styles.chip, { backgroundColor: tokens.pillBg, borderColor: tokens.border, opacity: sending ? 0.5 : 1 }]}
                  >
                    <Text style={[styles.chipText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
                      {q}
                    </Text>
                  </Pressable>
                </PopIn>
              ))}
            </ScrollView>
          </View>
        )}

        {!captureMode && messages.length === 0 && briefQ.isLoading && (
          <View style={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingCaption />
          </View>
        )}

        {messages.length > 0 && (
          <View style={{ gap: 10 }}>
            {messages.map((m, i) => {
              if (!m.text && !m.proposal) return null // empty placeholder while streaming hasn't started — BrainThinking covers it below
              return (
              <View key={i} style={{ gap: 8 }}>
                {m.text !== '' && (
                  <View
                    style={[
                      styles.bubble,
                      m.role === 'user'
                        ? { alignSelf: 'flex-end', backgroundColor: tokens.accentSoft }
                        : { alignSelf: 'flex-start', backgroundColor: tokens.card, borderColor: tokens.border, borderWidth: 1 },
                    ]}
                  >
                    {m.ack && (
                      <View style={[styles.ackKicker, { backgroundColor: tokens.mintSoft }]}>
                        <Icon icon={Check} size={12} color={tokens.mint} strokeWidth={3} />
                        <Text style={[styles.ackKickerText, { color: tokens.mint, fontFamily: fontFamily.bodyBold }]}>
                          {loggedLabel(messages[i - 1]?.proposal?.expenseIds?.length)}
                        </Text>
                      </View>
                    )}
                    {m.role === 'model' ? (
                      <ChatMarkdown text={m.text} />
                    ) : (
                      <Text style={{ color: tokens.text, fontSize: 14, fontFamily: fontFamily.bodyMedium }}>
                        {m.text}
                      </Text>
                    )}
                    {m.ack && (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => router.dismissTo('/(tabs)/activity')}
                        hitSlop={8}
                        style={styles.ackLink}
                      >
                        <Text style={[styles.ackLinkText, { color: tokens.accent, fontFamily: fontFamily.bodyBold }]}>See them in Activity</Text>
                        <Icon icon={ArrowRight} size={14} color={tokens.accent} />
                      </Pressable>
                    )}
                  </View>
                )}
                {m.proposal && (
                  <CaptureReview
                    key={m.proposal.id}
                    proposal={m.proposal}
                    loggedSummary={false}
                    onSettled={(status, expenseIds) => {
                      if (m.proposal) settleProposal(m.proposal.id, status, expenseIds)
                    }}
                  />
                )}
                {m.captureFailed && (
                  <Pressable
                    onPress={() => router.push('/modals/log-expense')}
                    style={[styles.chip, { alignSelf: 'flex-start', backgroundColor: tokens.pillBg, borderColor: tokens.border }]}
                  >
                    <Text style={[styles.chipText, { color: tokens.accent, fontFamily: fontFamily.bodySemiBold }]}>Add it by hand</Text>
                  </Pressable>
                )}
              </View>
              )
            })}
            {awaitingFirstDelta && <BrainThinking color={tokens.accent} />}
          </View>
        )}
      </ScrollView>

      <View style={[styles.inputRow, { borderTopColor: tokens.border, paddingBottom: insets.bottom + 12 }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={captureMode ? 'What did you spend?' : 'Ask about your money…'}
          autoFocus={captureMode}
          placeholderTextColor={tokens.text3}
          style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
          onSubmitEditing={() => send(input, 'typed')}
          // Grows as a list of spends wraps, up to the style's maxHeight; Return still sends.
          multiline
          submitBehavior="submit"
          editable={!sending}
        />
        <SendButton disabled={sending || input.trim() === ''} onPress={() => send(input, 'typed')} />
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 100, borderWidth: 1 },
  pillButton: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 10, borderRadius: 100 },
  pillButtonPrimary: { paddingHorizontal: 12 },
  pillText: { fontSize: 12, fontWeight: '700' },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 100 },
  newPillText: { fontSize: 12, fontWeight: '800' },
  iconButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18 },
  subtitle: { fontSize: 12, marginTop: 2 },
  body: { flexGrow: 1, padding: 20, paddingTop: 4, gap: 16 },
  card: { padding: 18, borderRadius: 20, borderWidth: 1 },
  cardLabel: { fontSize: 10, letterSpacing: 0.6 },
  cardValue: { fontSize: 18, marginTop: 6 },
  narrative: { fontSize: 13, marginTop: 12, lineHeight: 19 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.6 },
  chipRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  exampleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  chipText: { fontSize: 13 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 14, minHeight: 44, maxHeight: 160 },
  ackKicker: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginBottom: 6, paddingLeft: 7, paddingRight: 10, paddingVertical: 3, borderRadius: 100 },
  ackKickerText: { fontSize: 12 },
  ackLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  ackLinkText: { fontSize: 13 },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
