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
import { ArrowLeft, ArrowUp, Clock, Plus } from 'lucide-react-native'
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
import { streamChat, getChatSession, type ChatMessage } from '@/src/api/ai'
import { startTimer, track } from '@/src/lib/analytics'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { useOnline } from '@/src/lib/netStatus'
import { useQuery } from '@tanstack/react-query'
import { getSystemStatus } from '@/src/api/systemStatus'
import { AiAllowanceScreen, AiUnavailableScreen } from '@/src/components/shared/AiUnavailableScreen'

// Reveal cascade for the first paint of loaded brief content — see Heatmap.tsx
// for the same shared-value-driven pattern and why `entering` isn't used here.
const MOUNT_START_DELAY_MS = 100
const BLOCK_STAGGER_MS = 90
const ITEM_STAGGER_MS = 45
const ITEM_STAGGER_CAP_INDEX = 6

export default function MoneyBrainModal() {
  const { formatCurrency } = useCurrency()

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
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<ScrollView>(null)

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
    return () => abortRef.current?.abort()
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
    const elapsed = startTimer()
    const answered = (ok: boolean, reason?: string) =>
      track('money_brain_answered', { ok, seconds: elapsed(), ...(reason ? { reason } : {}) })

    streamChat(
      sessionId,
      history,
      (delta) => {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { ...last, text: last.text + delta }
          return copy
        })
      },
      controller.signal,
    )
      .then((resolvedSessionId) => {
        answered(true)
        setSessionId(resolvedSessionId)
      })
      .catch((err) => {
        // A new chat aborts the old stream on purpose; that's not a failed answer.
        if (!controller.signal.aborted) answered(false, isAiAllowanceError(err) ? 'ai_allowance' : 'error')
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = {
            role: 'model',
            text: isAiAllowanceError(err) ? "You've used this month's AI allowance." : 'Something went wrong. Try again.',
          }
          return copy
        })
      })
      .finally(() => setSending(false))
  }

  function startNewChat() {
    abortRef.current?.abort()
    setSending(false)
    setMessages([])
    setSessionId(null)
    setInput('')
    setView('chat')
    setHistoryQueryText('')
    setHistoryPage(1)
  }

  async function openSession(id: string) {
    try {
      const detail = await getChatSession(id)
      setMessages(detail.messages)
      setSessionId(detail.id)
      setView('chat')
    } catch {
      Alert.alert('Could not load chat', 'Check your connection and try again.')
    }
  }

  const lastMessage = messages[messages.length - 1]
  const awaitingFirstDelta = sending && lastMessage?.role === 'model' && lastMessage.text === ''

  if (!online) return <OfflineScreen />
  if (statusQ.data?.aiDisabled) return <AiUnavailableScreen />
  if (isAiAllowanceError(briefQ.error)) return <AiAllowanceScreen />

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
          sessions={historyQuery.data?.sessions}
          loading={historyQuery.isLoading}
          page={historyPage}
          pageCount={historyQuery.data?.pageCount ?? 1}
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
            <BirdLandingMark size={26} color={tokens.accent} autoplay={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
              Money brain
            </Text>
            <Text numberOfLines={1} style={[styles.subtitle, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
              {brief ? `Reading ${brief.meta.txnCountThisMonth} transactions` : 'Reading your budget…'}
            </Text>
          </View>
        </View>
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
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {!(messages.length === 0 && briefQ.isLoading) && (
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

        {brief && (
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

        {brief && brief.questions.length > 0 && (
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

        {messages.length === 0 && briefQ.isLoading && (
          <View style={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingCaption />
          </View>
        )}

        {messages.length > 0 && (
          <View style={{ gap: 10 }}>
            {messages.map((m, i) => {
              if (!m.text) return null // empty placeholder while streaming hasn't started — BrainThinking covers it below
              return (
              <View
                key={i}
                style={[
                  styles.bubble,
                  m.role === 'user'
                    ? { alignSelf: 'flex-end', backgroundColor: tokens.accentSoft }
                    : { alignSelf: 'flex-start', backgroundColor: tokens.card, borderColor: tokens.border, borderWidth: 1 },
                ]}
              >
                {m.role === 'model' ? (
                  <ChatMarkdown text={m.text} />
                ) : (
                  <Text style={{ color: tokens.text, fontSize: 14, fontFamily: fontFamily.bodyMedium }}>
                    {m.text}
                  </Text>
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
          placeholder="Ask about your money…"
          placeholderTextColor={tokens.text3}
          style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
          onSubmitEditing={() => send(input, 'typed')}
          editable={!sending}
        />
        <Pressable
          onPress={() => send(input, 'typed')}
          disabled={sending || input.trim() === ''}
          style={[styles.sendButton, { backgroundColor: tokens.accent, opacity: sending || input.trim() === '' ? 0.5 : 1 }]}
        >
          <Icon icon={ArrowUp} size={18} color={tokens.onAccent} />
        </Pressable>
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
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  chipText: { fontSize: 13 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
