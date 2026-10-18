import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, CheckCircle, ArrowsClockwise } from '@/src/components/shared/icons'
import Reanimated from 'react-native-reanimated'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { useOnline } from '@/src/lib/netStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { LoadingPhrase } from '@/src/components/shared/LoadingPhrase'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { formatDateShort } from '@/src/lib/format'
import { PopIn } from '@/src/components/shared/PopIn'
import { Button, usePressSpring } from '@/src/components/ui/Button'
import { Chip } from '@/src/components/ui/Chip'
import { useRefresh } from '@/src/hooks/useRefresh'
import {
  useDismissRecurringSuggestion,
  useRecurringSuggestions,
  useScanRecurringSuggestions,
} from '@/src/hooks/useRecurringSuggestions'
import { recurringSuggestionErrorMessage } from '@/src/api/recurringSuggestions'
import type { RecurringSuggestion, ScanMonths } from '@/src/types/recurringSuggestions'
import { tap } from '@/src/lib/haptics'
import { useUser } from '@/src/hooks/useUser'
import { isHidden } from '@/src/lib/features'

const SCAN_PHRASES = [
  'Reading your expenses…',
  'Spotting the regulars…',
  'Checking the dates…',
  'Almost there…',
]

// Same stagger quartet every other account/* screen uses (recurring.tsx, bill-scans.tsx).
const MOUNT_DELAY = 100
const ITEM_STAGGER = 45
const STAGGER_CAP = 6

const PERIODS: { months: ScanMonths; label: string }[] = [
  { months: 1, label: '1 month' },
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
]

function kindLabel(kind: RecurringSuggestion['kind']): string {
  return kind === 'subscription' ? 'Likely subscription' : 'Recurring payment'
}

