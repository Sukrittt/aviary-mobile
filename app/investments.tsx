import { useCurrency } from '@/src/context/CurrencyContext'
import { useMemo, useState } from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react-native'
import { Alert } from '@/src/components/ui/AlertHost'
import { BottomSheet } from '@/src/components/shared/Modal'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { useOnline } from '@/src/lib/netStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { formatDateShort, formatDateTime, formatOrdinalDate } from '@/src/lib/format'
import { useHoldings, useDeleteHolding } from '@/src/hooks/useHoldings'
import { useHoldingEvents } from '@/src/hooks/useHoldingEvents'
import { AllocationBar, type AllocationSegment } from '@/src/components/charts/AllocationBar'
import { LineChart } from '@/src/components/charts/LineChart'
import { netWorthHistory } from '@/src/lib/netWorthHistory'
import { CHART_COLOR_CYCLE } from '@/src/theme/chartColors'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { PopIn } from '@/src/components/shared/PopIn'
import { DeletingRow } from '@/src/components/activity/DeletingRow'
import { AmountText } from '@/src/components/ui/AmountText'
import { useRefresh } from '@/src/hooks/useRefresh'
import type { HoldingRow, HoldingEventRow } from '@/src/types'
import type { ThemeTokens } from '@/src/theme/tokens'
import { EMPTY } from '@/src/lib/constants'
import { FORCE_EMPTY_STATE_PREVIEW, emptyForPreview } from '@/src/lib/emptyStatePreview'

// Fixed colors for common asset types (mirrors Web's ASSET_COLORS intent);
// unrecognized types cycle through the remaining palette so every segment
// still gets a distinct, theme-adaptive color.
const FIXED_TYPE_COLOR: Record<string, keyof ThemeTokens> = {
  Equity: 'blue',
  FD: 'mint',
  'Mutual Fund': 'violet',
  Gold: 'accent',
  Crypto: 'coral',
  Bonds: 'warn',
}

const INVESTMENT_PHRASES = [
  'Waking up your portfolio…',
  'Counting your compounding…',
  'Asking the bulls and bears to play nice…',
  'Polishing the allocation bar…',
  'Watching the SIPs do their thing…',
  'Chasing green arrows…',
  'Hoping the FDs remember their returns…',
  'Giving Gold its moment…',
  'Reminding stocks to be kind to you…',
  'Valuing your positions…',
  'Reconciling with your risk appetite…',
  'Letting the market marinate…',
  'Summoning the fund managers…',
  "Asking the index funds why you didn't buy earlier…",
]

function colorForType(type: string, index: number, tokens: ThemeTokens): string {
  const key = FIXED_TYPE_COLOR[type] ?? CHART_COLOR_CYCLE[index % CHART_COLOR_CYCLE.length]
  return tokens[key]
}

function eventLabel(type: string): string {
  switch (type) {
    case 'market_update':
      return 'Market update'
    case 'contribution':
      return 'Contribution'
    case 'withdrawal':
      return 'Withdrawal'
    default:
      return type
  }
}

function eventColor(type: string, tokens: ThemeTokens): string {
  if (type === 'market_update') return tokens.accent
  if (type === 'contribution') return tokens.mint
  if (type === 'withdrawal') return tokens.coral
  return tokens.text2
}

type ActionType = 'market_update' | 'contribution' | 'withdrawal'

const HOLDINGS_MOUNT_DELAY_MS = 100
const HOLDINGS_ITEM_STAGGER_MS = 45
const HOLDINGS_ITEM_STAGGER_CAP_INDEX = 6

