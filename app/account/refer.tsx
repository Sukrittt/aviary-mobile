import { View, Text, Pressable, ScrollView, Share, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { ScreenHeader } from '@/src/components/shared/ScreenHeader'
import { ReferralCodeEntry } from '@/src/components/ReferralCodeEntry'
import { getReferrals, referralsKey, shareMessage } from '@/src/api/referrals'
import { track } from '@/src/lib/analytics'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** More → Refer a friend. Twin of Web's /account/refer. */
export default function ReferScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const q = useQuery({ queryKey: referralsKey, queryFn: getReferrals })
  const data = q.data

  function share() {
    if (!data) return
    // Android reports sharedAction even when the chooser is dismissed, so this counts sheets opened.
    track('referral_link_shared', { method: 'share' })
    Share.share({ message: shareMessage(data.link) }).catch(() => {})
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScreenHeader title="Refer a friend" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Give a month, get a month</Text>
          <Text style={[styles.body, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            Share your link. When a friend sets up Aviary and logs expenses on three different days, you both get a month of Pro.
          </Text>
          {q.isError && (
            <Text style={[styles.fine, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>
              {"Couldn't load your code. Check your connection and try again."}
            </Text>
          )}
          <View style={[styles.codeTile, { backgroundColor: tokens.accentSoft }]}>
            <Text style={[styles.codeLabel, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>YOUR CODE</Text>
            <Text selectable style={[styles.code, { color: tokens.accent, fontFamily: fontFamily.displaySemiBold }]}>{data?.code ?? '······'}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={share} disabled={!data} style={[styles.cta, { backgroundColor: tokens.accent, opacity: data ? 1 : 0.6 }]}>
            <Text style={[styles.ctaText, { color: tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>Share link</Text>
          </Pressable>
          {data && (
            <Text style={[styles.stats, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
              {plural(data.joined, 'friend')} joined · {plural(data.monthsEarned, 'month')} earned
            </Text>
          )}
          <Text style={[styles.fine, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            You can earn up to 3 months each calendar month. On a paid web plan, the free month is added after your current paid period.
          </Text>
        </View>
        {data?.canEnterCode && (
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <ReferralCodeEntry />
          </View>
        )}
        {data?.referredBy && (
          <Text style={[styles.fine, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>You joined with code {data.referredBy}.</Text>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 },
  title: { fontSize: 24, letterSpacing: -0.4 },
  body: { fontSize: 15, lineHeight: 22 },
  codeTile: { borderRadius: 16, paddingVertical: 18, alignItems: 'center', gap: 6 },
  codeLabel: { fontSize: 12, letterSpacing: 1.2 },
  code: { fontSize: 34, letterSpacing: 6 },
  cta: { borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontSize: 16 },
  stats: { fontSize: 15, textAlign: 'center' },
  fine: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
})
