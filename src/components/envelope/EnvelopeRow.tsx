import { useCurrency } from '@/src/context/CurrencyContext'
import { useCallback, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { splitEmoji } from '@/src/lib/emoji'
import { parseLocalDate, toLocalDateString } from '@/src/lib/date'
import { ProgressBar, fillColor, fillSoftColor } from './ProgressBar'
import { BottomSheet } from '@/src/components/shared/Modal'
import type { Envelope } from '@/src/lib/envelope'
import type { ThemeTokens } from '@/src/theme/tokens'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Tinted pill for what's left, matching the progress bar's color for the
 * same spend. Amber text uses warnInk: plain warn is unreadable on its tint. */
export function availablePill(e: Envelope, tokens: ThemeTokens): { color: string; bg: string } {
  if (e.isOverspent) return { color: tokens.coral, bg: tokens.coralSoft }
  const color = fillColor(e.spentPct, tokens)
  return { color: color === tokens.warn ? tokens.warnInk : color, bg: fillSoftColor(e.spentPct, tokens) }
}

/** Mirrors Web's EnvelopeGrid usedPct(): spend as % of assigned, ∞ if spending with nothing assigned. */
function usedPctLabel(e: Envelope): string {
  if (e.assigned > 0) return `${Math.round((e.spent / e.assigned) * 100)}%`
  return e.spent > 0 ? '∞' : '—'
}

/** Mirrors Web's EnvelopeGrid lastSpentLabel(), written by hand (no Intl) per this app's date-formatting convention. */
export function lastSpentLabel(iso: string | undefined): string {
  if (!iso) return '—'
  const d = parseLocalDate(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const today = new Date()
  const todayStr = toLocalDateString(today)
  if (iso === todayStr) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === toLocalDateString(yesterday)) return 'Yesterday'
  // Both sides at local midnight so the count is calendar days; round absorbs DST's 23/25h days.
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((midnight.getTime() - d.getTime()) / 86400000)
  if (days >= 1 && days <= 31) return `${days}d ago`
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

interface Props {
  envelope: Envelope
  emoji: string
  hideAmounts: boolean
  /** Overrides the displayed name (used for the Credit Card Payment special envelope). */
  displayName?: string
  onMoveMoney: (category: string) => void
  /** Opens the full-screen edit-assigned-amount modal (app/modals/edit-assigned-amount.tsx). */
  onEditAmount: (category: string) => void
  onViewTransactions: (category: string) => void
  /** Told when this row's action sheet opens/closes — Home uses it to hold
   * Ready to Assign's displayed value frozen while the sheet covers it, so
   * an edit's odometer roll plays on reveal instead of finishing unseen
   * behind the sheet. Optional: only Home's rows need to report this. */
  onSheetOpenChange?: (open: boolean) => void
}

/** A single envelope row + its tap-to-open action sheet (move money / edit amount / view transactions). */
export function EnvelopeRow({
  envelope,
  emoji,
  hideAmounts,
  displayName,
  onMoveMoney,
  onEditAmount,
  onViewTransactions,
  onSheetOpenChange,
}: Props) {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const [sheetOpen, setSheetOpen] = useState(false)

  function openSheet() {
    setSheetOpen(true)
    onSheetOpenChange?.(true)
  }

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    onSheetOpenChange?.(false)
  }, [onSheetOpenChange])

  const pill = availablePill(envelope, tokens)
  const name = displayName ?? splitEmoji(envelope.category).text

  return (
    <View style={styles.row}>
      <Pressable style={styles.main} onPress={openSheet}>
        <View style={styles.topLine}>
          <Text style={{ fontSize: 14 }}>{emoji}</Text>
          <Text
            style={[styles.name, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={[styles.spentOf, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            {formatCurrency(envelope.spent, hideAmounts)}/{formatCurrency(envelope.assigned, hideAmounts)}
          </Text>
        </View>
        <ProgressBar pct={envelope.spentPct} />
        {!envelope.isCreditCardPayment && (
          <Text style={[styles.metaLine, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
            Used {usedPctLabel(envelope)} · Last spent {lastSpentLabel(envelope.lastSpentDate)}
          </Text>
        )}
      </Pressable>
      <View style={[styles.availablePill, { backgroundColor: pill.bg }]}>
        <Text style={[styles.available, { color: pill.color, fontFamily: fontFamily.bodySemiBold }]}>
          {formatCurrency(envelope.available, hideAmounts)}
        </Text>
      </View>

      <BottomSheet visible={sheetOpen} onClose={closeSheet}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          {name}
        </Text>
        <Pressable
          style={styles.sheetBtn}
          onPress={() => {
            closeSheet()
            onMoveMoney(envelope.category)
          }}
        >
          <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>
            Pull money from envelopes
          </Text>
        </Pressable>
        <Pressable
          style={styles.sheetBtn}
          onPress={() => {
            closeSheet()
            onEditAmount(envelope.category)
          }}
        >
          <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>
            Edit assigned amount
          </Text>
        </Pressable>
        {!envelope.isCreditCardPayment && (
          <Pressable
            style={styles.sheetBtn}
            onPress={() => {
              closeSheet()
              onViewTransactions(envelope.category)
            }}
          >
            <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>
              View transactions
            </Text>
          </Pressable>
        )}
      </BottomSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  main: { flex: 1, gap: 6 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 13, flexShrink: 1 },
  metaLine: { fontSize: 10, marginTop: 2 },
  spentOf: { marginLeft: 'auto', fontSize: 12 },
  availablePill: { minWidth: 60, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  available: { fontSize: 12 },
  sheetTitle: { fontSize: 16, marginBottom: 8 },
  sheetBtn: { paddingVertical: 12 },
  sheetBtnText: { fontSize: 14 },
})
