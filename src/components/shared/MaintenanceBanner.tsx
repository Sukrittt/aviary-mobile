import { useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text } from 'react-native'
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { Warning, X } from '@/src/components/shared/icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { getSystemStatus } from '@/src/api/systemStatus'
import type { BillingStatus } from '@/src/api/billing'
import { BASE_URL } from '@/src/api/client'
import { formatDate, isWebPlan } from '@/src/lib/billingStatus'
import { managementUrl } from '@/src/lib/purchases'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { DROP_SPRING, dropInStyle } from '@/src/components/ui/Toast'

export const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions?package=com.sukrit04.envelope'
/** Where a plan bought on the website is managed and cancelled: the web account page's subscription section. */
export const WEB_ACCOUNT_URL = `${BASE_URL}/account#subscription`

/** Play's own page for this subscription, or the website's for a web plan. */
export async function openPlanManagement(web: boolean): Promise<void> {
  await Linking.openURL(web ? WEB_ACCOUNT_URL : (await managementUrl()) ?? PLAY_SUBSCRIPTIONS_URL)
}

// Focus here is the app's foreground (app/_layout.tsx wires focusManager to
// AppState). Only an answer over a minute old is refetched: refetching on
// every return doubled up with the fetch Home and More make on mount.
function useMaintenanceMessage(): string {
  const { data } = useQuery({ queryKey: ['system-status'], queryFn: getSystemStatus, staleTime: 60_000, refetchInterval: 5 * 60_000, refetchOnWindowFocus: true, retry: false })
  return data?.maintenance?.on ? data.maintenance.message : ''
}

/**
 * The maintenance notice set from the web admin's System page. Polled every
 * 5 minutes and on returns to the foreground. A floating pill under the
 * status bar, matching the web banner, that drops in and out with the
 * log-expense Toast's animation. Tapping it hides the current message until a
 * different one is set. Any failure renders nothing.
 */
export function MaintenanceBanner() {
  const [dismissed, setDismissed] = useState<string | null>(null)
  const message = useMaintenanceMessage()
  return <BannerPill message={message} visible={!!message && message !== dismissed} onDismiss={setDismissed} />
}

// Per launch: hidden for the rest of this session, back next time while still in grace.
let graceDismissed = false

/**
 * A renewal that didn't go through, said on Home instead of only on the Plan
 * page, so nobody meets the 402 wall cold. Same pill as maintenance, which
 * wins when both are up: two stacked banners read as an app on fire.
 */
export function GraceBanner({ status }: { status: BillingStatus | undefined }) {
  const [dismissed, setDismissed] = useState(graceDismissed)
  const maintenance = useMaintenanceMessage()
  const grace = status?.renewalState === 'grace'
  const web = isWebPlan(status)
  const until = formatDate(status?.paidExpiresAt)
  const message = !grace
    ? ''
    : web
      ? `Payment didn't go through. We're retrying. You keep everything until ${until}.`
      : `Payment didn't go through. You keep everything until ${until}. Fix it in Google Play.`
  return (
    <BannerPill
      message={message}
      visible={!!message && !dismissed && !maintenance}
      onPress={() => void openPlanManagement(web).catch(() => {})}
      onDismiss={() => {
        graceDismissed = true
        setDismissed(true)
      }}
    />
  )
}

function BannerPill({ message, visible, onPress, onDismiss }: { message: string; visible: boolean; onPress?: () => void; onDismiss: (text: string) => void }) {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  // Last non-empty copy, so the exit animation doesn't shrink an empty pill.
  const [text, setText] = useState(message)
  if (message && message !== text) setText(message)

  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)
  useEffect(() => {
    if (!visible) progress.value = withTiming(0, { duration: 220 })
    else progress.value = reduceMotion ? withTiming(1, { duration: 160 }) : withSpring(1, DROP_SPRING)
  }, [visible, reduceMotion, progress])
  const animStyle = useAnimatedStyle(() => dropInStyle(progress.value, 1, 0, reduceMotion))

  if (!text) return null

  return (
    <Reanimated.View pointerEvents={visible ? 'box-none' : 'none'} style={[styles.wrap, { top: insets.top + 8 }, animStyle]}>
      <Pressable
        accessibilityRole="alert"
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
        onPress={() => (onPress ? onPress() : onDismiss(text))}
        style={[styles.pill, { backgroundColor: tokens.cardSolid, borderColor: tokens.warn }]}
      >
        <Warning size={16} color={tokens.warn} />
        <Text style={[styles.text, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{text}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={8}
          onPress={() => onDismiss(text)}
          style={[styles.close, { backgroundColor: tokens.warnSoft }]}
        >
          <X size={14} color={tokens.text} />
        </Pressable>
      </Pressable>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  text: { flexShrink: 1, fontSize: 13 },
  close: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
})
