import { useCategories, useCategoryTint } from '@/src/hooks/useCategories'
import { useEffect, useRef, useState } from 'react'
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Bank, CalendarBlank, CaretRight, Clock, PencilSimple, Tag, Trash, User, X } from '@/src/components/shared/icons'
import { AccountChips, accountName } from '@/src/components/shared/AccountChips'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { CategoryPickerSheet } from '@/src/components/shared/CategoryPickerSheet'
import { CalendarSheet } from '@/src/components/shared/DatePicker'
import { BottomSheet } from '@/src/components/shared/Modal'
import { SheetTitle } from '@/src/components/shared/SheetOption'
import { TimeSheet } from '@/src/components/shared/TimeSheet'
import { useReadOnly } from '@/src/components/budgets/ReadOnlyNotice'
import { Button } from '@/src/components/ui/Button'
import { liveAccounts, useAccounts } from '@/src/hooks/useAccounts'
import { useUpdateExpense } from '@/src/hooks/useExpenses'
import { ExpenseWriteError } from '@/src/lib/expenseConflict'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { splitEmoji } from '@/src/lib/emoji'
import { formatTime, nowLocal, parseLocalDate, toLocalDateString } from '@/src/lib/date'
import type { ExpenseRow } from '@/src/types'
import type { PhosphorIcon } from '@/src/components/shared/icons'

/** Where the tapped card sits on screen, so the page can grow out of it and shrink back. */
export type CardRect = { x: number; y: number; width: number; height: number }

const OPEN_MS = 340
const CLOSE_MS = 260

/**
 * A feed card opened up into the whole expense: the card's own header and
 * photo grow from where it sat to full screen, and the details fade in under
 * them. Closing shrinks it back into the card. Delete closes first and hands
 * off, so the card's collapse plays where the user can see it. Category, date,
 * time and account change right here, one tap each; Edit is for everything else.
 */
