import { useCurrency } from '@/src/context/CurrencyContext'
import { useCallback, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { splitEmoji } from '@/src/lib/emoji'
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/shared/CategoryIcon'
import type { CategoryIconKey } from '@/src/lib/categoryIcons'
import { parseLocalDate, toLocalDateString } from '@/src/lib/date'
import { ProgressBar } from './ProgressBar'
import { BottomSheet } from '@/src/components/shared/Modal'
import type { Envelope } from '@/src/lib/envelope'
import type { ThemeTokens } from '@/src/theme/tokens'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Tinted pill for what's left, on the progress bar's thresholds. Red is only
 * for overspent. Fully spent (not over) gets no pill at all: empty is fine, so
 * it shouldn't read as a badge. */
export function availablePill(e: Envelope, tokens: ThemeTokens): { color: string; bg: string } {
  if (e.isOverspent) return { color: tokens.pillOver, bg: tokens.pillOverBg }
  if (e.spentPct === 100) return { color: tokens.text3, bg: 'transparent' }
  if (e.spentPct > 75) return { color: tokens.pillLow, bg: tokens.pillLowBg }
  return { color: tokens.pillGood, bg: tokens.pillGoodBg }
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
  icon: CategoryIconKey
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
  icon,
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
  const Icon = CATEGORY_ICON_COMPONENTS[icon]
  const name = displayName ?? splitEmoji(envelope.category).text
  // Spending with nothing assigned: "₹713/₹0" and "Used ∞" said nothing useful.
  const unbudgeted = envelope.assigned === 0 && envelope.spent > 0

  return (
    <View style={styles.row}>
      <Pressable style={styles.main} onPress={openSheet}>
        <View style={styles.topLine}>
          <Icon size={14} color={tokens.text2} />
          <Text
            style={[styles.name, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={[styles.spentOf, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            {unbudgeted
              ? `${formatCurrency(envelope.spent, hideAmounts)} spent`
              : `${formatCurrency(envelope.spent, hideAmounts)}/${formatCurrency(envelope.assigned, hideAmounts)}`}
          </Text>
        </View>
        <ProgressBar pct={envelope.spentPct} over={envelope.isOverspent} />
        {!envelope.isCreditCardPayment && (
          <Text style={[styles.metaLine, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
            {unbudgeted ? 'Not budgeted · ' : ''}Last spent {lastSpentLabel(envelope.lastSpentDate)}
          </Text>
        )}
      </Pressable>
      <View style={styles.availableCol}>
        <View style={[styles.availablePill, { backgroundColor: pill.bg }]}>
          <Text
            style={[styles.available, { color: pill.color, fontFamily: fontFamily.bodySemiBold }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatCurrency(envelope.available, hideAmounts)}
          </Text>
        </View>
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
            Pull money from categories
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
  spentOf: { marginLeft: 'auto', fontSize: 12, fontVariant: ['tabular-nums'] },
  // Fixed width so every row's bar ends at the same x, whatever the amount.
  availableCol: { width: 84, alignItems: 'flex-end' },
  availablePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  available: { fontSize: 12, fontVariant: ['tabular-nums'] },
  sheetTitle: { fontSize: 16, marginBottom: 8 },
  sheetBtn: { paddingVertical: 12 },
  sheetBtnText: { fontSize: 14 },
})
