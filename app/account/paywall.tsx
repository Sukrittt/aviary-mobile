import { useEffect, useRef } from 'react'
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from '@/src/components/shared/icons'
import { PlanPicker } from '@/src/components/billing/PlanPicker'
import { Icon } from '@/src/components/shared/Icon'
import { track } from '@/src/lib/analytics'
import { usePaywall } from '@/src/hooks/usePaywall'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/**
 * The full-screen paywall, opened from Plan & billing. While the trial runs
 * it's the timeline: what happens and when, with no button to press until
 * Play can actually sell. Once access has ended it's the benefits pitch.
 * A locked-out account sees that inline on Plan & billing instead, where
 * the exits live, so if access is lost while this is open (a restore that
 * finds nothing, say) it hands straight back there.
 */
export default function PaywallScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { status, locked, canBuy, packagesQuery, busy, buy, doRestore } = usePaywall()

  const close = () => (router.canGoBack() ? router.back() : router.replace('/account/plan'))
  // Paid: nothing left to sell. Locked: Plan & billing has the pitch and the exits.
  const done = status?.mode === 'paid' || locked
  useEffect(() => {
    if (done) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close is recreated each render
  }, [done])

  // Once per open. A locked account is logged by Plan & billing, where it's handed back to.
  const seen = useRef(false)
  useEffect(() => {
    if (!status || locked || seen.current) return
    seen.current = true
    track('paywall_viewed', { trigger: 'plan_screen', plan_status: status.mode })
  }, [status, locked])

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        {!locked ? (
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={[styles.close, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <Icon icon={X} size={18} color={tokens.text} />
          </Pressable>
        ) : <View style={{ width: 36, height: 36 }} />}
        <Pressable onPress={() => void doRestore()} disabled={busy !== null} hitSlop={12} accessibilityRole="button">
          <Text style={[styles.restore, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold, opacity: busy !== null ? 0.5 : 1 }]}>
            {busy === 'restore' ? 'Checking…' : 'Restore'}
          </Text>
        </Pressable>
      </View>

      {packagesQuery.data?.length && status ? (
        <PlanPicker
          pinned
          packages={packagesQuery.data}
          variant={status.mode === 'trial' && !locked ? 'timeline' : 'benefits'}
          trialEndsAt={status.trialEndsAt}
          trialDaysRemaining={status.trialDaysRemaining}
          canBuy={canBuy}
          busy={busy !== null}
          onBuy={(pkg) => void buy(pkg)}
        />
      ) : packagesQuery.isLoading || !status ? (
        <ActivityIndicator color={tokens.accent} style={{ marginTop: 40 }} />
      ) : (
        <Text style={[styles.empty, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          Plans aren&apos;t available right now. Try again in a little while.
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  close: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  restore: { fontSize: 14 },
  empty: { fontSize: 13, lineHeight: 19, textAlign: 'center', padding: 24 },
})
