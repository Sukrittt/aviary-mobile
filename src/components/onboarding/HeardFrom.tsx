import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useUpdateUser, useUser } from '@/src/hooks/useUser'
import { useDismissedRolloverBanner } from '@/src/hooks/useDismissedRolloverBanner'
import { track } from '@/src/lib/analytics'
import { OPT_IN_SINCE, extrasUnchosen } from '@/src/lib/features'
import { Card } from '@/src/components/ui/Card'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { SlideStrip } from '@/src/components/shared/SlideStrip'
import type { HeardFrom as Source, UserProfile } from '@/src/api/account'

/** Every answer, in the order shown. Twin of Web's HeardFrom.tsx; keys match the server's HEARD_FROM_SOURCES. */
export const HEARD_FROM_LABELS: Record<Source, string> = {
  friend: 'A friend',
  search: 'Google or search',
  social: 'Instagram, TikTok or X',
  reddit: 'Reddit',
  youtube: 'YouTube',
  appStore: 'App Store or Play Store',
  article: 'A blog or article',
  other: 'Somewhere else',
}

/** How long the thank-you check holds before the card slides away. */
const SAVED_HOLD_MS = 1100

/**
 * Whether Home should ask where a new account heard about us: never answered,
 * and only once the extras card is out of the way, so Home asks one thing at a time.
 */
export function heardFromUnasked(user: UserProfile | undefined): boolean {
  return !!user?.onboardedAt && !user.heardFrom && !!user.createdAt && user.createdAt >= OPT_IN_SINCE && !extrasUnchosen(user)
}

/**
 * A Home card, asked once after setup rather than during it, so it never
 * stands between a new account and its budget. One tap answers it.
 */
export function HeardFrom() {
  const { tokens, space, type } = useTheme()
  const user = useUser().data
  const updateUser = useUpdateUser()
  const [dismissed, setDismissed] = useDismissedRolloverBanner('heard-from')
  // The answer lands in the cached profile at once, which would drop the card
  // before its check plays; the phase holds it until it's slid off.
  const [phase, setPhase] = useState<'open' | 'saved' | 'leaving' | 'gone'>('open')

  useEffect(() => {
    if (phase !== 'saved') return
    const t = setTimeout(() => setPhase('leaving'), SAVED_HOLD_MS)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'gone' || (phase === 'open' && (dismissed !== false || !heardFromUnasked(user)))) return null

  const answer = (picked: Source) => {
    if (phase !== 'open') return
    Haptics.selectionAsync().catch(() => {})
    track('onboarding_heard_from', { source: picked })
    setPhase('saved')
    // A failed save isn't worth bothering anyone about: the event above already has the answer.
    updateUser.mutate({ heardFrom: picked })
  }

  const label = { fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }

  return (
    <SlideStrip
      leaving={phase === 'leaving'}
      gap={space.lg}
      onGone={() => {
        if (!user?.heardFrom) setDismissed(true)
        setPhase('gone')
      }}
    >
      <Card elevated={false}>
        {phase === 'open' ? (
          <>
            <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Where did you hear about us?</Text>
            <Text style={[styles.blurb, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>One tap. It helps us find more people like you.</Text>
            <View style={styles.chips}>
              {(Object.keys(HEARD_FROM_LABELS) as Source[]).map((key) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  onPress={() => answer(key)}
                  style={[styles.chip, { borderColor: tokens.borderStrong, backgroundColor: tokens.inputBg }]}
                >
                  <Text style={[styles.chipLabel, { color: tokens.text2 }]}>{HEARD_FROM_LABELS[key]}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPhase('leaving')} style={styles.notNow}>
              <Text style={[label, { color: tokens.text2 }]}>Not now</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.thanks}>
            <CheckIcon color={tokens.mint} size={18} />
            <Text style={[label, { color: tokens.text }]}>Thanks, that helps.</Text>
          </View>
        )}
      </Card>
    </SlideStrip>
  )
}

// Same chip as setup's income quick picks.
const styles = StyleSheet.create({
  title: { fontSize: 18, lineHeight: 23 },
  blurb: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 14 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1 },
  chipLabel: { fontSize: 12, fontFamily: fontFamily.bodyBold },
  notNow: { alignSelf: 'flex-start', marginTop: 14 },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
