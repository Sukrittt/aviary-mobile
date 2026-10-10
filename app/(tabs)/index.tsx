import { useCurrency } from '@/src/context/CurrencyContext'
import { useRecurringIncomes } from '@/src/hooks/useIncomes'
import { useAccounts } from '@/src/hooks/useAccounts'
import { useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, RefreshControl, StyleSheet, Linking, Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useIsFocused } from 'expo-router'
import { ChevronRight, LineChart } from 'lucide-react-native'
import Reanimated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { AnimatedTabContent } from '@/src/components/nav/AnimatedTabContent'
import { Icon } from '@/src/components/shared/Icon'
import { BottomSheet } from '@/src/components/shared/Modal'
import { useTheme } from '@/src/theme/ThemeProvider'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { fontFamily } from '@/src/theme/fonts'
import { useBudgets } from '@/src/hooks/useBudgets'
import { useLastSpent, useRecentExpenses } from '@/src/hooks/useExpenses'
import { useCategories } from '@/src/hooks/useCategories'
import { useGroups } from '@/src/hooks/useGroups'
import {
  computeEnvelopeState,
  currentMonthKey,
  prevMonthKey,
  daysLeftInMonth,
  monthLabel,
  type Envelope,
} from '@/src/lib/envelope'

import { EMPTY } from '@/src/lib/constants'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { useRefresh } from '@/src/hooks/useRefresh'
import { useCollapsedGroups } from '@/src/hooks/useCollapsedGroups'
import { useDismissedRolloverBanner } from '@/src/hooks/useDismissedRolloverBanner'
import { useBillingStatus } from '@/src/hooks/useBillingStatus'
import { trialReminderBucket, trialRemainingLabel } from '@/src/lib/billingStatus'
import { BALANCE_CHECK_ENABLED, BalanceCheckCard } from '@/src/components/balance/BalanceCheckCard'
import { EnvelopeGroup } from '@/src/components/envelope/EnvelopeGroup'
import { EnvelopeRow } from '@/src/components/envelope/EnvelopeRow'
import { Screen } from '@/src/components/ui/Screen'
import { Card } from '@/src/components/ui/Card'
import { IconButton } from '@/src/components/ui/Button'
import { AmountText } from '@/src/components/ui/AmountText'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { ErrorScreen } from '@/src/components/shared/ErrorScreen'
import { useOnline } from '@/src/lib/netStatus'
import { BirdLandingMark, type BirdLandingMarkHandle } from '@/src/components/splash/BirdLandingMark'
import { getSystemStatus } from '@/src/api/systemStatus'
import { isVersionNewer } from '@/src/lib/version'
import appJson from '@/app.json'
import { useUser } from '@/src/hooks/useUser'
import { isHidden } from '@/src/lib/features'
import { GetStartedCard } from '@/src/components/home/GetStartedCard'
import { LearningCard } from '@/src/components/home/LearningCard'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { FORCE_EMPTY_STATE_PREVIEW, emptyForPreview } from '@/src/lib/emptyStatePreview'

/**
 * The month's state, and only that: what is left to assign, where it went, and
 * which envelopes are in trouble. The trend chart, heatmap and subscriptions
 * moved to /insights — six modules on one scroll left nothing room to be large.
 */
