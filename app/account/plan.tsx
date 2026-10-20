import { useEffect, useRef } from 'react'
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, CaretRight, ArrowSquareOut, Question, Lock, SignOut, ArrowCounterClockwise, ShieldCheck, User, type PhosphorIcon } from '@/src/components/shared/icons'
import { PlanPicker } from '@/src/components/billing/PlanPicker'
import { PlanPickerSkeleton } from '@/src/components/shared/TabSkeleton'
import { CurrentPlan } from '@/src/components/billing/CurrentPlan'
import { track } from '@/src/lib/analytics'
import { Icon } from '@/src/components/shared/Icon'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { clearAccess, currentUserId, sessionId } from '@/src/api/accessMode'
import { revokeSession } from '@/src/api/account'
import { usePaywall } from '@/src/hooks/usePaywall'
import { openPlanManagement } from '@/src/components/shared/MaintenanceBanner'
import { PACKAGE_TYPE } from 'react-native-purchases'
import { formatDate, isWebPlan, lockedCopy, planSummary } from '@/src/lib/billingStatus'
import { useQueryClient } from '@tanstack/react-query'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { firstName, ownerOf } from '@/src/lib/budgetMembership'
import { BudgetIcon } from '@/src/components/budgets/BudgetIcon'


/**
 * Plan & billing — and, while access is off, the whole app.
 *
 * app/_layout.tsx registers this as the first screen of the restricted
 * block, so an expired account lands here with nothing underneath. That is
 * why the exits the plan promises (export, account, delete, sign out) live
 * on this screen rather than behind navigation the user can no longer reach.
 *
 * Plans are only inline once access has ended (the benefits pitch, under
 * the lock card so the exits stay one scroll away). During the trial Play
 * can't sell yet, so there's one row that opens the paywall modal instead.
 */
