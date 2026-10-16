import { memo, useCallback, useMemo, useRef, useState, type ReactElement } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View, type RefreshControlProps } from 'react-native'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { DeletingRow } from '@/src/components/activity/DeletingRow'
import { TransactionDetail, type CardRect } from '@/src/components/activity/TransactionDetail'
import { useNavPadding } from '@/src/components/ui/Screen'
import { useExpensesFeed } from '@/src/hooks/useExpenses'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { categoryTint, splitEmoji } from '@/src/lib/emoji'
import { groupByDay, stablePhotoUrl, type FeedItem } from '@/src/lib/activityFeed'
import { formatDayLabel } from '@/src/lib/date'
import { EMPTY } from '@/src/lib/constants'
import type { CategoryRow, ExpenseRow } from '@/src/types'

const FEED_PAGE_SIZE = 12

const cardKey = (t: ExpenseRow) => t.id || `${t.timestamp}-${t.item}`

type FeedParams = { category?: string; account?: string; from?: string; to?: string; q?: string }

/**
 * Activity's feed view: every expense as a post, photo first, newest at the
 * top, loading more as you scroll. Expenses without a photo show their
 * category on its tint. Income stays in the
 * list view; this is the story of your spending. Tapping a card opens it
 * up into the expense's detail page.
 */
export function ActivityFeed({ params, header, empty, categoryByName, accountNameOf, onOpenActions, onEdit, onDelete, isDeleting, onDeleteDone, refreshControl }: {
  params: FeedParams
  /** Search and filters, scrolled away with the feed like the list's. */
  header: ReactElement
  /** Shown when the filters match nothing. */
  empty: ReactElement
  categoryByName: Map<string, CategoryRow>
  accountNameOf: (id: string | undefined) => string
  /** Long-press: the quick Edit / Delete sheet. */
  onOpenActions: (txn: ExpenseRow) => void
  onEdit: (txn: ExpenseRow) => void
  /** Asks to delete; the detail page is already closed by then. */
  onDelete: (txn: ExpenseRow) => void
  /** The confirmed delete whose card should collapse, then `onDeleteDone` sends it. */
  isDeleting: (txn: ExpenseRow) => boolean
  onDeleteDone: () => void
  refreshControl: ReactElement<RefreshControlProps>
}) {
  const { tokens, space } = useTheme()
  const navPad = useNavPadding()
  const feed = useExpensesFeed({ limit: FEED_PAGE_SIZE, ...params })
  const rows = useMemo(() => feed.data?.pages.flatMap((p) => p.rows) ?? EMPTY, [feed.data])
  const items = useMemo(() => groupByDay(rows), [rows])
  const [detail, setDetail] = useState<{ txn: ExpenseRow; rect: CardRect; uri: string | null } | null>(null)
  const openDetail = useCallback((txn: ExpenseRow, rect: CardRect, uri: string | null) => setDetail({ txn, rect, uri }), [])

  const caption = { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: 12, textAlign: 'center' as const }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(i: FeedItem) => (i.kind === 'day' ? `day-${i.date}` : `card-${cardKey(i.txn)}`)}
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <Text accessibilityRole="header" style={[styles.day, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold, marginTop: space.md }]}>
              {formatDayLabel(item.date)}
            </Text>
          ) : (
            <DeletingRow active={isDeleting(item.txn)} onDone={onDeleteDone}>
              <FeedCard
                txn={item.txn}
                category={categoryByName.get(item.txn.category)}
                // Hidden while it's open, so the page reads as the card itself lifting off.
                hidden={detail !== null && cardKey(detail.txn) === cardKey(item.txn)}
                onOpenActions={onOpenActions}
                onOpen={openDetail}
              />
            </DeletingRow>
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          feed.isLoading ? (
            <ActivityIndicator color={tokens.text3} style={{ marginTop: space.xl }} />
          ) : feed.isError ? (
            <Text style={[caption, { marginTop: space.xl }]}>Couldn&apos;t load your feed. Pull down to try again.</Text>
          ) : (
            empty
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={tokens.text3} style={{ marginVertical: space.lg }} />
          ) : rows.length > 0 && !feed.hasNextPage ? (
            <Text style={[caption, { marginVertical: space.lg }]}>You&apos;re all caught up.</Text>
          ) : null
        }
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage()
        }}
        onEndReachedThreshold={1.5}
        refreshControl={refreshControl}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: navPad }}
        showsVerticalScrollIndicator={false}
      />
      {detail && (
        <TransactionDetail
          txn={detail.txn}
          from={detail.rect}
          photoUri={detail.uri}
          category={categoryByName.get(detail.txn.category)}
          account={accountNameOf(detail.txn.account_id)}
          onClosed={() => setDetail(null)}
          onEdit={(t) => {
            setDetail(null)
            onEdit(t)
          }}
          onDelete={onDelete}
        />
      )}
    </>
  )
}

// Memoised so opening one card's page doesn't re-render every card in the feed.
const FeedCard = memo(function FeedCard({ txn, category, hidden, onOpenActions, onOpen }: {
  txn: ExpenseRow
  category?: CategoryRow
  hidden: boolean
  onOpenActions: (txn: ExpenseRow) => void
  onOpen: (txn: ExpenseRow, rect: CardRect, uri: string | null) => void
}) {
  const { tokens, space, radius } = useTheme()
  const { hideAmounts } = usePrivacy()
  const { formatCurrency } = useCurrency()
  const tint = categoryTint(txn.category, tokens)
  const uri = useMemo(() => (txn.photo_url ? stablePhotoUrl(txn.photo_url) : null), [txn.photo_url])
  const cardRef = useRef<View>(null)
  function open() {
    cardRef.current?.measureInWindow((x, y, width, height) => onOpen(txn, { x, y, width, height }, uri))
  }

  const name = splitEmoji(txn.category).text
  const notes = txn.notes?.trim()

  return (
    <View ref={cardRef} style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, marginTop: space.sm, opacity: hidden ? 0 : 1 }]}>
      <Pressable
        onPress={open}
        onLongPress={() => onOpenActions(txn)}
        accessibilityRole="button"
        accessibilityLabel={`${txn.item}, ${name}. View details`}
        style={[styles.head, { padding: space.md, gap: space.md }]}
      >
        <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
          <CategoryIcon name={txn.category} icon={category?.icon} group={category?.group} size={16} color={tint.ink} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>{txn.item}</Text>
          <Text numberOfLines={1} style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: 12, marginTop: 2 }}>{name}</Text>
        </View>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>
          {formatCurrency(Number(txn.amount_inr) || 0, hideAmounts)}
        </Text>
      </Pressable>

      {/* Same as the header for touch; VoiceOver gets the one button above. */}
      <Pressable onPress={open} onLongPress={() => onOpenActions(txn)} accessible={false}>
        {uri ? (
          <Image source={{ uri }} style={[styles.photo, { backgroundColor: tokens.inputBg }]} />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: tint.bg }]}>
            <CategoryIcon name={txn.category} icon={category?.icon} group={category?.group} size={56} color={tint.ink} />
          </View>
        )}
      </Pressable>

      {notes ? (
        <Text numberOfLines={3} style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: 14, padding: space.md }}>
          {notes}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  day: { fontSize: 13 },
  card: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', aspectRatio: 1 },
  placeholder: { width: '100%', aspectRatio: 3 / 2, alignItems: 'center', justifyContent: 'center' },
})