export default function InvestmentsScreen() {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const { hideAmounts } = usePrivacy()
  const { refreshing, onRefresh } = useRefresh()
  const online = useOnline()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const holdingsQuery = useHoldings()
  const eventsQuery = useHoldingEvents()
  const deleteHolding = useDeleteHolding()

  const [sheetHolding, setSheetHolding] = useState<HoldingRow | null>(null)
  // Set once the confirm sheet's Delete is tapped; drives the row's collapse
  // animation in DeletingRow. The actual mutate() call is deferred until that
  // animation finishes (see its onDone), so the refetch-driven removal never
  // pops a still-visible row. Mirrors app/(tabs)/activity.tsx's pendingDelete.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const holdings = emptyForPreview(holdingsQuery.data ?? EMPTY)
  const events = emptyForPreview(eventsQuery.data ?? EMPTY)

  const netWorth = useMemo(
    () => holdings.reduce((sum, h) => sum + (Number(h.value) || 0), 0),
    [holdings],
  )

  const history = useMemo(
    () => netWorthHistory(holdings, events).map((p) => ({ x: p.t, y: p.value })),
    [holdings, events],
  )
  const historyDelta = history.length > 1 ? history[history.length - 1].y - history[0].y : null

  const segments: AllocationSegment[] = useMemo(() => {
    const byType = new Map<string, number>()
    for (const h of holdings) {
      const val = Number(h.value) || 0
      byType.set(h.type, (byType.get(h.type) ?? 0) + val)
    }
    return Array.from(byType.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, value], i) => ({ label: type, value, color: colorForType(type, i, tokens) }))
  }, [holdings, tokens])

  const recentEvents = useMemo(
    () => events.slice().sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    [events],
  )

  const isLoading = !FORCE_EMPTY_STATE_PREVIEW && (holdingsQuery.isLoading || eventsQuery.isLoading)
  const errorMessage = FORCE_EMPTY_STATE_PREVIEW ? null :
    (holdingsQuery.error instanceof Error && holdingsQuery.error.message) ||
    (eventsQuery.error instanceof Error && eventsQuery.error.message) ||
    (deleteHolding.error instanceof Error && deleteHolding.error.message) ||
    null

  function openAction(action: ActionType) {
    if (!sheetHolding) return
    const name = sheetHolding.name
    setSheetHolding(null)
    router.push({ pathname: '/modals/holding-action', params: { name, action } })
  }

  function openEdit() {
    if (!sheetHolding) return
    const name = sheetHolding.name
    setSheetHolding(null)
    router.push({ pathname: '/modals/add-holding', params: { name } })
  }

  function confirmDelete() {
    if (!sheetHolding) return
    const name = sheetHolding.name
    setSheetHolding(null)
    Alert.alert('Delete holding', `Remove "${name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setPendingDelete(name) },
    ])
  }

  function runDelete(name: string) {
    // Left set on success so the row stays collapsed until the refetch drops
    // it — clearing it here springs the row back to full height for a whole
    // round trip. On failure the row does come back, which is the signal.
    deleteHolding.mutate(name, { onError: () => setPendingDelete(null) })
  }

  if (!online) return <OfflineScreen />

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          Investments
        </Text>
        <Pressable onPress={() => router.push('/modals/add-holding')} hitSlop={12} style={styles.headerActionRow}>
          <Icon icon={Plus} size={16} color={tokens.accent} />
          <Text style={[styles.headerAction, { color: tokens.accent, fontFamily: fontFamily.bodySemiBold }]}>
            Add
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centerFill}>
          <LoadingCaption phrases={INVESTMENT_PHRASES} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />
          }
        >
          {errorMessage && (
            <Text style={[styles.errorText, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>
              {errorMessage}
            </Text>
          )}

          <View style={styles.netWorthBlock}>
            <Text style={[styles.nwLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
              Net Worth
            </Text>
            <AmountText value={netWorth} size={styles.nwAmount.fontSize} weight="displayBold" animate />
          </View>

          {historyDelta != null && (
            <View style={styles.trendBlock}>
              <Text style={[styles.trend, { color: historyDelta < 0 ? tokens.coral : tokens.mint, fontFamily: fontFamily.bodyBold }]}>
                {historyDelta < 0 ? '-' : '+'}
                {formatCurrency(Math.abs(historyDelta), hideAmounts)} since {formatDateShort(new Date(history[0].x).toISOString())}
              </Text>
              <LineChart
                data={history}
                formatX={(x) => formatDateShort(new Date(x).toISOString())}
                formatY={(y) => formatCurrency(y, hideAmounts)}
              />
            </View>
          )}

          {segments.length > 0 && (
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              <AllocationBar segments={segments} />
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
            Holdings
          </Text>

          {holdings.length === 0 ? (
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              <EmptyState
                subject="holdings"
                title="Room to grow"
                description="No holdings yet. Add one to get started."
                action={{ label: 'Add a holding', onPress: () => router.push('/modals/add-holding') }}
              />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {holdings.map((h, i) => (
                <DeletingRow
                  key={h.name}
                  active={pendingDelete === h.name}
                  onDone={() => {
                    if (pendingDelete) runDelete(pendingDelete)
                  }}
                >
                  <PopIn
                    play
                    delay={HOLDINGS_MOUNT_DELAY_MS + Math.min(i, HOLDINGS_ITEM_STAGGER_CAP_INDEX) * HOLDINGS_ITEM_STAGGER_MS}
                    style={[styles.holdingRow, { backgroundColor: tokens.card, borderColor: tokens.border }]}
                  >
                    <Pressable
                      onPress={() => setSheetHolding(h)}
                      style={styles.holdingRowInner}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.holdingName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
                          numberOfLines={1}
                        >
                          {h.name}
                        </Text>
                        <Text
                          style={[styles.holdingMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}
                        >
                          {h.type} · Updated {formatDateTime(h.updated_at)}
                        </Text>
                        {h.is_recurring === 'true' && (
                          <Text style={[styles.recurringBadge, { color: tokens.accent, fontFamily: fontFamily.bodySemiBold }]}>
                            Monthly {formatCurrency(Number(h.recurring_amount) || 0, hideAmounts)}
                            {h.next_contribution_date && ` · Next ${formatOrdinalDate(h.next_contribution_date)}`}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.holdingValue, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>
                        {formatCurrency(Number(h.value) || 0, hideAmounts)}
                      </Text>
                    </Pressable>
                  </PopIn>
                </DeletingRow>
              ))}
            </View>
          )}

          {events.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
                Activity ({events.length})
              </Text>
              <View style={{ gap: 8 }}>
                {recentEvents.map((e, i) => (
                  <EventRow key={i} event={e} tokens={tokens} hideAmounts={hideAmounts} />
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      <BottomSheet visible={sheetHolding !== null} onClose={() => setSheetHolding(null)}>
        <Text style={[styles.sheetTitle, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
          {sheetHolding?.name}
        </Text>
        <SheetOption label="Update market value" color={tokens.text} onPress={() => openAction('market_update')} />
        <SheetOption label="Add contribution" color={tokens.text} onPress={() => openAction('contribution')} divider />
        <SheetOption label="Withdraw" color={tokens.text} onPress={() => openAction('withdrawal')} divider />
        <SheetOption label="Edit monthly contribution" color={tokens.text} onPress={openEdit} divider />
        <View style={[styles.sheetDivider, { backgroundColor: tokens.border }]} />
        <SheetOption label="Delete" color={tokens.coral} onPress={confirmDelete} />
        <SheetOption label="Cancel" color={tokens.text2} onPress={() => setSheetHolding(null)} divider />
      </BottomSheet>
    </View>
  )
}

function SheetOption({
  label,
  color,
  onPress,
  divider,
}: {
  label: string
  color: string
  onPress: () => void
  divider?: boolean
}) {
  const { tokens } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={[styles.sheetOption, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }]}
    >
      <Text style={[styles.sheetOptionText, { color, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>
    </Pressable>
  )
}

function EventRow({ event, tokens, hideAmounts }: { event: HoldingEventRow; tokens: ThemeTokens; hideAmounts: boolean }) {
  const { formatCurrency } = useCurrency()

  const amount = Number(event.amount) || 0
  const prev = Number(event.previous_value) || 0
  const next = Number(event.new_value) || 0
  const sign = event.event_type === 'withdrawal' ? '-' : '+'
  return (
    <View style={[styles.eventRow, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.eventTopRow}>
          <Text style={[styles.eventType, { color: eventColor(event.event_type, tokens), fontFamily: fontFamily.bodySemiBold }]}>
            {eventLabel(event.event_type)}
          </Text>
          <Text style={[styles.eventAmount, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>
            {sign}{formatCurrency(amount, hideAmounts)}
          </Text>
        </View>
        <Text style={[styles.eventMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>
          {event.holding_name} · {formatDateTime(event.timestamp)}
        </Text>
        <View style={styles.eventDeltaRow}>
          <Text style={[styles.eventDelta, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
            {formatCurrency(prev, hideAmounts)}
          </Text>
          <Icon icon={ArrowRight} size={12} color={tokens.text3} />
          <Text style={[styles.eventDelta, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
            {formatCurrency(next, hideAmounts)}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerActionRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  headerAction: { fontSize: 14 },
  headerTitle: { fontSize: 17 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, gap: 16 },
  errorText: { fontSize: 13 },
  netWorthBlock: { gap: 4 },
  nwLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  nwAmount: { fontSize: 34 },
  trendBlock: { gap: 10, marginTop: -8 },
  trend: { fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 16, marginTop: 4 },
  holdingRow: {
    borderWidth: 1,
    borderRadius: 14,
  },
  holdingRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  holdingName: { fontSize: 15 },
  holdingMeta: { fontSize: 12, marginTop: 2 },
  recurringBadge: { fontSize: 11, marginTop: 3 },
  holdingValue: { fontSize: 15 },
  eventRow: { borderWidth: 1, borderRadius: 14, padding: 12 },
  eventTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventType: { fontSize: 13 },
  eventAmount: { fontSize: 13 },
  eventMeta: { fontSize: 12, marginTop: 2 },
  eventDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  eventDelta: { fontSize: 11 },
  sheetTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
  sheetOption: { paddingVertical: 14, alignItems: 'center' },
  sheetOptionText: { fontSize: 16 },
  sheetDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
})