export default function RecurringSuggestionsScreen() {
  const { tokens } = useTheme()
  const { hideAmounts } = usePrivacy()
  const online = useOnline()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams<{ kind?: string }>()
  // `all`: both kinds at once, for the import banner's "find your repeat payments".
  const mode: RecurringSuggestion['kind'] | 'all' = params.kind === 'subscription' ? 'subscription' : params.kind === 'all' ? 'all' : 'other_recurring'
  const subscriptionMode = mode === 'subscription'
  const allMode = mode === 'all'
  const { data: user } = useUser()
  const { refreshing, onRefresh } = useRefresh()

  const [months, setMonths] = useState<ScanMonths>(6)
  const query = useRecurringSuggestions(months)
  const scan = useScanRecurringSuggestions()
  const dismiss = useDismissRecurringSuggestion()

  const data = query.data
  const suggestions = data?.suggestions.filter((suggestion) => allMode || suggestion.kind === mode) ?? []
  const busy = scan.isPending || dismiss.isPending
  const failure = scan.error
    ? recurringSuggestionErrorMessage(scan.error, "Couldn't scan right now. Check your connection and try again.")
    : dismiss.error
      ? recurringSuggestionErrorMessage(dismiss.error, "Couldn't dismiss that. Check your connection and try again.")
      : query.error
        ? recurringSuggestionErrorMessage(query.error, "Couldn't load suggestions. Check your connection and try again.")
        : null

  if (!online) return <OfflineScreen />

  function selectMonths(next: ScanMonths) {
    if (next === months) return
    setMonths(next)
    scan.reset()
    dismiss.reset()
  }

  function openSuggestion(s: RecurringSuggestion) {
    // With Subscriptions switched off, a subscription is set up as a recurring expense, so it lands somewhere they can see.
    if (s.kind === 'subscription' && !(allMode && isHidden(user, 'subscriptions'))) {
      router.push({
        pathname: '/modals/subscription',
        params: {
          suggestionId: s.id,
          service: s.input.item,
          amount: s.input.amount_inr,
          category: s.input.category,
          billingCycle: s.input.frequency,
          nextDueDate: s.input.start_date,
          notes: s.input.notes ?? '',
        },
      })
      return
    }
    router.push({
      pathname: '/modals/recurring-expense',
      params: {
        suggestionId: s.id,
        item: s.input.item,
        amount: s.input.amount_inr,
        category: s.input.category,
        frequency: s.input.frequency,
        startDate: s.input.start_date,
        notes: s.input.notes ?? '',
        paymentMethod: s.input.payment_method ?? '',
      },
    })
  }

  const showEmptyResult =
    data?.scannedAt && !data.stale && !data.failed && !data.remaining && suggestions.length === 0 && !scan.isPending

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}
        >
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
            {allMode ? 'Find repeat payments' : subscriptionMode ? 'Find subscriptions' : 'Find recurring'}
          </Text>
          <Text style={[styles.headerSub, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
            {data?.scannedAt
              ? `Last scanned ${formatDateShort(data.scannedAt.slice(0, 10))}`
              : allMode ? 'Spot subscriptions and bills that repeat' : subscriptionMode ? 'Spot services you already pay for' : 'Spot repeated payments'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />
        }
      >
        <PopIn play delay={MOUNT_DELAY} style={[styles.introCard, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <View style={styles.introRow}>
            <View style={[styles.introIcon, { backgroundColor: tokens.accentSoft }]}>
              <Icon icon={ArrowsClockwise} size={20} color={tokens.accent} />
            </View>
            <Text style={[styles.introBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
              {allMode
                ? 'We’ll scan your expenses for subscriptions and payments that repeat. Choose which ones to keep track of.'
                : subscriptionMode
                ? 'We’ll scan your expenses for services with a regular billing pattern. Choose which ones to track.'
                : 'We’ll scan your expenses for repeated payments. Choose which ones to automate.'}
            </Text>
          </View>

          <View style={styles.periodRow}>
            {PERIODS.map((p) => (
              <Chip key={p.months} label={p.label} selected={months === p.months} onPress={() => selectMonths(p.months)} />
            ))}
          </View>

          <Button
            label={
              scan.isPending
                ? 'Scanning…'
                : data?.scannedAt && data.remaining > 0
                  ? 'Scan remaining patterns'
                  : allMode ? 'Find repeat payments' : subscriptionMode ? 'Find subscriptions' : 'Find recurring expenses'
            }
            onPress={() => scan.mutate(months)}
            disabled={busy || query.isLoading}
            style={styles.scanButton}
          />

          {months === 1 && (
            <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
              For monthly bills, try a 3 or 6 month scan.
            </Text>
          )}
        </PopIn>

        {scan.isPending ? (
          <View style={styles.loadingBlock}>
            <LoadingPhrase phrases={SCAN_PHRASES} color={tokens.text2} style={styles.loadingText} />
          </View>
        ) : (
          <>
            {query.isLoading && (
              <Text style={[styles.statusLine, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                Loading saved results…
              </Text>
            )}

            {data?.scannedAt && (
              <PopIn play delay={MOUNT_DELAY + ITEM_STAGGER} style={styles.statusBlock}>
                <Text style={[styles.statusLine, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                  Expenses from {formatDateShort(data.windowStart)} – {formatDateShort(data.windowEnd)}
                </Text>
                <Text style={[styles.statusLine, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
                  New expenses? Run another scan.
                </Text>
              </PopIn>
            )}

            {data?.stale && (
              <Text style={[styles.statusLine, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                Some saved suggestions changed. Scan again to refresh them.
              </Text>
            )}
            {Boolean(data?.failed) && (
              <Text style={[styles.statusLine, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                Some patterns couldn&apos;t be checked. Try scanning again.
              </Text>
            )}
            {data && data.remaining > 0 && data.scannedAt && (
              <Text style={[styles.statusLine, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                {data.remaining} new or changed patterns left to check.
              </Text>
            )}

            {showEmptyResult && (
              <PopIn
                play
                delay={MOUNT_DELAY + ITEM_STAGGER}
                style={[styles.emptyCard, { backgroundColor: tokens.card, borderColor: tokens.border }]}
              >
                <View style={[styles.emptyIcon, { backgroundColor: tokens.mintSoft }]}>
                  <Icon icon={CheckCircle} size={20} color={tokens.mint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.emptyTitle, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
                    {allMode ? 'No new repeat payments' : subscriptionMode ? 'No new subscriptions' : 'No new recurring payments'}
                  </Text>
                  <Text style={[styles.emptyBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                    Nothing new for this period. Tracked and dismissed payments stay hidden.
                  </Text>
                </View>
              </PopIn>
            )}

            {failure && (
              <Text style={[styles.errorLine, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>
                {failure}
              </Text>
            )}

            {suggestions.length > 0 && (
              <View style={{ gap: 10 }}>
                {suggestions.map((s, i) => (
                  <SuggestionRow
                    key={s.id}
                    suggestion={s}
                    index={i}
                    hideAmounts={hideAmounts}
                    busy={busy}
                    onReview={() => openSuggestion(s)}
                    onDismiss={() => dismiss.mutate(s.id)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function SuggestionRow({
  suggestion,
  index,
  hideAmounts,
  busy,
  onReview,
  onDismiss,
}: {
  suggestion: RecurringSuggestion
  index: number
  hideAmounts: boolean
  busy: boolean
  onReview: () => void
  onDismiss: () => void
}) {
  const { formatCurrency } = useCurrency()
  const { tokens } = useTheme()
  const reviewPress = usePressSpring(0.96)
  const dismissPress = usePressSpring(0.94)

  return (
    <PopIn
      play
      delay={MOUNT_DELAY + 2 * ITEM_STAGGER + Math.min(index, STAGGER_CAP) * ITEM_STAGGER}
      style={[styles.rowCard, { backgroundColor: tokens.card, borderColor: tokens.border }]}
    >
      <View style={styles.rowTop}>
        <Text style={[styles.rowTitle, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>
          {suggestion.input.item}
        </Text>
        <View style={[styles.kindPill, { backgroundColor: tokens.pillBg }]}>
          <Text style={[styles.kindText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
            {kindLabel(suggestion.kind)}
          </Text>
        </View>
      </View>

      <View style={styles.rowEvidence}>
        <Text style={[styles.rowEvidenceCount, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
          {suggestion.occurrences} payments found
        </Text>
        <Text style={[styles.rowEvidenceDates, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>
          {suggestion.dates.map((d) => formatDateShort(d)).join('  ·  ')}
        </Text>
      </View>

      {suggestion.variableAmount && (
        <Text style={[styles.rowNote, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
          Amounts vary. Review the latest amount before setting up automatic logging.
        </Text>
      )}

      <View style={styles.rowBottom}>
        <View>
          <Text style={[styles.rowAmount, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>
            {formatCurrency(Number(suggestion.input.amount_inr) || 0, hideAmounts)}
          </Text>
          <Text style={[styles.rowFrequency, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
            {suggestion.input.frequency}
            {suggestion.variableAmount ? ' · latest amount' : ''}
          </Text>
        </View>

        <View style={styles.rowActions}>
          <Reanimated.View style={reviewPress.style}>
            <Pressable
              disabled={busy}
              onPress={() => {
                tap()
                onReview()
              }}
              onPressIn={reviewPress.onPressIn}
              onPressOut={reviewPress.onPressOut}
              style={[styles.reviewButton, { backgroundColor: tokens.accent, opacity: busy ? 0.5 : 1 }]}
            >
              <Text style={[styles.reviewText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>Review</Text>
            </Pressable>
          </Reanimated.View>
          <Reanimated.View style={dismissPress.style}>
            <Pressable
              hitSlop={8}
              disabled={busy}
              onPress={() => {
                tap()
                onDismiss()
              }}
              onPressIn={dismissPress.onPressIn}
              onPressOut={dismissPress.onPressOut}
              style={{ opacity: busy ? 0.5 : 1, paddingVertical: 6 }}
            >
              <Text style={[styles.dismissText, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>Dismiss</Text>
            </Pressable>
          </Reanimated.View>
        </View>
      </View>
    </PopIn>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19 },
  headerSub: { fontSize: 12, marginTop: 1 },
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  introCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  introIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  introBody: { flex: 1, fontSize: 13, lineHeight: 18 },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  scanButton: { marginTop: 14, alignSelf: 'stretch' },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 10 },
  loadingBlock: { minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  statusBlock: { gap: 4 },
  statusLine: { fontSize: 12, lineHeight: 17 },
  errorLine: { fontSize: 12.5, lineHeight: 17 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  emptyIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 14 },
  emptyBody: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flexShrink: 1, fontSize: 15 },
  kindPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  kindText: { fontSize: 12 },
  rowEvidence: { marginTop: 6, gap: 2 },
  rowEvidenceCount: { fontSize: 12.5 },
  rowEvidenceDates: { fontSize: 12, letterSpacing: 0.1 },
  rowNote: { fontSize: 12, lineHeight: 15, marginTop: 6 },
  rowBottom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  rowAmount: { fontSize: 16 },
  rowFrequency: { fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  reviewButton: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  reviewText: { fontSize: 13 },
  dismissText: { fontSize: 13 },
})