export function TransactionDetail({ txn, from, photoUri, addedBy, onClosed, onEdit, onDelete }: {
  txn: ExpenseRow
  from: CardRect
  photoUri: string | null
  /** Who logged it, in a shared budget: "you" or their first name. */
  addedBy?: string
  /** The page is gone; drop it. */
  onClosed: () => void
  onEdit: (txn: ExpenseRow) => void
  onDelete: (txn: ExpenseRow) => void
}) {
  const { tokens, space, radius } = useTheme()
  const tintOf = useCategoryTint()
  const { hideAmounts } = usePrivacy()
  const { formatCurrency } = useCurrency()
  const insets = useSafeAreaInsets()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const { data: categories } = useCategories()
  const { data: accounts } = useAccounts()
  const { readOnly, blocked } = useReadOnly()
  const update = useUpdateExpense()
  // What's on screen. `txn` is the card as it was tapped, so a change made here
  // lives in this copy, along with the version the next write has to send.
  const [row, setRow] = useState(txn)
  const [picker, setPicker] = useState<'category' | 'date' | 'time' | 'account' | null>(null)
  const [saveError, setSaveError] = useState('')
  const category = categories?.find((c) => c.name === row.category)
  const tint = tintOf(row.category)
  const [viewing, setViewing] = useState(false)
  const progress = useSharedValue(0)
  const closing = useRef(false)

  useEffect(() => {
    progress.value = withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) })
  }, [progress])

  // Timed on the JS side rather than from the animation's callback, so the
  // hand-off happens even where the animation never reports back.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  function close(then?: () => void) {
    if (closing.current) return
    closing.current = true
    progress.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic) })
    timer.current = setTimeout(() => {
      onClosed()
      then?.()
    }, CLOSE_MS)
  }

  const frame = useAnimatedStyle(() => ({
    top: interpolate(progress.value, [0, 1], [from.y, 0]),
    left: interpolate(progress.value, [0, 1], [from.x, 0]),
    width: interpolate(progress.value, [0, 1], [from.width, screenW]),
    height: interpolate(progress.value, [0, 1], [from.height, screenH]),
    borderRadius: interpolate(progress.value, [0, 1], [radius.lg, 0]),
  }))
  // The card's square photo settles to a shorter hero, so the details start above the fold. A photoless
  // card is just its header, so its category block grows in from nothing.
  const hero = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], photoUri ? [from.width, screenW * 0.75] : [0, screenW * 0.5]),
  }))
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }))
  const headPad = useAnimatedStyle(() => ({ paddingTop: space.md + insets.top * progress.value }))
  // The card's small amount gives way to the close button; the big one below takes over.
  const headAmount = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 0.5], [1, 0], 'clamp') }))
  const details = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.55, 1], [0, 1], 'clamp') }))

  function save(updates: Parameters<typeof update.mutate>[0]['updates'], applied: Partial<ExpenseRow>) {
    const before = row
    setSaveError('')
    setRow({ ...row, ...applied, version: (row.version ?? 0) + 1 })
    update.mutate(
      { id: row.id, version: row.version, timestamp: row.timestamp, item: row.item, amountInr: Number(row.amount_inr), updates },
      {
        onError: (err) => {
          setRow(err instanceof ExpenseWriteError && err.status === 409 && err.current ? err.current : before)
          setSaveError(
            err instanceof ExpenseWriteError && err.status === 409
              ? "This changed on another device. Here's the latest, so give it another go."
              : err instanceof ExpenseWriteError && err.status === 404
                ? 'This one was deleted on another device.'
                : "Couldn't save that. Check your connection and try again.",
          )
        },
      },
    )
  }

  function pickDate(picked: Date) {
    const date = toLocalDateString(picked)
    if (date === row.date) return
    if (Number.isNaN(logged.getTime())) return save({ new_date: date }, { date })
    // Same time on the new day, at this device's offset: the old one can be wrong across a clock change.
    const at = new Date(picked)
    at.setHours(logged.getHours(), logged.getMinutes(), logged.getSeconds(), 0)
    const timestamp = nowLocal(at).timestamp
    save({ new_date: date, new_timestamp: timestamp }, { date, timestamp })
  }

  function pickAccount(id: string) {
    setPicker(null)
    if (id === (row.account_id ?? '')) return
    // An account brings its payment method with it; clearing one leaves it be.
    const type = accounts?.find((a) => a.id === id)?.type
    save({ new_account_id: id }, { account_id: id, ...(type ? { payment_method: type } : {}) })
  }

  // A queued expense has no server row to write to yet, and a read-only budget can't take the write.
  const editable = !!row.id && row.version !== undefined && !readOnly
  const openPicker = (next: NonNullable<typeof picker>) => () => {
    if (!blocked()) setPicker(next)
  }
  const pickable = liveAccounts(accounts)
  const name = splitEmoji(row.category).text
  const notes = row.notes?.trim()
  const day = parseLocalDate(row.date)
  const logged = new Date(row.timestamp)
  // A backdated expense was logged on another day; its time is when it was logged, not spent.
  const sameDay = !Number.isNaN(logged.getTime()) && toLocalDateString(logged) === row.date
  const time = formatTime(row.timestamp)
  const account = accountName(accounts, row.account_id)
  const rows: { icon: PhosphorIcon; label: string; value: string; onPress?: () => void }[] = [
    { icon: Tag, label: 'Category', value: name, onPress: editable ? openPicker('category') : undefined },
    {
      icon: CalendarBlank,
      label: 'Date',
      value: Number.isNaN(day.getTime()) ? row.date : day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      onPress: editable ? openPicker('date') : undefined,
    },
    ...(time
      ? [{
          icon: Clock,
          label: sameDay ? 'Time' : 'Logged',
          value: sameDay ? time : `${logged.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${time}`,
          onPress: editable ? openPicker('time') : undefined,
        }]
      : []),
    { icon: Bank, label: 'Account', value: account || 'Not set', onPress: editable && pickable.length ? openPicker('account') : undefined },
    ...(addedBy ? [{ icon: User, label: 'Added by', value: addedBy }] : []),
  ]

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (viewing ? setViewing(false) : close())}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.bg }, backdrop]} />
      <Animated.View style={[styles.frame, { backgroundColor: tokens.bg, borderColor: tokens.border }, frame]}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }} showsVerticalScrollIndicator={false} bounces={false}>
          <Animated.View style={[styles.head, { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.md }, headPad]}>
            <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
              <CategoryIcon name={row.category} icon={category?.icon} group={category?.group} size={16} color={tint.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} accessibilityRole="header" style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>{row.item}</Text>
              <Text numberOfLines={1} style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: 12, marginTop: 2 }}>{name}</Text>
            </View>
            <Animated.Text style={[{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }, headAmount]}>
              {formatCurrency(Number(row.amount_inr) || 0, hideAmounts)}
            </Animated.Text>
          </Animated.View>

          {photoUri ? (
            <Pressable onPress={() => setViewing(true)} accessibilityRole="button" accessibilityLabel={`View photo of ${row.item}`}>
              <Animated.Image source={{ uri: photoUri }} style={[styles.photo, { backgroundColor: tokens.inputBg }, hero]} />
            </Pressable>
          ) : (
            <Animated.View style={[styles.placeholder, { backgroundColor: tint.bg }, hero]}>
              <CategoryIcon name={row.category} icon={category?.icon} group={category?.group} size={56} color={tint.ink} />
            </Animated.View>
          )}

          <Animated.View style={[{ padding: space.md, gap: space.md }, details]}>
            <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: 40 }}>
              {formatCurrency(Number(row.amount_inr) || 0, hideAmounts)}
            </Text>
            <View style={[styles.group, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.lg }]}>
              {rows.map((r, i) => (
                <View key={r.label}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: tokens.border }]} />}
                  <Pressable
                    onPress={r.onPress}
                    disabled={!r.onPress || update.isPending}
                    accessibilityRole={r.onPress ? 'button' : undefined}
                    accessibilityLabel={r.onPress ? `Change ${r.label.toLowerCase()}, ${r.value}` : undefined}
                    style={({ pressed }) => [styles.row, { gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <r.icon size={18} color={tokens.text3} />
                    <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: 14 }}>{r.label}</Text>
                    <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', color: r.value === 'Not set' ? tokens.text3 : tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 14 }}>
                      {r.value}
                    </Text>
                    {r.onPress && <CaretRight size={14} color={tokens.text3} />}
                  </Pressable>
                </View>
              ))}
            </View>
            {saveError ? <Text accessibilityRole="alert" style={{ color: tokens.coral, fontFamily: fontFamily.bodySemiBold, fontSize: 14 }}>{saveError}</Text> : null}
            {notes ? (
              <View style={[styles.group, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.lg, paddingVertical: space.md }]}>
                <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: 12 }}>Notes</Text>
                <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, marginTop: space.xs, lineHeight: 21 }}>{notes}</Text>
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>

        <Animated.View style={[styles.actions, { paddingHorizontal: space.md, paddingBottom: insets.bottom + space.md, gap: space.sm, backgroundColor: tokens.bg }, details]}>
          <Button label="Edit" variant="secondary" icon={PencilSimple} style={{ flex: 1 }} onPress={() => onEdit(row)} />
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              close(() => onDelete(row))
            }}
            accessibilityRole="button"
            accessibilityLabel="Delete"
            style={({ pressed }) => [styles.delete, { borderColor: tokens.border, borderRadius: radius.full, gap: space.xs, opacity: pressed ? 0.7 : 1 }]}
          >
            <Trash size={18} color={tokens.coral} />
            <Text style={{ color: tokens.coral, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>Delete</Text>
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.closeWrap, { top: insets.top + space.md - 2, right: space.md }, details]}>
          <Pressable
            onPress={() => close()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={[styles.close, { backgroundColor: tokens.pillBg, borderColor: tokens.border }]}
          >
            <X size={18} color={tokens.text} />
          </Pressable>
        </Animated.View>
      </Animated.View>

      <CategoryPickerSheet
        visible={picker === 'category'}
        value={row.category}
        noneLabel={null}
        onClose={() => setPicker(null)}
        onSelect={(next) => {
          if (next !== row.category) save({ category: next }, { category: next })
        }}
      />
      <CalendarSheet visible={picker === 'date'} value={row.date} onPick={pickDate} onClose={() => setPicker(null)} />
      <TimeSheet
        visible={picker === 'time'}
        date={row.date}
        timestamp={row.timestamp}
        onClose={() => setPicker(null)}
        onPick={(next) => {
          if (!sameDay || formatTime(next) !== time) save({ new_timestamp: next }, { timestamp: next })
        }}
      />
      <BottomSheet visible={picker === 'account'} onClose={() => setPicker(null)}>
        <SheetTitle>Account</SheetTitle>
        <AccountChips accounts={pickable} value={row.account_id ?? ''} onChange={pickAccount} allowNone showLabel={false} />
      </BottomSheet>

      {viewing && photoUri && (
        <Pressable
          onPress={() => setViewing(false)}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.92)', padding: space.lg, paddingTop: insets.top + space.lg }]}
        >
          <Image source={{ uri: photoUri }} style={{ flex: 1 }} resizeMode="contain" />
        </Pressable>
      )}
    </Modal>
  )
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%' },
  placeholder: { width: '100%', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  group: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingTop: 12 },
  delete: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, paddingVertical: 12 },
  closeWrap: { position: 'absolute' },
  close: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
})
