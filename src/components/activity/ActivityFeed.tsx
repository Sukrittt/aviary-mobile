import { useCategoryTint } from '@/src/hooks/useCategories'
import { memo, useCallback, useMemo, useRef, useState, type ReactElement } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View, type RefreshControlProps } from 'react-native'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { Icon } from '@/src/components/shared/Icon'
import { MoneyWavy } from '@/src/components/shared/icons'
import { FeedSkeleton } from '@/src/components/shared/TabSkeleton'
import { DeletingRow } from '@/src/components/activity/DeletingRow'
import { TransactionDetail, type CardRect } from '@/src/components/activity/TransactionDetail'
import { useNavPadding } from '@/src/components/ui/Screen'
import { useExpensesFeed } from '@/src/hooks/useExpenses'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { splitEmoji } from '@/src/lib/emoji'
import { groupByDay, incomesInWindow, stablePhotoUrl, type FeedItem } from '@/src/lib/activityFeed'
import { formatDayLabel } from '@/src/lib/date'
import { EMPTY } from '@/src/lib/constants'
import type { CategoryRow, ExpenseRow, IncomeRow } from '@/src/types'

const cardKey = (t: ExpenseRow) => t.id || `${t.timestamp}-${t.item}`

type FeedParams = { category?: string; account?: string; from?: string; to?: string; q?: string }

/**
 * Activity's feed view: every expense as a post, photo first, newest at the
 * top, loading more as you scroll. Expenses without a photo stay a compact
 * card, just the header and notes, so photos stand out. Income gets a compact
 * card of its own, slotted in by date like the list. Tapping an expense opens
 * it up into its detail page; tapping income opens Income.
 */
export function ActivityFeed({ params, incomes, onOpenIncome, header, empty, categoryByName, accountNameOf, onOpenActions, onEdit, onDelete, isDeleting, onDeleteDone, refreshControl }: {
  params: FeedParams
  /** Income already matched to the filters; the feed shows what falls in its loaded pages. */
  incomes: readonly IncomeRow[]
  onOpenIncome: () => void
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
  const feed = useExpensesFeed(params)
  const rows = useMemo(() => feed.data?.pages.flatMap((p) => p.rows) ?? EMPTY, [feed.data])
  const hasNewer = feed.hasPreviousPage
  const hasOlder = feed.hasNextPage
  const items = useMemo(
    () => groupByDay(rows, feed.isLoading ? EMPTY : incomesInWindow(incomes, rows, { hasNewer, hasOlder })),
    [rows, incomes, hasNewer, hasOlder, feed.isLoading],
  )
  const [detail, setDetail] = useState<{ txn: ExpenseRow; rect: CardRect; uri: string | null } | null>(null)
  const openDetail = useCallback((txn: ExpenseRow, rect: CardRect, uri: string | null) => setDetail({ txn, rect, uri }), [])

  const caption = { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: 12, textAlign: 'center' as const }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(i: FeedItem) =>
          i.kind === 'day' ? `day-${i.date}` : i.kind === 'income' ? `income-${i.income.id}` : `card-${cardKey(i.txn)}`
        }
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <Text accessibilityRole="header" style={[styles.day, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold, marginTop: space.md }]}>
              {formatDayLabel(item.date)}
            </Text>
          ) : item.kind === 'income' ? (
            <IncomeCard income={item.income} account={accountNameOf(item.income.account_id)} onOpen={onOpenIncome} />
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
            <FeedSkeleton />
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
        // The feed keeps a window of pages; scrolling back up brings the dropped ones back.
        onStartReached={() => {
          if (feed.hasPreviousPage && !feed.isFetchingPreviousPage) void feed.fetchPreviousPage()
        }}
        onStartReachedThreshold={1.5}
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
        refreshControl={refreshControl}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: navPad }}
        showsVerticalScrollIndicator={false}
      />
      {detail && (
        <TransactionDetail
          txn={detail.txn}
          from={detail.rect}
          photoUri={detail.uri}
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

const IncomeCard = memo(function IncomeCard({ income, account, onOpen }: {
  income: IncomeRow
  account: string
  onOpen: () => void
}) {
  const { tokens, space, radius } = useTheme()
  const { hideAmounts } = usePrivacy()
  const { formatCurrency } = useCurrency()
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${income.label}, income. Open Income`}
      style={[styles.card, styles.head, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, marginTop: space.sm, padding: space.md, gap: space.md }]}
    >
      <View style={[styles.avatar, { backgroundColor: tokens.mintSoft }]}>
        <Icon icon={MoneyWavy} size={16} color={tokens.mint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>{income.label}</Text>
        <Text numberOfLines={1} style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: 12, marginTop: 2 }}>
          Income{account ? ` · ${account}` : ''}
        </Text>
      </View>
      <Text style={{ color: tokens.mint, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>
        +{formatCurrency(Number(income.amount) || 0, hideAmounts)}
      </Text>
    </Pressable>
  )
})

// Memoised so opening one card's page doesn't re-render every card in the feed.
const FeedCard = memo(function FeedCard({ txn, category, hidden, onOpenActions, onOpen }: {
  txn: ExpenseRow
  category?: CategoryRow
  hidden: boolean
  onOpenActions: (txn: ExpenseRow) => void
  onOpen: (txn: ExpenseRow, rect: CardRect, uri: string | null) => void
}) {
  const { tokens, space, radius } = useTheme()
  const tintOf = useCategoryTint()
  const { hideAmounts } = usePrivacy()
  const { formatCurrency } = useCurrency()
  const tint = tintOf(txn.category)
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
      {uri ? (
        <Pressable onPress={open} onLongPress={() => onOpenActions(txn)} accessible={false}>
          <Image source={{ uri }} style={[styles.photo, { backgroundColor: tokens.inputBg }]} />
        </Pressable>
      ) : null}

      {notes ? (
        <Text numberOfLines={3} style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: 14, padding: space.md, paddingTop: uri ? space.md : 0 }}>
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
})
