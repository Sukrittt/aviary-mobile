import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, View, type RefreshControlProps } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Camera, ImageSquare } from '@/src/components/shared/icons'
import { BottomSheet } from '@/src/components/shared/Modal'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { useNavPadding } from '@/src/components/ui/Screen'
import { pickPhoto } from '@/src/features/log-expense/ExpensePhotoField'
import { useExpensesFeed, useSaveExpensePhoto } from '@/src/hooks/useExpenses'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { categoryTint, splitEmoji } from '@/src/lib/emoji'
import { groupByDay, stablePhotoUrl, type FeedItem } from '@/src/lib/activityFeed'
import { formatDayLabel } from '@/src/lib/date'
import { track } from '@/src/lib/analytics'
import { EMPTY } from '@/src/lib/constants'
import type { CategoryRow, ExpenseRow } from '@/src/types'

const FEED_PAGE_SIZE = 12

type FeedParams = { category?: string; account?: string; from?: string; to?: string; q?: string }

/**
 * Activity's feed view: every expense as a post, photo first, newest at the
 * top, loading more as you scroll. Expenses without a photo show their
 * category on its tint, with a one-tap way to add one. Income stays in the
 * list view; this is the story of your spending.
 */
export function ActivityFeed({ params, header, empty, categoryByName, onOpenActions, refreshControl }: {
  params: FeedParams
  /** Search and filters, scrolled away with the feed like the list's. */
  header: ReactElement
  /** Shown when the filters match nothing. */
  empty: ReactElement
  categoryByName: Map<string, CategoryRow>
  onOpenActions: (txn: ExpenseRow) => void
  refreshControl: ReactElement<RefreshControlProps>
}) {
  const { tokens, space } = useTheme()
  const navPad = useNavPadding()
  const feed = useExpensesFeed({ limit: FEED_PAGE_SIZE, ...params })
  const rows = useMemo(() => feed.data?.pages.flatMap((p) => p.rows) ?? EMPTY, [feed.data])
  const items = useMemo(() => groupByDay(rows), [rows])
  const [viewing, setViewing] = useState<string | null>(null)

  const caption = { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: 12, textAlign: 'center' as const }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(i: FeedItem) => (i.kind === 'day' ? `day-${i.date}` : `card-${i.txn.id || `${i.txn.timestamp}-${i.txn.item}`}`)}
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <Text accessibilityRole="header" style={[styles.day, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold, marginTop: space.md }]}>
              {formatDayLabel(item.date)}
            </Text>
          ) : (
            <FeedCard
              txn={item.txn}
              category={categoryByName.get(item.txn.category)}
              onOpenActions={onOpenActions}
              onView={setViewing}
            />
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
      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          onPress={() => setViewing(null)}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)', padding: space.lg }}
        >
          {viewing && <Image source={{ uri: viewing }} style={{ flex: 1 }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </>
  )
}

