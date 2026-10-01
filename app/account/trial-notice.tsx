import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { Button } from '@/src/components/ui/Button'
import { PopIn } from '@/src/components/shared/PopIn'
import { useBillingStatus } from '@/src/hooks/useBillingStatus'
import { billingVisible, formatDate } from '@/src/lib/billingStatus'

/**
 * Shown once, right after budget setup finishes onboarding. Payments
 * aren't live yet, so this sets expectations instead of staying silent
 * about it. See Mobile/app/_layout.tsx for the onboarding handoff, and
 * Mobile/app/(tabs)/more.tsx for the same note surfaced
 * later under Plan & billing — that row pushes here with ?from=more, which is
 * what decides whether "Got it" goes back or hands off to the app.
 */
export default function TrialNoticeScreen() {
  const { tokens, radius, space, type } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  // Once subscriptions launch the trial is real and dated, so say so instead
  // of the "payments are coming" note.
  const billing = useBillingStatus().data
  const live = billingVisible(billing)

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: space.lg,
          paddingTop: insets.top + space.xl,
          paddingBottom: space.lg,
          gap: space.lg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PopIn play delay={0}>
          <View style={[styles.badge, { backgroundColor: tokens.accentSoft }]}>
            <Icon icon={Sparkles} size={28} color={tokens.accentInk} strokeWidth={2.2} />
          </View>
        </PopIn>

        <PopIn play delay={80} style={{ gap: space.xs, alignItems: 'center' }}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title, textAlign: 'center' }}>
            {"You're on the trial plan"}
          </Text>
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption, textAlign: 'center', lineHeight: 20 }}>
            {live
              ? `Everything's free until ${formatDate(billing?.trialEndsAt)}. No card needed, nothing to cancel.`
              : "We're still building payments, so everything's free while you wait. No card needed, nothing to cancel."}
          </Text>
        </PopIn>

        <PopIn play delay={160} style={{ width: '100%' }}>
          <View style={[styles.card, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.md, padding: space.md, gap: space.sm }]}>
            <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption }}>
              {live ? 'What happens when it ends' : 'What happens once payments are ready'}
            </Text>
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption, lineHeight: 20 }}>
              {live
                ? "We'll remind you a week before. Then you can pick a monthly or yearly plan in the app. Nothing is charged automatically, and you can always export your data for free."
                : "You'll get a full 45-day trial from that point, we'll tell you before it starts. We haven't landed on a price yet, but it'll be easy on your wallet."}
            </Text>
          </View>
        </PopIn>
      </ScrollView>

      <View style={{ padding: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.lg }}>
        <Button label="Got it" onPress={() => (from === 'more' ? router.back() : router.replace('/(tabs)'))} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { width: 60, height: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1 },
})
