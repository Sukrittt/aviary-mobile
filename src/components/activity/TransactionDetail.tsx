import { useEffect, useRef, useState } from 'react'
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Bank, CalendarBlank, Clock, PencilSimple, Tag, Trash, X } from '@/src/components/shared/icons'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { Button } from '@/src/components/ui/Button'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { categoryTint, splitEmoji } from '@/src/lib/emoji'
import { formatTime, parseLocalDate, toLocalDateString } from '@/src/lib/date'
import type { CategoryRow, ExpenseRow } from '@/src/types'
import type { PhosphorIcon } from '@/src/components/shared/icons'

/** Where the tapped card sits on screen, so the page can grow out of it and shrink back. */
export type CardRect = { x: number; y: number; width: number; height: number }

const OPEN_MS = 340
const CLOSE_MS = 260

/**
 * A feed card opened up into the whole expense: the card's own header and
 * photo grow from where it sat to full screen, and the details fade in under
 * them. Closing shrinks it back into the card. Delete closes first and hands
 * off, so the card's collapse plays where the user can see it.
 */
export function TransactionDetail({ txn, from, photoUri, category, account, onClosed, onEdit, onDelete }: {
  txn: ExpenseRow
  from: CardRect
  photoUri: string | null
  category?: CategoryRow
  /** The account's name, '' when the expense has none. */
  account: string
  /** The page is gone; drop it. */
  onClosed: () => void
  onEdit: (txn: ExpenseRow) => void
  onDelete: (txn: ExpenseRow) => void
}) {
  const { tokens, space, radius } = useTheme()
  const { hideAmounts } = usePrivacy()
  const { formatCurrency } = useCurrency()
  const insets = useSafeAreaInsets()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const tint = categoryTint(txn.category, tokens)
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

  const name = splitEmoji(txn.category).text
  const notes = txn.notes?.trim()
  const day = parseLocalDate(txn.date)
  const logged = new Date(txn.timestamp)
  // A backdated expense was logged on another day; its time is when it was logged, not spent.
  const sameDay = !Number.isNaN(logged.getTime()) && toLocalDateString(logged) === txn.date
  const time = formatTime(txn.timestamp)
  const rows: { icon: PhosphorIcon; label: string; value: string }[] = [
    { icon: Tag, label: 'Category', value: name },
    {
      icon: CalendarBlank,
      label: 'Date',
      value: Number.isNaN(day.getTime()) ? txn.date : day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    },
    ...(time
      ? [{
          icon: Clock,
          label: sameDay ? 'Time' : 'Logged',
          value: sameDay ? time : `${logged.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${time}`,
        }]
      : []),
    { icon: Bank, label: 'Account', value: account || 'Not set' },
  ]

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (viewing ? setViewing(false) : close())}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.bg }, backdrop]} />
      <Animated.View style={[styles.frame, { backgroundColor: tokens.bg, borderColor: tokens.border }, frame]}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }} showsVerticalScrollIndicator={false} bounces={false}>
          <Animated.View style={[styles.head, { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.md }, headPad]}>
            <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
              <CategoryIcon name={txn.category} icon={category?.icon} group={category?.group} size={16} color={tint.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} accessibilityRole="header" style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>{txn.item}</Text>
              <Text numberOfLines={1} style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: 12, marginTop: 2 }}>{name}</Text>
            </View>
            <Animated.Text style={[{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }, headAmount]}>
              {formatCurrency(Number(txn.amount_inr) || 0, hideAmounts)}
            </Animated.Text>
          </Animated.View>

          {photoUri ? (
            <Pressable onPress={() => setViewing(true)} accessibilityRole="button" accessibilityLabel={`View photo of ${txn.item}`}>
              <Animated.Image source={{ uri: photoUri }} style={[styles.photo, { backgroundColor: tokens.inputBg }, hero]} />
            </Pressable>
          ) : (
            <Animated.View style={[styles.placeholder, { backgroundColor: tint.bg }, hero]}>
              <CategoryIcon name={txn.category} icon={category?.icon} group={category?.group} size={56} color={tint.ink} />
            </Animated.View>
          )}

          <Animated.View style={[{ padding: space.md, gap: space.md }, details]}>
            <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: 40 }}>
              {formatCurrency(Number(txn.amount_inr) || 0, hideAmounts)}
            </Text>
            <View style={[styles.group, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.lg }]}>
              {rows.map((r, i) => (
                <View key={r.label}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: tokens.border }]} />}
                  <View style={[styles.row, { gap: space.md, paddingVertical: space.md }]}>
                    <r.icon size={18} color={tokens.text3} />
                    <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: 14 }}>{r.label}</Text>
                    <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', color: r.value === 'Not set' ? tokens.text3 : tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 14 }}>
                      {r.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            {notes ? (
              <View style={[styles.group, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.lg, paddingVertical: space.md }]}>
                <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: 12 }}>Notes</Text>
                <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, marginTop: space.xs, lineHeight: 21 }}>{notes}</Text>
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>

        <Animated.View style={[styles.actions, { paddingHorizontal: space.md, paddingBottom: insets.bottom + space.md, gap: space.sm, backgroundColor: tokens.bg }, details]}>
          <Button label="Edit" variant="secondary" icon={PencilSimple} style={{ flex: 1 }} onPress={() => onEdit(txn)} />
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              close(() => onDelete(txn))
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