export default function PlanScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { status, isLoading, locked, showPlans, canBuy, paid, packagesQuery, busy, setBusy, buy, doRestore } = usePaywall()
  const inlinePlans = showPlans && (locked || status?.mode === 'expired')
  // Budgets someone else pays for stay open to this person; only the lock on
  // their own plan put them here, so give them a way through to those.
  const queryClient = useQueryClient()
  const shared = useBudgetSpaces().budgets.filter((b) => b.role === 'member' && !b.readOnly)
  const openShared = (id: string) => {
    const uid = currentUserId()
    if (uid) void switchBudget(queryClient, uid, id)
  }
  // Once per visit, the first moment plans are actually on screen.
  const paywallSeen = useRef(false)
  useEffect(() => {
    if (!inlinePlans || paywallSeen.current) return
    paywallSeen.current = true
    track('paywall_viewed', { trigger: locked ? 'access_expired' : 'plan_screen', plan_status: status?.mode ?? 'unknown' })
  }, [inlinePlans, locked, status?.mode])
  const manageable = !!status?.productId && status.renewalState !== 'revoked' && status.renewalState !== 'expired'
  // Bought on the website: Play knows nothing about it, so managing and cancelling happen there.
  const web = isWebPlan(status)
  // The cheapest monthly figure Play quotes, for the trial row's hint. Never formatted here.
  const fromPrice =
    packagesQuery.data?.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL)?.product.pricePerMonthString ??
    packagesQuery.data?.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY)?.product.priceString

  const openManage = () => openPlanManagement(web)

  async function signOut() {
    setBusy('signout')
    const sid = sessionId()
    if (sid) await revokeSession(sid).catch(() => {})
    // Unmounts this screen via the root navigator's session guard.
    await clearAccess()
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        {/* No way out while locked: this screen is the whole app then. Once
            access returns (say, straight after a purchase) the stack was
            rebuilt with this screen at the bottom, so back goes Home. */}
        {!locked ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <Icon icon={ArrowLeft} size={20} color={tokens.text} />
          </Pressable>
        ) : null}
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Plan & billing</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        {isLoading || !status ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {locked ? (
              <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border, padding: 0, gap: 0 }]}>
                <View style={styles.lockHead}>
                  <View style={[styles.lockBadge, { backgroundColor: tokens.accentSoft }]}>
                    <Icon icon={Lock} size={18} color={tokens.accentInk} weight="bold" />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.lockTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{lockedCopy(status).title}</Text>
                    <Text style={[styles.cardMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{lockedCopy(status).body}</Text>
                  </View>
                </View>
                <View style={[styles.divider, { backgroundColor: tokens.border }]} />
                <Pressable onPress={() => router.push('/account/data')} style={styles.row}>
                  <Icon icon={ShieldCheck} size={16} color={tokens.mint} />
                  <Text style={[styles.rowLabel, { flex: 1, marginLeft: 12, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
                    Your data&apos;s safe. Export it free, anytime.
                  </Text>
                  <Icon icon={CaretRight} size={16} color={tokens.text3} />
                </Pressable>
              </View>
            ) : paid ? (
              <CurrentPlan status={status} packages={packagesQuery.data ?? []} />
            ) : (
              <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                <Text style={[styles.cardTitle, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{planSummary(status)}</Text>
                {status.mode === 'trial' ? (
                  <Text style={[styles.cardMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                    {`Free until ${formatDate(status.trialEndsAt)}. You won't be charged unless you pick a plan.`}
                  </Text>
                ) : null}
                {status.mode === 'trial' && showPlans ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: tokens.border, marginHorizontal: -16, marginTop: 10 }]} />
                    <Pressable onPress={() => router.push('/account/paywall')} accessibilityRole="button" style={styles.planRow}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
                          {status.trialDaysRemaining <= 7 ? 'See plans' : `What happens on ${formatDate(status.trialEndsAt)}`}
                        </Text>
                        {fromPrice ? (
                          <Text style={[styles.cardMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                            {`From ${fromPrice}/month. Nothing's charged unless you subscribe.`}
                          </Text>
                        ) : null}
                      </View>
                      <Icon icon={CaretRight} size={16} color={tokens.text3} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            )}

            {inlinePlans ? (
              packagesQuery.data?.length ? (
                <PlanPicker
                  packages={packagesQuery.data}
                  variant="benefits"
                  trialEndsAt={status.trialEndsAt}
                  trialDaysRemaining={status.trialDaysRemaining}
                  canBuy={canBuy}
                  busy={busy !== null}
                  onBuy={(pkg) => void buy(pkg)}
                />
              ) : packagesQuery.isLoading ? (
                <PlanPickerSkeleton timeline={false} />
              ) : (
                <Text style={[styles.cardMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium, textAlign: 'center' }]}>
                  Plans aren&apos;t available right now. Try again in a little while.
                </Text>
              )
            ) : null}

            <View style={[styles.card, styles.list, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              <Row icon={ArrowCounterClockwise} label={busy === 'restore' ? 'Checking…' : 'Restore purchases'} onPress={() => void doRestore()} disabled={busy !== null} tokens={tokens} />
              {manageable ? (
                <>
                  <View style={[styles.divider, { backgroundColor: tokens.border }]} />
                  <Row icon={ArrowSquareOut} label={web ? 'Manage on the web' : 'Manage in Google Play'} onPress={() => void openManage()} tokens={tokens} />
                </>
              ) : null}
            </View>

            {locked && shared.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>Budgets shared with you</Text>
                <View style={[styles.card, styles.list, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                  {shared.map((b, i) => {
                    const owner = firstName(ownerOf(b)?.name)
                    return (
                      <View key={b.id}>
                        {i > 0 ? <View style={[styles.divider, { backgroundColor: tokens.border }]} /> : null}
                        <Pressable onPress={() => openShared(b.id)} accessibilityRole="button" accessibilityLabel={`Open ${b.name}`} style={styles.row}>
                          <BudgetIcon budget={b} size={16} color={tokens.text} />
                          <View style={{ flex: 1, marginLeft: 12, gap: 2 }}>
                            <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{b.name}</Text>
                            <Text style={[styles.cardMeta, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
                              {owner ? `${owner} pays for this one` : 'Paid for by its owner'}, so it stays open to you
                            </Text>
                          </View>
                          <Icon icon={CaretRight} size={16} color={tokens.text3} />
                        </Pressable>
                      </View>
                    )
                  })}
                </View>
              </View>
            ) : null}

            {locked ? (
              <View style={[styles.card, styles.list, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                <Row icon={User} label="Manage or delete account" onPress={() => router.push('/account/security')} tokens={tokens} />
                <View style={[styles.divider, { backgroundColor: tokens.border }]} />
                <Row icon={Question} label="Help & feedback" onPress={() => router.push('/account/help')} tokens={tokens} />
                <View style={[styles.divider, { backgroundColor: tokens.border }]} />
                <Row icon={SignOut} label={busy === 'signout' ? 'Signing out…' : 'Sign out'} onPress={() => void signOut()} disabled={busy !== null} tokens={tokens} />
              </View>
            ) : null}

            {manageable ? (
              <Text style={[styles.footnote, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
                {web
                  ? "You subscribed on the website, so that's where you change or cancel your plan. Deleting your Aviary account cancels it for you."
                  : "Deleting your Aviary account doesn't cancel a Google Play subscription. Cancel it in Google Play first."}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Row({
  icon,
  label,
  onPress,
  disabled,
  tokens,
}: {
  icon: PhosphorIcon
  label: string
  onPress: () => void
  disabled?: boolean
  tokens: ReturnType<typeof useTheme>['tokens']
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.row, disabled && { opacity: 0.5 }]}>
      <Icon icon={icon} size={16} />
      <Text style={[styles.rowLabel, { flex: 1, marginLeft: 12, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>
      <Icon icon={CaretRight} size={16} color={tokens.text3} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19 },
  scrollContent: { padding: 16, gap: 12 },
  card: { padding: 16, borderWidth: 1, borderRadius: 20, gap: 6 },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  cardTitle: { fontSize: 16 },
  cardMeta: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 14 },
  divider: { height: StyleSheet.hairlineWidth },
  lockHead: { flexDirection: 'row', gap: 14, padding: 16, alignItems: 'flex-start' },
  lockBadge: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  lockTitle: { fontSize: 19 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 4 },
})
