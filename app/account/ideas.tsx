import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowFatDown, ArrowFatUp, ArrowLeft, CalendarDots, Hourglass, Lightbulb, SealCheck, XCircle, type PhosphorIcon } from '@/src/components/shared/icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Alert } from '@/src/components/ui/AlertHost'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { BottomSheet } from '@/src/components/shared/Modal'
import { LoadingPhrase } from '@/src/components/shared/LoadingPhrase'
import { Chip } from '@/src/components/ui/Chip'
import { Button } from '@/src/components/ui/Button'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { listIdeas, postIdea, voteIdea, type Idea, type IdeaSort, type IdeaStatus } from '@/src/api/ideas'
import { applyVote, toggleVote, type VoteValue } from '@/src/lib/ideaVotes'
import { track } from '@/src/lib/analytics'
import { formatRelativeTime } from '@/src/lib/format'
import type { ThemeTokens } from '@/src/theme/tokens'

const STATUS_LABEL: Record<IdeaStatus, string> = {
  open: 'Open',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  declined: 'Declined',
}
const STATUS_ICON: Record<IdeaStatus, PhosphorIcon> = {
  open: Lightbulb,
  planned: CalendarDots,
  in_progress: Hourglass,
  shipped: SealCheck,
  declined: XCircle,
}
const STATUSES = Object.keys(STATUS_LABEL) as IdeaStatus[]

/** Status pill colours, matching Web's .ideas-status.is-* tints. */
function statusColors(status: IdeaStatus, tokens: ThemeTokens): { bg: string; fg: string } {
  switch (status) {
    case 'planned': return { bg: tokens.blueSoft, fg: tokens.blue }
    case 'in_progress': return { bg: tokens.warnSoft, fg: tokens.warnInk }
    case 'shipped': return { bg: tokens.mintSoft, fg: tokens.mint }
    case 'declined': return { bg: tokens.coralSoft, fg: tokens.coral }
    default: return { bg: tokens.pillBg, fg: tokens.text2 }
  }
}
const LOADING_PHRASES = ['Gathering ideas…', 'Counting the votes…']

/**
 * The feedback board. Twin of Web's /account/ideas: ideas are public to every
 * signed-in user, votes are one per person (tap again to clear, tap the other
 * arrow to switch). Bug reports stay private in account/feedback.tsx.
 */
