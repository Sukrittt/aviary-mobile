import { useCurrency } from '@/src/context/CurrencyContext'
import { currencyUnit } from '@/src/lib/currencies'
import { useRecurringIncomes } from '@/src/hooks/useIncomes'
import { useAccounts } from '@/src/hooks/useAccounts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, RefreshControl, StyleSheet, Linking, Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useNavigation, useFocusEffect } from 'expo-router'
import { CaretRight, ChartLine } from '@/src/components/shared/icons'
import Reanimated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { rippleHaptic } from '@/src/lib/haptics'
import { AnimatedTabContent } from '@/src/components/nav/AnimatedTabContent'
import { Icon } from '@/src/components/shared/Icon'
import { SlideStrip } from '@/src/components/shared/SlideStrip'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { track } from '@/src/lib/analytics'
import { BottomSheet } from '@/src/components/shared/Modal'
import { useTheme } from '@/src/theme/ThemeProvider'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { fontFamily } from '@/src/theme/fonts'
import { useBudgets } from '@/src/hooks/useBudgets'
import { useLastSpent, useRecentExpenses } from '@/src/hooks/useExpenses'
import { useCategories } from '@/src/hooks/useCategories'
import { useGroupIcons, useGroups } from '@/src/hooks/useGroups'
import {
  computeEnvelopeState,
  currentMonthKey,
  prevMonthKey,
  daysLeftInMonth,
  monthAbbrev,
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
import { AnimatedPressable, IconButton, usePressSpring } from '@/src/components/ui/Button'
import { AmountText } from '@/src/components/ui/AmountText'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { ErrorScreen } from '@/src/components/shared/ErrorScreen'
import { useOnline } from '@/src/lib/netStatus'
import { BirdLandingMark, type BirdLandingMarkHandle } from '@/src/components/splash/BirdLandingMark'
import { getSystemStatus } from '@/src/api/systemStatus'
import { isVersionNewer } from '@/src/lib/version'
import appJson from '@/app.json'
import { useUser, useUpdateUser } from '@/src/hooks/useUser'
import { useFeatureNudge } from '@/src/hooks/useFeatureNudge'
import { firstBanner } from '@/src/lib/homeBanner'
import { Alert } from '@/src/components/ui/AlertHost'
import { isHidden } from '@/src/lib/features'
import { GetStartedCard } from '@/src/components/home/GetStartedCard'
import { paydayLabel, startingBalanceHref, upcomingMonthlyPay } from '@/src/lib/upcomingPay'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { FORCE_EMPTY_STATE_PREVIEW, emptyForPreview } from '@/src/lib/emptyStatePreview'

/**
 * The month's state, and only that: what is left to assign, where it went, and
 * which envelopes are in trouble. The trend chart, heatmap and subscriptions
 * moved to /insights — six modules on one scroll left nothing room to be large.
 */
export default function HomeScreen() {
  const { formatCurrency, currencyCode } = useCurrency()

  const { tokens, space, type, radius } = useTheme()
  const { refreshing, onRefresh } = useRefresh()
  const router = useRouter()
  const navigation = useNavigation()
  const online = useOnline()

  const budgetsQ = useBudgets()
  const expensesQ = useRecentExpenses()
  const lastSpent = useLastSpent().data
  const categoriesQ = useCategories()
  const groupsQ = useGroups()
  const groupIcons = useGroupIcons()
  const user = useUser().data

  const { hideAmounts } = usePrivacy()
  const month = currentMonthKey()
  const prevMonth = prevMonthKey(month)
  const [rolloverDismissed, setRolloverDismissed] = useDismissedRolloverBanner(prevMonth)
  // Nice slides the strip away first; it's only stored as dismissed once that's done.
  const [rolloverLeaving, setRolloverLeaving] = useState(false)
  // Trial reminders at 3 and 1 days left (7 days out is too early to spend
  // Home's one banner on). Same dismiss-once storage as the rollover banner,
  // keyed by threshold, so dismissing at 3 days still lets the 1-day through.
  const billing = useBillingStatus().data
  const trialBucket = trialReminderBucket(billing)
  const [trialDismissed, setTrialDismissed] = useDismissedRolloverBanner(`trial-${trialBucket}`)
  const updateUser = useUpdateUser()
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
  const categoryIcons = useMemo(
    () => new Map(categories.flatMap((c) => (c.icon ? [[c.name, c.icon] as const] : []))),
    [categories],
  )

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
  // A first pay next month leaves nothing to budget this month until they add what they have now.
  const upcomingPay = upcomingMonthlyPay(schedulesQ.data ?? [], month)

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
  // Read on render rather than via useIsFocused(), which re-rendered all of
  // Home on every tab blur and focus and held up the switch on the JS thread.
  // The only render that needs focus is a change waiting to roll in, so focus
  // asks for one just then.
  const covered = !navigation.isFocused() || openSheetCount > 0
  const heroPress = usePressSpring()
  const pillPress = usePressSpring()
  const [displayedReadyToAssign, setDisplayedReadyToAssign] = useState(envelopeState.readyToAssign)
  const [, setFocusTick] = useState(0)
  const rtaPending = displayedReadyToAssign !== envelopeState.readyToAssign
  useFocusEffect(
    useCallback(() => {
      if (rtaPending) setFocusTick((n) => n + 1)
    }, [rtaPending]),
  )
  // Adjusting state during render (not in an effect) so the sync happens in
  // the same commit as the value that triggered it, with no extra render.
  // Spending Ready to Assign down to zero is the method's payoff, so the
  // moment it lands (not a later load that's already at zero) gets a beat of
  // celebration before the slim row settles in.
  const [rtaCelebrating, setRtaCelebrating] = useState(false)
  if (!covered && displayedReadyToAssign !== envelopeState.readyToAssign) {
    if (envelopeState.income > 0 && Math.abs(envelopeState.readyToAssign) < 0.005 && Math.abs(displayedReadyToAssign) >= 0.005) {
      setRtaCelebrating(true)
    }
    setDisplayedReadyToAssign(envelopeState.readyToAssign)
  }
  useEffect(() => {
    if (!rtaCelebrating) return
    track('rta_zero_celebrated')
    const t = setTimeout(() => setRtaCelebrating(false), 2500)
    return () => clearTimeout(t)
  }, [rtaCelebrating])

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
    Haptics.selectionAsync().catch(() => {})
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  function toggleCollapseAll() {
    // Only the groups actually changing state count toward the ripple.
    const moving = groupedEnvelopes.filter((g) => collapsedGroups.has(g.group) === allGroupsCollapsed)
    rippleHaptic(moving.reduce((n, g) => n + g.envelopes.length, 0))
    setCollapsedGroups(allGroupsCollapsed ? new Set() : new Set(allGroupNames))
  }

  const incomeDone = envelopeState.income > 0
  // At zero, Ready to Assign has nothing to ask of you, so it shrinks to a
  // slim row and the envelopes (what you open Home for) move up. Off zero
  // either way, it's back to the full hero since there's a job to do.
  const rtaSettled = incomeDone && Math.abs(displayedReadyToAssign) < 0.005
  const daysLeftLabel = daysLeftInMonth() === 0 ? 'Less than 24 hrs' : `${daysLeftInMonth()} days left`
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

  const featureNudge = useFeatureNudge(user, expenses)
  // One banner at a time, most urgent first. A feature offer waits until
  // Get started is out of the way, so a new account isn't sold extras yet.
  const banner = firstBanner([
    ['update', showUpdateBanner && !!androidUpdate, false],
    ['trial', trialBucket !== null && trialBucket <= 3 && !!billing, trialDismissed],
    ['rollover', prevMonthLeftover > 0, rolloverDismissed],
    ['nudge', !!featureNudge.nudge && !showGetStarted, false],
  ])
  const nudge = banner === 'nudge' ? featureNudge.nudge : null

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

  // Offline blocks the whole screen, not just this one query error — a single
  // gate instead of six per-screen error branches (see OfflineScreen).
  if (!online) return <OfflineScreen />

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
            <BirdLandingMark ref={birdMarkRef} size={40} color={tokens.accent} autoplay={false} perched />
          </Pressable>
        }
        center={
          <View style={styles.headerMonth}>
            <Text style={{ color: tokens.accentInk, fontSize: type.bodyLg, fontFamily: fontFamily.displaySemiBold }}>{`${monthAbbrev(month)} ${month.slice(0, 4)}`}</Text>
            <Text style={{ color: tokens.text2, fontSize: type.micro, fontFamily: fontFamily.bodyMedium }}>{daysLeftLabel}</Text>
          </View>
        }
        actions={
          isHidden(user, 'insights') ? undefined : <IconButton icon={ChartLine} color={tokens.accentInk} background={tokens.accentSoft} accessibilityLabel="Insights" onPress={() => router.push('/insights')} />
        }
        contentContainerStyle={{ gap: space.lg }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />
        }
      >
        {/* Ready to Assign is the one number the envelope method is about, so it
            is the hero rather than one tile among four, until it's zero. */}
        {rtaSettled ? (
          <AnimatedPressable
            testID="rta-slim"
            accessibilityRole="button"
            accessibilityLabel="Ready to Assign options"
            accessibilityHint="Everything's assigned. Change or add income, or set Ready to Assign"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
              setIncomeSheetOpen(true)
            }}
            onPressIn={heroPress.onPressIn}
            onPressOut={heroPress.onPressOut}
            // A little air under the month header, which sits close above it.
            style={[heroPress.style, { marginTop: space.sm }]}
          >
            <Card elevated={false} style={[styles.slimRta, rtaCelebrating && { backgroundColor: tokens.pillGoodBg, borderColor: 'transparent' }]}>
              <Reanimated.Text
                key={rtaCelebrating ? 'celebrate' : 'label'}
                entering={FadeIn.duration(220)}
                exiting={FadeOut.duration(180)}
                style={{ color: tokens.text, fontSize: type.body, fontFamily: fontFamily.bodySemiBold }}
              >
                {rtaCelebrating ? `Every ${currencyUnit(currencyCode)} has a job.` : '💸  Ready to Assign'}
              </Reanimated.Text>
              <View style={styles.slimAmount}>
                <AmountText value={displayedReadyToAssign} size={type.body} color={tokens.mint} weight="displayBold" />
                {rtaCelebrating ? <CheckIcon color={tokens.mint} size={16} /> : <Icon icon={CaretRight} size={16} color={tokens.text2} />}
              </View>
            </Card>
          </AnimatedPressable>
        ) : (
          <View testID="rta-hero" style={[styles.hero, { paddingVertical: space.lg }]}>
            <Text style={[styles.heroLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>READY TO ASSIGN</Text>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Ready to Assign options"
              accessibilityHint="Change or add income, or set Ready to Assign"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                setIncomeSheetOpen(true)
              }}
              onPressIn={heroPress.onPressIn}
              onPressOut={heroPress.onPressOut}
              style={heroPress.style}
              hitSlop={8}
            >
              <AmountText
                value={displayedReadyToAssign}
                size={type.hero}
                color={displayedReadyToAssign < 0 ? tokens.coral : tokens.text}
                animate
                settle
                id="ready-to-assign"
              />
            </AnimatedPressable>
            {/* The hero tap is invisible, so this pill names where the number
                comes from. With no income yet it goes straight to setting it. */}
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                if (envelopeState.income === 0) {
                  router.push(changeIncomeHref)
                } else setIncomeSheetOpen(true)
              }}
              onPressIn={pillPress.onPressIn}
              onPressOut={pillPress.onPressOut}
              hitSlop={8}
              style={[styles.incomePill, { backgroundColor: envelopeState.income === 0 ? tokens.accentSoft : tokens.inputBg, borderRadius: radius.full }, pillPress.style]}
            >
              <Text style={{ color: envelopeState.income === 0 ? tokens.accentInk : tokens.text, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>
                {envelopeState.income === 0 ? 'Set your income' : `Income · ${formatCurrency(envelopeState.income, hideAmounts)}`}
              </Text>
              <Icon icon={CaretRight} size={14} color={envelopeState.income === 0 ? tokens.accentInk : tokens.text2} />
            </AnimatedPressable>
          </View>
        )}

        {/* The lasting record lives in Insights' "Where it went" card (any
            month, not just last), so this banner can stay a dismissable
            one-time heads-up rather than growing into one. */}
        {banner === 'update' && androidUpdate && (
          <Card style={styles.rolloverCard} elevated={false}>
            <Text style={{ color: tokens.text, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold, flex: 1 }}>
              {"There's a new version of Aviary. Update to keep getting fixes."}
            </Text>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(androidUpdate.storeUrl)} hitSlop={8}>
              <Text style={{ color: tokens.accent, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>Update</Text>
            </Pressable>
          </Card>
        )}

        {banner === 'trial' && billing && (
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

        {/* Same size and green as the settled Ready to Assign row. */}
        {banner === 'rollover' && (
          <SlideStrip
            leaving={rolloverLeaving}
            gap={space.lg}
            onGone={() => {
              setRolloverDismissed(true)
              setRolloverLeaving(false)
            }}
          >
            <Card style={[styles.rolloverCard, styles.slimRta, { backgroundColor: tokens.pillGoodBg, borderColor: 'transparent' }]} elevated={false}>
              <Text style={{ color: tokens.text, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold, flex: 1 }}>
                🌱 {formatCurrency(prevMonthLeftover, hideAmounts)} went to savings last month.
              </Text>
              <Pressable onPress={() => setRolloverLeaving(true)} disabled={rolloverLeaving} hitSlop={12}>
                <Text style={{ color: tokens.mint, fontSize: type.caption, fontFamily: fontFamily.bodyExtraBold }}>Nice</Text>
              </Pressable>
            </Card>
          </SlideStrip>
        )}

        {nudge && (
          // Waits for the savings strip to fade out instead of overlapping it.
          <Reanimated.View entering={FadeIn.delay(180).duration(220)}>
            <Card style={styles.rolloverCard} elevated={false}>
              <Text style={{ color: tokens.text, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold, flex: 1 }}>
                {nudge.message}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  updateUser.mutate(
                    { hiddenFeatures: featureNudge.hidden.filter((k) => k !== featureNudge.feature) },
                    { onError: () => Alert.alert("Couldn't turn that on", 'Check your connection and try again.') },
                  )
                  // navigate, not push: Scan a bill opens on the More tab.
                  router.navigate(nudge.href)
                }}
                hitSlop={8}
              >
                <Text style={{ color: tokens.accent, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>Turn on</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={featureNudge.dismiss} hitSlop={8}>
                <Text style={{ color: tokens.accentInk, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>Not now</Text>
              </Pressable>
            </Card>
          </Reanimated.View>
        )}

        {showGetStarted && (
          <Reanimated.View
            entering={FadeInDown.duration(420).springify().damping(22).stiffness(200)}
            exiting={FadeOut.duration(200)}
          >
            <GetStartedCard
              incomeDone={incomeDone}
              fundDone={fundDone}
              manualTransactionDone={!!user.manualTransactionCompletedAt}
              guidedTourDone={!!user.guidedTourCompletedAt}
              upcomingPayHint={upcomingPay ? `Your pay lands ${paydayLabel(upcomingPay.start_date)}. Budget what you have till then.` : undefined}
              onAddIncome={() =>
                router.push(upcomingPay ? startingBalanceHref(upcomingPay.start_date) : changeIncomeHref)
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

        {/* The weekly balance check keeps these totals honest without bank
            linking: a prompt when one is due, else the logged meter. */}
        {BALANCE_CHECK_ENABLED && <BalanceCheckCard />}

        {/* No layout transitions on this column: on Fabric a sibling springing in
            above (Get started) could leave this card drawn over it
            while its touch targets stayed at the real layout, so nothing tapped. */}
        <View>
          <Card elevated={false} style={envelopesEmpty && styles.emptyEnvelopesCard}>
            <View style={styles.cardHeadRow}>
              <Text style={[styles.cardTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }]}>
                Categories
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
                  title="Your categories are waiting"
                  description="Give every kind of spending a place to land."
                  action={{ label: 'Add your first category', onPress: () => router.navigate('/(tabs)/envelopes') }}
                />
              ) : groupedEnvelopes.map(({ group, envelopes }) => (
                <EnvelopeGroup
                  key={group}
                  group={group}
                  groupIcon={groupIcons.get(group)}
                  categoryIcons={categoryIcons}
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
                    <Text style={{ fontSize: 12, fontFamily: fontFamily.bodyBold, color: tokens.accent }}>PAYOFF</Text>
                  </View>
                  <EnvelopeRow
                    envelope={creditCardEnvelope}
                    icon="CreditCard"
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
        </View>

        {!isHidden(user, 'insights') && <View>
          <Pressable onPress={() => router.push('/insights')} style={[styles.insightsLink, { borderRadius: radius.lg }]}>
            <Text style={{ color: tokens.text2, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>
              Trends, daily spend and subscriptions
            </Text>
            <Icon icon={CaretRight} size={16} color={tokens.text2} />
          </Pressable>
        </View>}
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
  appIconButton: { width: 40, height: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 6 },
  incomePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 },
  sheetTitle: { fontSize: 16, marginBottom: 8 },
  sheetBtn: { paddingVertical: 12 },
  sheetBtnText: { fontSize: 14 },
  heroLabel: { fontSize: 12, letterSpacing: 0.6 },
  slimRta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  slimAmount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerMonth: { alignItems: 'center' },
  rolloverCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: {},
  emptyEnvelopesCard: { minHeight: 360 },
  emptyEnvelopesBody: { flex: 1, justifyContent: 'center' },
  insightsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14 },
  ccWrap: { borderTopWidth: 1 },
  ccBadgeRow: { flexDirection: 'row' },
})