export default function HomeScreen() {
  const { formatCurrency } = useCurrency()

  const { scheme, tokens, space, type, radius } = useTheme()
  const { refreshing, onRefresh } = useRefresh()
  const router = useRouter()
  const isFocused = useIsFocused()
  const online = useOnline()

  const budgetsQ = useBudgets()
  const expensesQ = useRecentExpenses()
  const lastSpent = useLastSpent().data
  const categoriesQ = useCategories()
  const groupsQ = useGroups()
  const user = useUser().data

  const { hideAmounts } = usePrivacy()
  const month = currentMonthKey()
  const prevMonth = prevMonthKey(month)
  const [rolloverDismissed, setRolloverDismissed] = useDismissedRolloverBanner(prevMonth)
  // Trial reminders at 7, 3 and 1 days left. Same dismiss-once storage as the
  // rollover banner, keyed by threshold, so dismissing at 7 days still lets
  // the 3-day reminder through.
  const billing = useBillingStatus().data
  const trialBucket = trialReminderBucket(billing)
  const [trialDismissed, setTrialDismissed] = useDismissedRolloverBanner(`trial-${trialBucket}`)
  const showTrialBanner = trialBucket !== null && trialDismissed === false
  const [getStartedSkipped, setGetStartedSkipped] = useDismissedRolloverBanner('get-started')
  // OTA updates cover JS changes, so this only fires when the admin raises the
  // minimum after a native build older installs can't get over the air. Not
  // dismissable: below the minimum they stop receiving fixes.
  const systemStatus = useQuery({ queryKey: ['system-status'], queryFn: getSystemStatus, staleTime: 5 * 60_000 }).data
  const androidUpdate = Platform.OS === 'android' ? systemStatus?.appUpdate?.android : undefined
  const showUpdateBanner = !!androidUpdate?.minVersion && isVersionNewer(androidUpdate.minVersion, appJson.expo.version)
  const [collapsedGroups, setCollapsedGroups] = useCollapsedGroups('home')
  // How many envelope action sheets are currently open — a plain boolean would
  // do since only one can be open at a time in practice, but a count is safe
  // against overlap and avoids relying on that assumption.
  const [openSheetCount, setOpenSheetCount] = useState(0)
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false)
  const schedulesQ = useRecurringIncomes()
  // Warms the accounts cache, so Log expense has them on its first open and
  // doesn't send an expense without the account it would have defaulted to.
  useAccounts()
  const monthlySchedules = (schedulesQ.data ?? []).filter((r) => r.frequency === 'monthly' && r.status === 'active')
  const birdMarkRef = useRef<BirdLandingMarkHandle>(null)

  const budgets = emptyForPreview(budgetsQ.data ?? EMPTY)
  const expenses = emptyForPreview(expensesQ.data ?? EMPTY)
  const categories = emptyForPreview(categoriesQ.data ?? EMPTY)
  const groups = emptyForPreview(groupsQ.data ?? EMPTY)

  const envelopeState = useMemo(
    () => computeEnvelopeState(budgets, expenses, month, categories, groups, lastSpent),
    [budgets, expenses, month, categories, groups, lastSpent],
  )

  // Every way to set income edits the monthly schedule Ready to Assign counts
  // from day 1. With more than one, or before they've loaded (a create form
  // then could duplicate one), the Income screen is the place to pick.
  const changeIncomeHref = !schedulesQ.data || monthlySchedules.length > 1
    ? '/account/income' as const
    : monthlySchedules.length === 1
      ? { pathname: '/modals/recurring-income' as const, params: { id: monthlySchedules[0].id } }
      : { pathname: '/modals/recurring-income' as const, params: { label: 'Monthly income', frequency: 'monthly', amount: envelopeState.incomeBase > 0 ? String(envelopeState.incomeBase) : '' } }

  const prevEnvelopeState = useMemo(
    () => computeEnvelopeState(budgets, expenses, prevMonth, categories, groups),
    [budgets, expenses, prevMonth, categories, groups],
  )

  // Money doesn't roll into envelopes anymore (see envelope.ts), so this is a
  // one-time heads-up on what was left unspent overall, not a running balance.
  const prevMonthLeftover = useMemo(
    () => prevEnvelopeState.income - prevEnvelopeState.totalSpent,
    [prevEnvelopeState],
  )

  // An edit that changes Ready to Assign (Move Money, or an envelope's action
  // sheet here) resolves and refetches while the screen that made the change
  // is still covering Home — a pushed route blurs it (isFocused false), a
  // BottomSheet covers it in place (openSheetCount > 0). Left wired straight
  // to envelopeState.readyToAssign, the odometer's roll starts and finishes
  // entirely off-screen, so reveal just shows the settled number. Holding the
  // displayed value frozen until Home is actually visible again defers that
  // roll to the moment it can be seen.
  const covered = !isFocused || openSheetCount > 0
  const [displayedReadyToAssign, setDisplayedReadyToAssign] = useState(envelopeState.readyToAssign)
  // Adjusting state during render (not in an effect) so the sync happens in
  // the same commit as the value that triggered it, with no extra render.
  if (!covered && displayedReadyToAssign !== envelopeState.readyToAssign) {
    setDisplayedReadyToAssign(envelopeState.readyToAssign)
  }

  const groupedEnvelopes = useMemo(() => {
    const byGroup = new Map<string, Envelope[]>()
    for (const e of envelopeState.envelopes) {
      if (e.isCreditCardPayment) continue
      const arr = byGroup.get(e.group) ?? []
      arr.push(e)
      byGroup.set(e.group, arr)
    }
    return envelopeState.groups
      .map((g) => ({ group: g, envelopes: byGroup.get(g) ?? [] }))
      .filter((g) => g.envelopes.length > 0)
  }, [envelopeState])

  const creditCardEnvelope = envelopeState.envelopes.find((e) => e.isCreditCardPayment)
  const envelopesEmpty = groupedEnvelopes.length === 0 && !creditCardEnvelope

  const allGroupNames = groupedEnvelopes.map((g) => g.group)
  const allGroupsCollapsed = allGroupNames.length > 0 && allGroupNames.every((g) => collapsedGroups.has(g))

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  function toggleCollapseAll() {
    setCollapsedGroups(allGroupsCollapsed ? new Set() : new Set(allGroupNames))
  }

  const showRolloverBanner = rolloverDismissed === false && prevMonthLeftover > 0
  const incomeDone = envelopeState.income > 0
  // Every rupee has a job once Ready to Assign is spent down, the whole point
  // of the method, so Get started holds out for that, not one funded envelope.
  const fundDone = incomeDone && envelopeState.readyToAssign <= 0
  const homeEnvelopes = groupedEnvelopes.flatMap((g) => g.envelopes)
  // The next empty envelope on screen, so each tap moves the job along.
  const nextToFund = (homeEnvelopes.find((e) => e.assigned === 0) ?? homeEnvelopes[0])?.category
  const showGetStarted =
    getStartedSkipped === false &&
    !!user?.getStartedAt &&
    !(incomeDone && fundDone && user.manualTransactionCompletedAt && user.guidedTourCompletedAt)

  function handleEditAmount(category: string) {
    router.push({ pathname: '/modals/edit-assigned-amount', params: { category } })
  }

  function handleMoveMoney(category: string) {
    router.push({ pathname: '/modals/move-money', params: { fromCategory: category } })
  }

  function handleViewTransactions(category: string) {
    router.push({ pathname: '/(tabs)/activity', params: { category } })
  }

  function handleSheetOpenChange(open: boolean) {
    setOpenSheetCount((c) => c + (open ? 1 : -1))
  }

  const isLoading = !FORCE_EMPTY_STATE_PREVIEW && (budgetsQ.isLoading || expensesQ.isLoading || categoriesQ.isLoading || groupsQ.isLoading)
  // A failed refresh keeps the last good data, so only a query with nothing to show is an error.
  const hasError = !FORCE_EMPTY_STATE_PREVIEW && [budgetsQ, expensesQ, categoriesQ, groupsQ].some((q) => q.error && q.data === undefined)

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <LoadingCaption />
      </View>
    )
  }

  // Saved data stays on screen offline (the root OfflineBanner says so); the
  // full offline screen is only for when there's nothing to show.
  if (hasError && !online) return <OfflineScreen />

  if (hasError) {
    return (
      <ErrorScreen
        title="Couldn't load your budget"
        message="Check your connection and try again."
        onRetry={() => {
          budgetsQ.refetch()
          expensesQ.refetch()
          categoriesQ.refetch()
          groupsQ.refetch()
        }}
      />
    )
  }

  return (
    <AnimatedTabContent>
      <Screen
        title={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aviary app icon"
            accessibilityHint="Replays the bird landing animation"
            hitSlop={8}
            onPress={() => birdMarkRef.current?.replay()}
            style={styles.appIconButton}
          >
            <BirdLandingMark ref={birdMarkRef} size={56} color={scheme === 'light' ? '#000000' : tokens.text} autoplay={false} perched />
          </Pressable>
        }
        actions={
          isHidden(user, 'insights') ? undefined : <IconButton icon={LineChart} accessibilityLabel="Insights" onPress={() => router.push('/insights')} />
        }
        contentContainerStyle={{ gap: space.lg }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />
        }
      >
        {/* Ready to Assign is the one number the envelope method is about, so it
            is the hero rather than one tile among four. */}
        <View style={[styles.hero, { paddingVertical: space.xl }]}>
          <Text style={[styles.heroLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>READY TO ASSIGN</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ready to Assign options"
            accessibilityHint="Change or add income, or set Ready to Assign"
            onPress={() => setIncomeSheetOpen(true)}
            hitSlop={8}
          >
            <AmountText
              value={displayedReadyToAssign}
              size={type.hero}
              color={displayedReadyToAssign < 0 ? tokens.coral : tokens.text}
              weight="displayBold"
              animate
              id="ready-to-assign"
            />
          </Pressable>
          <Text style={{ color: tokens.text2, fontSize: type.caption, fontFamily: fontFamily.bodyMedium }}>
            {monthLabel(month)} · {daysLeftInMonth() === 0 ? 'Less than 24 hrs' : `${daysLeftInMonth()} days left`}
          </Text>
          {/* The hero tap is invisible, so this pill names where the number
              comes from. With no income yet it goes straight to setting it. */}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              envelopeState.income === 0
                ? router.push(changeIncomeHref)
                : setIncomeSheetOpen(true)
            }
            hitSlop={8}
            style={[styles.incomePill, { backgroundColor: envelopeState.income === 0 ? tokens.accentSoft : tokens.inputBg, borderRadius: radius.full }]}
          >
            <Text style={{ color: envelopeState.income === 0 ? tokens.accentInk : tokens.text, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>
              {envelopeState.income === 0 ? 'Set your income' : `Income · ${formatCurrency(envelopeState.income, hideAmounts)}`}
            </Text>
            <Icon icon={ChevronRight} size={14} color={envelopeState.income === 0 ? tokens.accentInk : tokens.text2} />
          </Pressable>
        </View>

        {/* The lasting record lives in Insights' "Where it went" card (any
            month, not just last), so this banner can stay a dismissable
            one-time heads-up rather than growing into one. */}
        {showUpdateBanner && androidUpdate && (
          <Card style={styles.rolloverCard} elevated={false}>
            <Text style={{ color: tokens.text, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold, flex: 1 }}>
              {"There's a new version of Aviary. Update to keep getting fixes."}
            </Text>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(androidUpdate.storeUrl)} hitSlop={8}>
              <Text style={{ color: tokens.accent, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>Update</Text>
            </Pressable>
          </Card>
        )}

        {showTrialBanner && billing && (
          <Card style={styles.rolloverCard} elevated={false}>
            <Pressable onPress={() => router.push('/account/plan')} style={{ flex: 1 }}>
              <Text style={{ color: tokens.text, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>
                Free trial · {trialRemainingLabel(billing.trialDaysRemaining).toLowerCase()}. See plans and prices.
              </Text>
            </Pressable>
            <Pressable onPress={() => setTrialDismissed(true)} hitSlop={8}>
              <Text style={{ color: tokens.accentInk, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>Okay</Text>
            </Pressable>
          </Card>
        )}

        {showRolloverBanner && (
          <Card style={styles.rolloverCard} elevated={false}>
            <Text style={{ color: tokens.text, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold, flex: 1 }}>
              {formatCurrency(prevMonthLeftover, hideAmounts)} left over from last month.
            </Text>
            <Pressable onPress={() => setRolloverDismissed(true)} hitSlop={8}>
              <Text style={{ color: tokens.accentInk, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>Okay</Text>
            </Pressable>
          </Card>
        )}

        {showGetStarted && (
          <Reanimated.View
            entering={FadeInDown.duration(420).springify().damping(22).stiffness(200)}
            exiting={FadeOut.duration(200)}
            layout={LinearTransition.springify().damping(44).stiffness(400)}
          >
            <GetStartedCard
              incomeDone={incomeDone}
              fundDone={fundDone}
              manualTransactionDone={!!user.manualTransactionCompletedAt}
              guidedTourDone={!!user.guidedTourCompletedAt}
              onAddIncome={() =>
                router.push(changeIncomeHref)
              }
              fundHint={incomeDone ? `${formatCurrency(envelopeState.readyToAssign, hideAmounts)} still to assign` : undefined}
              onFund={() => (nextToFund ? handleEditAmount(nextToFund) : router.navigate('/(tabs)/envelopes'))}
              onAddTransaction={() => router.push('/modals/log-expense')}
              onTakeTour={() => router.push('/account/guided-tour')}
              onSkip={() => {
                Haptics.selectionAsync().catch(() => {})
                setGetStartedSkipped(true)
              }}
            />
          </Reanimated.View>
        )}

        <LearningCard />

        {/* The weekly balance check keeps these totals honest without bank
            linking: a prompt when one is due, else the logged meter. */}
        {BALANCE_CHECK_ENABLED && <BalanceCheckCard />}

        <Reanimated.View layout={LinearTransition.springify().damping(64).stiffness(900)}>
          <Card elevated={false} style={envelopesEmpty && styles.emptyEnvelopesCard}>
            <View style={styles.cardHeadRow}>
              <Text style={[styles.cardTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }]}>
                Envelopes
              </Text>
              {!envelopesEmpty && (
                <Pressable onPress={toggleCollapseAll} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ color: tokens.accentInk, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>
                    {allGroupsCollapsed ? 'Expand all' : 'Collapse all'}
                  </Text>
                </Pressable>
              )}
            </View>
            <View style={[{ marginTop: space.xs }, envelopesEmpty && styles.emptyEnvelopesBody]}>
              {envelopesEmpty ? (
                <EmptyState
                  compact
                  subject="envelopes"
                  title="Your envelopes are waiting"
                  description="Give every kind of spending a place to land."
                  action={{ label: 'Add your first envelope', onPress: () => router.navigate('/(tabs)/envelopes') }}
                />
              ) : groupedEnvelopes.map(({ group, envelopes }) => (
                <EnvelopeGroup
                  key={group}
                  group={group}
                  envelopes={envelopes}
                  hideAmounts={hideAmounts}
                  onMoveMoney={handleMoveMoney}
                  onEditAmount={handleEditAmount}
                  onViewTransactions={handleViewTransactions}
                  expanded={!collapsedGroups.has(group)}
                  onToggle={toggleGroup}
                  onSheetOpenChange={handleSheetOpenChange}
                />
              ))}
              {creditCardEnvelope && (
                <Reanimated.View
                  layout={LinearTransition.springify().damping(64).stiffness(600)}
                  style={[styles.ccWrap, { borderTopColor: tokens.border, paddingTop: space.sm, marginTop: space.sm }]}
                >
                  <View style={styles.ccBadgeRow}>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: tokens.accent }}>PAYOFF</Text>
                  </View>
                  <EnvelopeRow
                    envelope={creditCardEnvelope}
                    emoji="💳"
                    displayName="Credit Card Payment"
                    hideAmounts={hideAmounts}
                    onMoveMoney={handleMoveMoney}
                    onEditAmount={handleEditAmount}
                    onViewTransactions={handleViewTransactions}
                    onSheetOpenChange={handleSheetOpenChange}
                  />
                </Reanimated.View>
              )}
            </View>
          </Card>
        </Reanimated.View>

        {!isHidden(user, 'insights') && <Reanimated.View layout={LinearTransition.springify().damping(44).stiffness(400)}>
          <Pressable onPress={() => router.push('/insights')} style={[styles.insightsLink, { borderRadius: radius.lg }]}>
            <Text style={{ color: tokens.text2, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>
              Trends, daily spend and subscriptions
            </Text>
            <Icon icon={ChevronRight} size={16} color={tokens.text2} />
          </Pressable>
        </Reanimated.View>}
      </Screen>
      {/* No room for a pencil on the hero, so tapping it opens this. With RTA
          often at 0, the title is the only place Home shows income. */}
      <BottomSheet visible={incomeSheetOpen} onClose={() => setIncomeSheetOpen(false)}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          Income {formatCurrency(envelopeState.income, hideAmounts)}
        </Text>
        {([
          ['Change income', changeIncomeHref],
          ['Add income', '/modals/add-income'],
          ['Manage income', '/account/income'],
          ['Set Ready to Assign', '/modals/edit-ready-to-assign'],
        ] as const).map(([label, href]) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            style={styles.sheetBtn}
            onPress={() => {
              setIncomeSheetOpen(false)
              router.push(href)
            }}
          >
            <Text style={[styles.sheetBtnText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>{label}</Text>
          </Pressable>
        ))}
      </BottomSheet>
    </AnimatedTabContent>
  )
}

const styles = StyleSheet.create({
  appIconButton: { width: 56, height: 56 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 6 },
  incomePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 },
  sheetTitle: { fontSize: 16, marginBottom: 8 },
  sheetBtn: { paddingVertical: 12 },
  sheetBtnText: { fontSize: 14 },
  heroLabel: { fontSize: 10, letterSpacing: 0.6 },
  rolloverCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: {},
  emptyEnvelopesCard: { minHeight: 360 },
  emptyEnvelopesBody: { flex: 1, justifyContent: 'center' },
  insightsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14 },
  ccWrap: { borderTopWidth: 1 },
  ccBadgeRow: { flexDirection: 'row' },
})
