import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { X } from 'lucide-react-native'
import { useCurrency } from '@/src/context/CurrencyContext'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useDeleteExpense, useDismissDuplicate, useDuplicates } from '@/src/hooks/useExpenses'
import { Button } from '@/src/components/ui/Button'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { formatDateTime } from '@/src/lib/format'
import type { ExpenseRow } from '@/src/types'
import type { DuplicatePair } from '@/src/api/expenses'
import { track } from '@/src/lib/analytics'

/**
 * Opened from Activity's "possible duplicates" chip. Steps through the pairs
 * the server flagged (lib/duplicates.ts on Web), one at a time: delete the
 * newer copy or keep both. Delete shows the shared saving then CheckIcon
 * sequence, then moves to the next pair, or closes once none are left.
 * Answered pairs are hidden locally, so a refetch that lands late can't show
 * one again.
 */
export default function DuplicatesModal() {
  const { tokens, space, radius, type } = useTheme()
  const { formatCurrency } = useCurrency()
  const { hideAmounts } = usePrivacy()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const duplicates = useDuplicates()
  const deleteExpense = useDeleteExpense()
  const dismiss = useDismissDuplicate()
  const [failed, setFailed] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'saving' | 'success'>('idle')
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set())
  // The pair on screen stays put while its delete saves and ticks, and while
  // the screen slides away, even after the refetch has dropped it.
  const [held, setHeld] = useState<DuplicatePair | null>(null)
  // A ref, not state: it only guards against a second router.back() popping Activity.
  const closing = useRef(false)

  const pairs = duplicates.data ?? []
  const pair = held ?? pairs.find((p) => !answered.has(String(p.duplicate.id)))
  const busy = phase !== 'idle' || dismiss.isPending

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    router.back()
  }, [router])

  useEffect(() => {
    if (duplicates.isSuccess && !duplicates.isFetching && !pair) close()
  }, [duplicates.isSuccess, duplicates.isFetching, pair, close])

  // Let the checkmark finish drawing before moving on, same beat as every other CheckIcon CTA.
  useEffect(() => {
    if (phase !== 'success' || !held) return
    const isLast = !pairs.some((p) => p.duplicate.id !== held.duplicate.id && !answered.has(String(p.duplicate.id)))
    const timer = setTimeout(() => {
      if (isLast) return close()
      setAnswered((prev) => new Set(prev).add(String(held.duplicate.id)))
      setHeld(null)
      setPhase('idle')
    }, 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function handleDelete() {
    if (!pair) return
    setFailed(false)
    setHeld(pair)
    setPhase('saving')
    try {
      await deleteExpense.mutateAsync({
        id: pair.duplicate.id,
        version: pair.duplicate.version,
        timestamp: pair.duplicate.timestamp,
        item: pair.duplicate.item,
        amountInr: Number(pair.duplicate.amount_inr) || 0,
      })
      track('duplicates_resolved', { action: 'deleted' })
      setPhase('success')
    } catch {
      setHeld(null)
      setPhase('idle')
      setFailed(true)
    }
  }

  async function handleKeepBoth() {
    if (!pair) return
    setFailed(false)
    const isLast = !pairs.some((p) => p.duplicate.id !== pair.duplicate.id && !answered.has(String(p.duplicate.id)))
    try {
      await dismiss.mutateAsync(String(pair.duplicate.id))
      track('duplicates_resolved', { action: 'kept_both' })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      if (isLast) {
        setHeld(pair)
        close()
      } else {
        setAnswered((prev) => new Set(prev).add(String(pair.duplicate.id)))
      }
    } catch {
      setFailed(true)
    }
  }

  const rows: [string, (r: ExpenseRow) => string][] = [
    ['Item', (r) => r.item],
    ['Amount', (r) => formatCurrency(Number(r.amount_inr) || 0, hideAmounts)],
    ['Logged', (r) => formatDateTime(r.timestamp)],
    ['Category', (r) => r.category],
  ]
  const label = { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }
  const value = { flex: 1, color: tokens.text, fontFamily: fontFamily.bodyMedium, fontSize: type.body }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, gap: space.md, borderBottomColor: tokens.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.headerBtn, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.full }]}
        >
          <X size={16} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }]}>
          Possible duplicates
        </Text>
      </View>

      {!pair ? (
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator color={tokens.accentInk} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              padding: space.lg,
              gap: space.xl,
              paddingBottom: insets.bottom + space.lg,
            },
          ]}
        >
          <View style={{ gap: space.lg }}>
            <View style={{ gap: space.xs }}>
              <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title }}>Logged twice?</Text>
              <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>
                These look like the same purchase.{pairs.length > 1 ? ` ${pairs.length} to review.` : ''}
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, padding: space.md }]}>
              <View style={[styles.row, { paddingBottom: space.sm }]}>
                <Text style={[label, styles.labelCol]} />
                <Text style={[label, { flex: 1 }]}>EARLIER</Text>
                <Text style={[label, { flex: 1 }]}>NEWER</Text>
              </View>
              {rows.map(([name, read]) => (
                <View key={name} style={[styles.row, { paddingVertical: space.sm, borderTopColor: tokens.border }, styles.divided]}>
                  <Text style={[label, styles.labelCol]}>{name.toUpperCase()}</Text>
                  <Text style={value}>{read(pair.original)}</Text>
                  <Text style={value}>{read(pair.duplicate)}</Text>
                </View>
              ))}
            </View>

            {failed && (
              <Text accessibilityRole="alert" style={{ color: tokens.coral, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>
                That didn&apos;t go through. Check your connection and try again.
              </Text>
            )}
          </View>

          <View style={[styles.actions, { gap: space.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete the newer one"
              onPress={handleDelete}
              disabled={busy}
              style={[
                styles.primary,
                {
                  backgroundColor: phase === 'success' ? tokens.mint : tokens.accent,
                  borderRadius: radius.full,
                  opacity: phase === 'saving' ? 0.5 : 1,
                },
              ]}
            >
              {phase === 'success' ? (
                <CheckIcon color={tokens.onAccent} size={16} />
              ) : (
                <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>
                  {phase === 'saving' ? 'Deleting…' : 'Delete the newer one'}
                </Text>
              )}
            </Pressable>
            <Button label="Keep both" variant="secondary" disabled={busy} onPress={handleKeepBoth} />
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'right' },
  card: { borderWidth: 1 },
  row: { flexDirection: 'row', gap: 12 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
  labelCol: { width: 72, letterSpacing: 0.6 },
  actions: { marginTop: 'auto' },
  primary: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
})
