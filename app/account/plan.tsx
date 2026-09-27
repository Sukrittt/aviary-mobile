import { useState } from 'react'
import { View, Text, Pressable, ScrollView, Linking, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, ChevronRight, ExternalLink, HelpCircle, Lock, LogOut, RotateCcw, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react-native'
import type { PurchasesPackage } from 'react-native-purchases'
import { Alert } from '@/src/components/ui/AlertHost'
import { PlanPicker } from '@/src/components/billing/PlanPicker'
import { CurrentPlan } from '@/src/components/billing/CurrentPlan'
import { trackAviaryPro } from '@/src/lib/trackAviaryPro'
import { Icon } from '@/src/components/shared/Icon'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { clearAccess, sessionId } from '@/src/api/accessMode'
import { revokeSession } from '@/src/api/account'
import { useBillingStatus, seedBillingStatus } from '@/src/hooks/useBillingStatus'
import { getPackages, managementUrl, purchase, purchasesAvailable, restore } from '@/src/lib/purchases'
import { accessAllowed, formatDate, isWebPlan, lockedCopy, planSummary } from '@/src/lib/billingStatus'
import { BASE_URL } from '@/src/api/client'

const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions?package=com.sukrit04.envelope'
/** Where a plan bought on the website is managed and cancelled: the web account page's subscription section. */
const WEB_ACCOUNT_URL = `${BASE_URL}/account#subscription`

/**
 * Plan & billing — and, while access is off, the whole app.
 *
 * app/_layout.tsx registers this as the first screen of the restricted
 * block, so an expired account lands here with nothing underneath. That is
 * why the exits the plan promises (export, account, delete, sign out) live
 * on this screen rather than behind navigation the user can no longer reach.
 *
 * The device never decides access: every purchase and restore ends with the
 * server's answer, seeded into the cache (see src/lib/purchases.ts).
 */
export default function PlanScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const qc = useQueryClient()
  const { data: status, isLoading } = useBillingStatus()
  const [busy, setBusy] = useState<string | null>(null)

  const locked = !accessAllowed(status)
  // Checkout opens at trial expiry for v1 (payment-subscriptions-plan.md).
  // Play charges the moment a subscription starts, so buying early would
  // quietly forfeit the rest of the trial. During the trial the plans are
  // shown with their prices, but can't be bought yet.
  const showPlans = !!status?.purchaseEnabled && purchasesAvailable() && (status.mode === 'expired' || status.mode === 'trial')
  const canBuy = showPlans && status?.mode === 'expired'
  const paid = status?.mode === 'paid'
  const packagesQuery = useQuery({ queryKey: ['billing-packages'], queryFn: getPackages, enabled: showPlans || (paid && purchasesAvailable()) })
  const manageable = !!status?.productId && status.renewalState !== 'revoked' && status.renewalState !== 'expired'
  // Bought on the website: Play knows nothing about it, so managing and cancelling happen there.
  const web = isWebPlan(status)

  async function buy(pkg: PurchasesPackage) {
    setBusy(pkg.identifier)
    const outcome = await purchase(pkg)
    setBusy(null)
    if (outcome.status === 'purchased') {
      seedBillingStatus(qc, outcome.access)
      if (outcome.access.allowed) void trackAviaryPro(pkg, outcome.access.paidExpiresAt)
      if (!outcome.access.allowed) Alert.alert('Almost there', "Google Play took the payment, but we couldn't confirm it yet. Give it a minute and tap Restore purchases.")
    } else if (outcome.status === 'pending') {
      void qc.invalidateQueries({ queryKey: ['billing-status'] })
      Alert.alert('Payment pending', "Google Play is still confirming your payment. We'll unlock Aviary as soon as it clears. No need to pay again.")
    } else if (outcome.status === 'failed') {
      Alert.alert("Couldn't complete purchase", 'Google Play didn\'t finish the payment. Check your connection and try again.')
    }
  }

  async function doRestore() {
    setBusy('restore')
    try {
      const next = await restore()
      seedBillingStatus(qc, next)
      if (!next.allowed) Alert.alert('Nothing to restore', "We didn't find an active subscription for this Google account. Subscriptions belong to the Aviary account that bought them.")
    } catch {
      Alert.alert("Couldn't reach the store", 'Check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }

  async function openManage() {
    if (web) {
      await Linking.openURL(WEB_ACCOUNT_URL)
      return
    }
    await Linking.openURL((await managementUrl()) ?? PLAY_SUBSCRIPTIONS_URL)
  }

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
                    <Icon icon={Lock} size={18} color={tokens.accentInk} strokeWidth={2.4} />
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
                  <Icon icon={ChevronRight} size={16} color={tokens.text3} />
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
              </View>
            )}

            {showPlans ? (
              packagesQuery.data?.length ? (
                <PlanPicker
                  packages={packagesQuery.data}
                  unlockDate={canBuy ? null : formatDate(status.trialEndsAt)}
                  busy={busy !== null}
                  onBuy={(pkg) => void buy(pkg)}
                />
              ) : packagesQuery.isLoading ? (
                <ActivityIndicator color={tokens.accent} />
              ) : (
                <Text style={[styles.cardMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium, textAlign: 'center' }]}>
                  Plans aren&apos;t available right now. Try again in a little while.
                </Text>
              )
            ) : null}

            <View style={[styles.card, styles.list, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              <Row icon={RotateCcw} label={busy === 'restore' ? 'Checking…' : 'Restore purchases'} onPress={() => void doRestore()} disabled={busy !== null} tokens={tokens} />
              {manageable ? (
                <>
                  <View style={[styles.divider, { backgroundColor: tokens.border }]} />
                  <Row icon={ExternalLink} label={web ? 'Manage on the web' : 'Manage in Google Play'} onPress={() => void openManage()} tokens={tokens} />
                </>
              ) : null}
            </View>

            {locked ? (
              <View style={[styles.card, styles.list, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                <Row icon={UserRound} label="Manage or delete account" onPress={() => router.push('/account/security')} tokens={tokens} />
                <View style={[styles.divider, { backgroundColor: tokens.border }]} />
                <Row icon={HelpCircle} label="Help & feedback" onPress={() => router.push('/account/help')} tokens={tokens} />
                <View style={[styles.divider, { backgroundColor: tokens.border }]} />
                <Row icon={LogOut} label={busy === 'signout' ? 'Signing out…' : 'Sign out'} onPress={() => void signOut()} disabled={busy !== null} tokens={tokens} />
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
  icon: LucideIcon
  label: string
  onPress: () => void
  disabled?: boolean
  tokens: ReturnType<typeof useTheme>['tokens']
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.row, disabled && { opacity: 0.5 }]}>
      <Icon icon={icon} size={16} />
      <Text style={[styles.rowLabel, { flex: 1, marginLeft: 12, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>
      <Icon icon={ChevronRight} size={16} color={tokens.text3} />
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
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
})
