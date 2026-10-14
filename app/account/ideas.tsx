import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bug, CaretDown, CaretUp, Plus } from '@/src/components/shared/icons'
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
import { listIdeas, postIdea, voteIdea, type Idea, type IdeaSort, type IdeaStatus } from '@/src/api/ideas'
import { applyVote, toggleVote, type VoteValue } from '@/src/lib/ideaVotes'
import { track } from '@/src/lib/analytics'

const STATUS_LABEL: Record<IdeaStatus, string> = {
  open: 'Open',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  declined: 'Declined',
}
const STATUSES = Object.keys(STATUS_LABEL) as IdeaStatus[]
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

  const note = isError
    ? "Couldn't load the board. Check your connection and try again."
    : ideas?.length === 0
      ? status
        ? 'No ideas with this status yet.'
        : 'No ideas yet. Be the first.'
      : null

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
          Post an idea or vote on what we build next. We read every one.
        </Text>
        <View style={styles.actions}>
          <Button label="Post an idea" icon={Plus} onPress={() => setAdding(true)} style={{ flex: 1 }} />
          <Button label="Report a bug" icon={Bug} variant="secondary" onPress={() => router.push('/account/feedback')} style={{ flex: 1 }} />
        </View>

        <View style={styles.chips}>
          <Chip label="Top" selected={sort === 'top'} onPress={() => setSort('top')} />
          <Chip label="New" selected={sort === 'new'} onPress={() => setSort('new')} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" selected={status === null} onPress={() => setStatus(null)} />
          {STATUSES.map((s) => (
            <Chip key={s} label={STATUS_LABEL[s]} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </ScrollView>

        {isLoading && <LoadingPhrase phrases={LOADING_PHRASES} color={tokens.text2} style={{ fontFamily: fontFamily.bodyMedium, textAlign: 'center' }} />}
        {note && <Text style={[styles.note, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{note}</Text>}

        {ideas?.map((idea) => (
          <View key={idea.id} style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <View style={styles.vote} accessibilityLabel={`Score ${idea.score}`}>
              <VoteArrow icon={CaretUp} label="Upvote" on={idea.myVote === 1} onPress={() => tap(idea, 1)} />
              <Text style={[styles.score, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{idea.score}</Text>
              <VoteArrow icon={CaretDown} label="Downvote" on={idea.myVote === -1} onPress={() => tap(idea, -1)} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{idea.title}</Text>
              {!!idea.description && (
                <Text style={[styles.description, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{idea.description}</Text>
              )}
              <View style={styles.meta}>
                <View style={[styles.status, { backgroundColor: idea.status === 'shipped' ? tokens.mintSoft : tokens.pillBg }]}>
                  <Text style={[styles.statusText, { color: idea.status === 'shipped' ? tokens.mint : tokens.text2, fontFamily: fontFamily.bodyBold }]}>
                    {STATUS_LABEL[idea.status]}
                  </Text>
                </View>
                <Text style={[styles.author, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
                  {idea.mine ? 'You' : (idea.authorFirstName ?? 'Someone')}
                </Text>
              </View>
            </View>
          </View>
        ))}
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

function VoteArrow({ icon, label, on, onPress }: { icon: typeof CaretUp; label: string; on: boolean; onPress: () => void }) {
  const { tokens } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={[styles.arrow, { backgroundColor: on ? tokens.accent : tokens.pillBg }]}
    >
      <Icon icon={icon} size={18} color={on ? tokens.onAccent : tokens.text2} />
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
  actions: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', gap: 8 },
  note: { fontSize: 13, textAlign: 'center', marginTop: 12 },
  card: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 20, padding: 14 },
  vote: { alignItems: 'center', gap: 4, minWidth: 36 },
  arrow: { width: 34, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 15, fontVariant: ['tabular-nums'] },
  title: { fontSize: 15 },
  description: { fontSize: 13, lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  status: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 100 },
  statusText: { fontSize: 12 },
  author: { fontSize: 12 },
  sheetTitle: { fontSize: 19 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  hint: { fontSize: 12, lineHeight: 16 },
  confirmButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: 16 },
})