export default function IdeasScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [sort, setSort] = useState<IdeaSort>('top')
  const [status, setStatus] = useState<IdeaStatus | null>(null)
  const [adding, setAdding] = useState(false)
  const key = ['ideas', sort, status] as const
  const { data: ideas, isLoading, isError } = useQuery({ queryKey: key, queryFn: () => listIdeas(sort, status) })

  const vote = useMutation({
    mutationFn: ({ id, value }: { id: string; value: VoteValue }) => voteIdea(id, value),
    // One at a time, in tap order: parallel requests could land out of order
    // and save an earlier tap over the last one.
    mutationKey: ['idea-vote'],
    scope: { id: 'idea-vote' },
    onSuccess: (_result, { value }) => track('idea_voted', { value }),
    // The server's counts win once the last queued vote lands; a failed vote
    // just snaps back. Refetching sooner would overwrite the optimistic state
    // of taps still waiting their turn. (The settling vote still counts here.)
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ['idea-vote'] }) <= 1) queryClient.invalidateQueries({ queryKey: ['ideas'] })
    },
  })

  function tap(idea: Idea, arrow: 1 | -1) {
    const next = toggleVote(idea.myVote, arrow)
    // A refetch already in flight would land on top of this tap.
    queryClient.cancelQueries({ queryKey: ['ideas'] })
    queryClient.setQueryData<Idea[]>(key, (rows) =>
      rows?.map((r) => (r.id === idea.id ? { ...r, ...applyVote(r, r.myVote, next), myVote: next } : r)),
    )
    vote.mutate({ id: idea.id, value: next })
  }

  const note = isError ? "Couldn't load the board. Check your connection and try again." : null

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Feedback board</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={[styles.intro, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          Post an idea or vote on what we build next. Found a bug?{' '}
          <Text onPress={() => router.push('/account/feedback')} accessibilityRole="link" style={{ color: tokens.accentInk, fontFamily: fontFamily.bodyBold }}>
            Report it privately
          </Text>
          .
        </Text>

        <View style={styles.toolbar}>
          <View style={styles.tabs} accessibilityRole="tablist">
            {(['top', 'new'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setSort(s)}
                accessibilityRole="tab"
                accessibilityState={{ selected: sort === s }}
                style={[styles.tab, { borderBottomColor: sort === s ? tokens.accentInk : 'transparent' }]}
              >
                <Text style={[styles.tabText, { color: sort === s ? tokens.text : tokens.text3, fontFamily: fontFamily.bodyBold }]}>
                  {s === 'top' ? 'Top' : 'New'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button label="Pitch an idea" size="compact" onPress={() => setAdding(true)} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" soft selected={status === null} onPress={() => setStatus(null)} />
          {STATUSES.map((s) => (
            <Chip key={s} label={STATUS_LABEL[s]} soft selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </ScrollView>

        {isLoading && <LoadingPhrase phrases={LOADING_PHRASES} color={tokens.text2} style={{ fontFamily: fontFamily.bodyMedium, textAlign: 'center' }} />}
        {note && <Text style={[styles.note, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{note}</Text>}
        {!isError && ideas?.length === 0 && (
          // Web's empty board, word for word.
          <View style={[styles.empty, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            {status ? (
              <EmptyState compact subject="chat" mood="searching" title="Nothing here yet" description={`No ideas are ${STATUS_LABEL[status].toLowerCase()} right now. Try another status.`} />
            ) : (
              <EmptyState compact subject="chat" title="The board's quiet" description="Nobody's pitched an idea yet. Yours could be the first one the flock votes on." action={{ label: 'Pitch an idea', onPress: () => setAdding(true) }} />
            )}
          </View>
        )}

        {ideas?.map((idea) => {
          const author = idea.mine ? 'You' : (idea.authorFirstName ?? 'Someone')
          const pill = statusColors(idea.status, tokens)
          const voteColor = idea.myVote === 1 ? tokens.accent : idea.myVote === -1 ? tokens.violet : tokens.text
          return (
            <View key={idea.id} style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={styles.meta}>
                  <View style={[styles.status, { backgroundColor: pill.bg }]}>
                    <Icon icon={STATUS_ICON[idea.status]} size={12} color={pill.fg} weight="bold" />
                    <Text style={[styles.metaText, { color: pill.fg, fontFamily: fontFamily.bodyBold }]}>{STATUS_LABEL[idea.status]}</Text>
                  </View>
                  <View style={styles.author}>
                    <View style={[styles.avatar, { backgroundColor: tokens.accentSoft }]}>
                      <Text style={[styles.avatarText, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}>{author.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.metaText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{author}</Text>
                  </View>
                  <Text style={[styles.metaText, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
                    · {formatRelativeTime(Date.parse(idea.createdAt))}
                  </Text>
                </View>
                <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{idea.title}</Text>
                {!!idea.description && (
                  <Text numberOfLines={3} style={[styles.description, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{idea.description}</Text>
                )}
              </View>
              <View
                style={[styles.vote, { backgroundColor: idea.myVote === 1 ? tokens.accentSoft : tokens.inputBg }]}
                accessibilityLabel={`Score ${idea.score}`}
              >
                <VoteArrow icon={ArrowFatUp} label="Upvote" on={idea.myVote === 1} color={tokens.accent} onPress={() => tap(idea, 1)} />
                <Text style={[styles.score, { color: voteColor, fontFamily: fontFamily.bodyBold }]}>{idea.score}</Text>
                <VoteArrow icon={ArrowFatDown} label="Downvote" on={idea.myVote === -1} color={tokens.violet} onPress={() => tap(idea, -1)} />
              </View>
            </View>
          )
        })}
      </ScrollView>

      <BottomSheet visible={adding} onClose={() => setAdding(false)}>
        <IdeaForm
          onPosted={() => {
            setAdding(false)
            queryClient.invalidateQueries({ queryKey: ['ideas'] })
          }}
        />
      </BottomSheet>
    </View>
  )
}

function VoteArrow({ icon, label, on, color, onPress }: { icon: PhosphorIcon; label: string; on: boolean; color: string; onPress: () => void }) {
  const { tokens } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={styles.arrow}
    >
      <Icon icon={icon} size={16} color={on ? color : tokens.text2} weight={on ? 'fill' : 'bold'} />
    </Pressable>
  )
}

function IdeaForm({ onPosted }: { onPosted: () => void }) {
  const { tokens } = useTheme()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const canSubmit = title.trim() !== ''

  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(onPosted, 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent])

  async function handleSubmit() {
    if (!canSubmit || sending || sent) return
    setSending(true)
    try {
      await postIdea(title, description)
      track('idea_posted')
      setSent(true)
    } catch (err) {
      Alert.alert(
        "Couldn't post that",
        err instanceof Error && err.message === 'rate_limited' ? "You've posted a few already. Try again later." : 'Check your connection and try again.',
      )
    } finally {
      setSending(false)
    }
  }

  const inputStyle = [styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Post an idea</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="What would make Aviary better?" placeholderTextColor={tokens.text3} maxLength={150} style={inputStyle} autoFocus />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Why would it help you? (optional)"
        maxLength={4000}
        placeholderTextColor={tokens.text3}
        multiline
        numberOfLines={4}
        style={[inputStyle, styles.textArea]}
      />
      <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
        Everyone on the board sees your idea and your first name.
      </Text>
      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit || sending || sent}
        style={[styles.confirmButton, { backgroundColor: sent ? tokens.mint : tokens.accent, opacity: !canSubmit || sending ? 0.5 : 1 }]}
      >
        {sent ? (
          <CheckIcon color={tokens.onAccent} />
        ) : (
          <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{sending ? 'Posting…' : 'Post idea'}</Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19 },
  scrollContent: { padding: 16, gap: 12 },
  intro: { fontSize: 13, lineHeight: 18 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  tabs: { flexDirection: 'row', gap: 20 },
  tab: { paddingVertical: 6, borderBottomWidth: 2 },
  tabText: { fontSize: 16 },
  note: { fontSize: 13, textAlign: 'center', marginTop: 12 },
  empty: { borderWidth: 1, borderRadius: 16, marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  metaText: { fontSize: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 100 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12 },
  title: { fontSize: 16, lineHeight: 21 },
  description: { fontSize: 13, lineHeight: 19 },
  vote: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4, borderRadius: 100 },
  arrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 14, fontVariant: ['tabular-nums'], minWidth: 24, textAlign: 'center' },
  sheetTitle: { fontSize: 19 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  hint: { fontSize: 12, lineHeight: 16 },
  confirmButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: 16 },
})