function FeedCard({ txn, category, onOpenActions, onView }: {
  txn: ExpenseRow
  category?: CategoryRow
  onOpenActions: (txn: ExpenseRow) => void
  onView: (uri: string) => void
}) {
  const { tokens, space, radius, type } = useTheme()
  const { hideAmounts } = usePrivacy()
  const { formatCurrency } = useCurrency()
  const save = useSaveExpensePhoto()
  const tint = categoryTint(txn.category, tokens)
  // The just-picked file shows at once, until the row's photo changes on the
  // server (the upload's own refetch, or a later edit or removal).
  const [picked, setPicked] = useState<{ uri: string; over?: string } | null>(null)
  if (picked && picked.over !== txn.photo_url) setPicked(null)
  const [justAdded, setJustAdded] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const signed = useMemo(() => (txn.photo_url ? stablePhotoUrl(txn.photo_url) : null), [txn.photo_url])
  const uri = picked?.uri ?? signed

  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(false), 1100)
    return () => clearTimeout(timer)
  }, [justAdded])

  async function addFrom(source: 'camera' | 'library') {
    // Picked over the open sheet, like More's photo field: closing it first
    // races the picker against the sheet's slide-out on iOS.
    const photo = await pickPhoto(source)
    setChoosing(false)
    if (!photo || !txn.id) return
    setPicked({ uri: photo.uri, over: txn.photo_url })
    try {
      await save.mutateAsync({ id: txn.id, photo: { base64: photo.base64, mimeType: photo.mimeType } })
      track('expense_photo_added', { from: 'feed' })
      setJustAdded(true)
    } catch {
      setPicked(null)
      Alert.alert("Photo didn't upload", 'Check your connection and try again.')
    }
  }

  function addPhoto() {
    Haptics.selectionAsync().catch(() => {})
    setChoosing(true)
  }

  const name = splitEmoji(txn.category).text
  const notes = txn.notes?.trim()

  return (
    <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, marginTop: space.sm }]}>
      <Pressable
        onPress={() => onOpenActions(txn)}
        accessibilityRole="button"
        accessibilityLabel={`${txn.item}, ${name}. Edit or delete`}
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

      {/* The add button and overlays sit beside the media's Pressable, not
          inside it: an accessible button hides its children from VoiceOver. */}
      <View>
        <Pressable
          onPress={() => (uri ? onView(uri) : onOpenActions(txn))}
          onLongPress={() => onOpenActions(txn)}
          accessibilityRole="button"
          accessibilityLabel={uri ? `View photo of ${txn.item}` : `${txn.item}. Edit or delete`}
        >
          {uri ? (
            <Image source={{ uri }} style={[styles.photo, { backgroundColor: tokens.inputBg }]} />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: tint.bg }]}>
              <CategoryIcon name={txn.category} icon={category?.icon} group={category?.group} size={56} color={tint.ink} />
            </View>
          )}
        </Pressable>
        {/* A row with a photo the server didn't sign (older server, or signing failed) shows its category, without offering a second photo. */}
        {!uri && !txn.has_photo && (
          <Pressable
            onPress={addPhoto}
            accessibilityRole="button"
            accessibilityLabel={`Add a photo to ${txn.item}`}
            hitSlop={8}
            style={[styles.addPhoto, { backgroundColor: tokens.cardSolid, borderRadius: radius.full, paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xs, right: space.md, bottom: space.md }]}
          >
            <Camera size={16} color={tokens.accentInk} />
            <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>Add a photo</Text>
          </Pressable>
        )}
        {save.isPending && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0, 0, 0, 0.25)' }]}>
            <ActivityIndicator color="#ffffff" />
          </View>
        )}
        {justAdded && (
          <View pointerEvents="none" style={[styles.added, { backgroundColor: tokens.mint, right: space.md, bottom: space.md }]}>
            <CheckIcon color="#ffffff" />
          </View>
        )}
      </View>

      <BottomSheet visible={choosing} onClose={() => setChoosing(false)}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Add a photo</Text>
        <Text numberOfLines={1} style={[styles.sheetSub, { color: tokens.text2, fontFamily: fontFamily.bodyMedium, marginBottom: space.lg }]}>
          {txn.item}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {([
            { source: 'camera', label: 'Take photo', icon: Camera },
            { source: 'library', label: 'Choose photo', icon: ImageSquare },
          ] as const).map((o) => (
            <Pressable
              key={o.source}
              onPress={() => void addFrom(o.source)}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              style={({ pressed }) => [styles.option, { backgroundColor: tokens.inputBg, borderRadius: radius.lg, padding: space.lg, gap: space.sm, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.optionIcon, { backgroundColor: tint.bg }]}>
                <o.icon size={26} color={tint.ink} weight="duotone" />
              </View>
              <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 14 }}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setChoosing(false)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', marginTop: space.lg, padding: space.sm }}>
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: 14 }}>Not now</Text>
        </Pressable>
      </BottomSheet>

      {notes ? (
        <Text numberOfLines={3} style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: 14, padding: space.md }}>
          {notes}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  day: { fontSize: 13 },
  card: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', aspectRatio: 1 },
  placeholder: { width: '100%', aspectRatio: 3 / 2, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 19, textAlign: 'center' },
  sheetSub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  option: { flex: 1, alignItems: 'center' },
  optionIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  added: { position: 'absolute', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
})
