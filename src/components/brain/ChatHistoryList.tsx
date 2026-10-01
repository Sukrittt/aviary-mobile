import { useRef } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { Icon } from '@/src/components/shared/Icon'
import { PopIn } from '@/src/components/shared/PopIn'
import type { ChatSessionSummary } from '@/src/api/ai'

/** Written by hand (no Intl) per this app's date-formatting convention — see EnvelopeRow.tsx's lastSpentLabel. */
function timeAgoLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const minutes = Math.round((Date.now() - d.getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

const DAY_ORDER = ['Today', 'Yesterday', 'Earlier'] as const
type DayBucket = (typeof DAY_ORDER)[number]

/** Buckets by calendar day (not a rolling 24h window), same hand-written style as timeAgoLabel above. */
function dayBucket(iso: string): DayBucket {
  const d = new Date(iso)
  const now = new Date()
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return 'Earlier'
}

interface Props {
  sessions: ChatSessionSummary[] | undefined
  loading: boolean
  page: number
  pageCount: number
  query: string
  onQueryChange: (text: string) => void
  onClearQuery: () => void
  onPageChange: (page: number) => void
  onSelect: (id: string) => void
  onStartNewChat: () => void
}

export function ChatHistoryList({
  sessions,
  loading,
  page,
  pageCount,
  query,
  onQueryChange,
  onClearQuery,
  onPageChange,
  onSelect,
  onStartNewChat,
}: Props) {
  const { tokens } = useTheme()
  const scrollRef = useRef<ScrollView>(null)

  // Smooth-scroll to top only when moving forward (mirrors archive.tsx's pager) —
  // going back to a page the user just scrolled down shouldn't yank them to the top.
  const goToPage = (target: number) => {
    onPageChange(target)
    if (target > page) {
      scrollRef.current?.scrollTo({ y: 0, animated: true })
    }
  }

  const groups = DAY_ORDER.map((label) => ({
    label,
    items: (sessions ?? []).filter((s) => dayBucket(s.updatedAt) === label),
  })).filter((g) => g.items.length > 0)
  // Stagger index runs across groups so rows pop in top-to-bottom, capped like money-brain.tsx's reveal.
  const revealIndex = new Map((sessions ?? []).map((s, i) => [s.id, Math.min(i, 6)]))

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.searchRow, { backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong }]}>
        <Icon icon={Search} size={16} color={tokens.text3} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search your chats…"
          placeholderTextColor={tokens.text3}
          style={[styles.searchInput, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
        />
        {query.length > 0 && (
          <Pressable onPress={onClearQuery} style={[styles.clearButton, { backgroundColor: tokens.border }]}>
            <Text style={{ color: tokens.text2, fontSize: 12 }}>✕</Text>
          </Pressable>
        )}
      </View>

      {loading && !sessions ? (
        <View style={{ paddingTop: 24 }}>
          <LoadingCaption />
        </View>
      ) : !sessions || sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
            {query ? `No chats match "${query}"` : 'No past chats yet'}
          </Text>
          {query ? (
            <>
              <Text style={[styles.emptyText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                Try a shorter phrase, or start a new chat about it.
              </Text>
              <Pressable
                onPress={onStartNewChat}
                style={[styles.emptyButton, { backgroundColor: tokens.accent }]}
              >
                <Text style={{ color: tokens.onAccent, fontSize: 13, fontFamily: fontFamily.bodySemiBold }}>
                  Ask Aviary
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.list}>
          {groups.map((g) => (
            <View key={g.label} style={{ gap: 8 }}>
              <Text style={[styles.groupLabel, { color: tokens.text3 }]}>{g.label.toUpperCase()}</Text>
              <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                {g.items.map((s, i) => (
                  <PopIn key={s.id} play delay={(revealIndex.get(s.id) ?? 0) * 45}>
                  <Pressable
                    onPress={() => onSelect(s.id)}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }]}
                  >
                    <Text
                      style={[styles.title, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
                      numberOfLines={1}
                    >
                      {s.title}
                    </Text>
                    <Text
                      style={[styles.preview, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}
                      numberOfLines={1}
                    >
                      {s.preview}
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={[styles.meta, { color: tokens.text3 }]}>{timeAgoLabel(s.updatedAt)}</Text>
                      <View style={[styles.dot, { backgroundColor: tokens.text3 }]} />
                      <Text style={[styles.meta, { color: tokens.text3 }]}>{s.messageCount} messages</Text>
                    </View>
                  </Pressable>
                  </PopIn>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {pageCount > 1 && (
        <View style={[styles.pager, { backgroundColor: tokens.headerBg, borderTopColor: tokens.border }]}>
          <Pressable
            onPress={() => page > 1 && goToPage(page - 1)}
            disabled={page <= 1}
            style={[styles.arrow, { borderColor: tokens.borderStrong, backgroundColor: tokens.inputBg, opacity: page <= 1 ? 0.4 : 1 }]}
          >
            <Icon icon={ChevronLeft} size={16} color={tokens.text} />
          </Pressable>
          <View style={styles.pagePills}>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <Pressable
                key={p}
                onPress={() => goToPage(p)}
                style={[
                  styles.pagePill,
                  p === page
                    ? { backgroundColor: tokens.accent }
                    : { borderWidth: 1, borderColor: tokens.borderStrong, backgroundColor: tokens.inputBg },
                ]}
              >
                <Text
                  style={{
                    color: p === page ? tokens.onAccent : tokens.text2,
                    fontSize: 13,
                    fontFamily: fontFamily.bodySemiBold,
                  }}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => page < pageCount && goToPage(page + 1)}
            disabled={page >= pageCount}
            style={[styles.arrow, { borderColor: tokens.borderStrong, backgroundColor: tokens.inputBg, opacity: page >= pageCount ? 0.4 : 1 }]}
          >
            <Icon icon={ChevronRight} size={16} color={tokens.text} />
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  clearButton: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 20, gap: 16 },
  groupLabel: { fontSize: 11, letterSpacing: 0.6, fontWeight: '700', paddingLeft: 2 },
  card: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  row: { padding: 16, gap: 4 },
  title: { fontSize: 14 },
  preview: { fontSize: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  meta: { fontSize: 11 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  empty: { paddingTop: 40, alignItems: 'center', gap: 10, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, textAlign: 'center' },
  emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  emptyButton: { marginTop: 4, height: 42, paddingHorizontal: 18, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  arrow: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pagePills: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pagePill: { minWidth: 34, height: 34, paddingHorizontal: 10, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
})
