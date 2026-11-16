import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Reanimated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutLeft,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated'
import { AnimatedPressable, usePressSpring } from '@/src/components/ui/Button'
import { BottomSheet } from '@/src/components/shared/Modal'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { useCategories, useCategoryTint } from '@/src/hooks/useCategories'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { tap } from '@/src/lib/haptics'
import { formatDayLabel } from '@/src/lib/date'
import { splitEmoji } from '@/src/lib/emoji'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import type { PendingExpense } from '@/src/lib/pendingExpenses'

/** How long the "All synced" moment holds before it bows out. Matches the shared success CTA. */
export const SYNCED_HOLD_MS = 1100

/** A soft breathing dot: the queue is alive and on it. */
function PulseDot({ color }: { color: string }) {
  const pulse = useSharedValue(1)
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true)
    return () => cancelAnimation(pulse)
  }, [pulse])
  const style = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 0.8 + pulse.value * 0.2 }] }))
  return <Reanimated.View style={[styles.dot, { backgroundColor: color }, style]} />
}

/**
 * The Activity header's sync status. Tapping it shows exactly which expenses
 * are still on their way. When the queue drains, the pill (and the sheet, if
 * it's open) ends on a mint check, so the wait closes on a good note.
 */
export function SyncingPill({ queued }: { queued: PendingExpense[] }) {
  const { tokens } = useTheme()
  const press = usePressSpring()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const count = queued.length
  const [prevCount, setPrevCount] = useState(count)
  // The queue just drained: hold the check for a beat. More arriving cancels it.
  if (count !== prevCount) {
    setPrevCount(count)
    setDone(count === 0 && prevCount > 0)
  }

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => {
      setDone(false)
      setOpen(false)
    }, SYNCED_HOLD_MS)
    return () => clearTimeout(t)
  }, [done])

  if (count === 0 && !done) return null

  return (
    <>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={done ? 'All synced' : `Syncing ${count} expense${count === 1 ? '' : 's'}. Show them`}
        onPress={() => {
          if (done) return
          tap()
          setOpen(true)
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        entering={FadeIn}
        exiting={FadeOut}
        layout={LinearTransition}
        style={[styles.pill, { backgroundColor: done ? tokens.mintSoft : tokens.accentSoft }, press.style]}
      >
        {done ? <CheckIcon color={tokens.mint} size={14} /> : <PulseDot color={tokens.accentInk} />}
        <Text style={[styles.pillText, { color: done ? tokens.mint : tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>
          {done ? 'All synced' : `Syncing ${count}`}
        </Text>
      </AnimatedPressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <SyncSheet queued={queued} done={done} />
      </BottomSheet>
    </>
  )
}

function SyncSheet({ queued, done }: { queued: PendingExpense[]; done: boolean }) {
  const { tokens } = useTheme()
  const categories = useCategories().data
  const tintOf = useCategoryTint()
  const { formatCurrency } = useCurrency()
  const { hideAmounts } = usePrivacy()

  if (done) {
    return (
      <Reanimated.View entering={FadeIn.duration(220)} style={styles.done}>
        <View style={[styles.doneBadge, { backgroundColor: tokens.mintSoft }]}>
          <CheckIcon color={tokens.mint} size={28} />
        </View>
        <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>All synced</Text>
        <Text style={[styles.sub, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          {"Everything's safe in your budget."}
        </Text>
      </Reanimated.View>
    )
  }

  return (
    <View>
      <View style={styles.header}>
        <PulseDot color={tokens.accentInk} />
        <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          {queued.length === 1 ? '1 expense on its way' : `${queued.length} expenses on their way`}
        </Text>
      </View>
      <Text style={[styles.sub, styles.subLeft, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
        {`Sending ${queued.length === 1 ? 'it' : 'them'} to your budget now. You don't need to wait here.`}
      </Text>
      {queued.map(({ payload }, i) => {
        const category = categories?.find((c) => c.name === payload.category)
        const tint = tintOf(payload.category)
        return (
          <Reanimated.View
            key={payload.client_id}
            entering={FadeInDown.delay(Math.min(i, 6) * 40)}
            exiting={FadeOutLeft}
            layout={LinearTransition}
            style={styles.row}
          >
            <View style={[styles.icon, { backgroundColor: tint.bg }]}>
              <CategoryIcon name={payload.category} icon={category?.icon} group={category?.group} size={16} color={tint.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.item, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>
                {payload.item}
              </Text>
              <Text style={[styles.meta, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>
                {formatDayLabel(payload.date)} · {splitEmoji(payload.category).text}
              </Text>
            </View>
            <Text style={[styles.item, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
              {formatCurrency(Number(payload.amount_inr) || 0, hideAmounts)}
            </Text>
          </Reanimated.View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', height: 30, paddingHorizontal: 12, borderRadius: 15 },
  pillText: { fontSize: 13 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18 },
  sub: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  subLeft: { textAlign: 'left', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  item: { fontSize: 15 },
  meta: { fontSize: 12, marginTop: 2 },
  done: { alignItems: 'center', paddingVertical: 16 },
  doneBadge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
})
