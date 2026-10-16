import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useUpdateUser } from '@/src/hooks/useUser'
import { track } from '@/src/lib/analytics'
import { tap } from '@/src/lib/haptics'
import type { HeardFrom as Source } from '@/src/api/account'

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

/** Setup's very last screen, after the budget is saved, so skipping it costs nothing. */
export function HeardFrom({ onDone }: { onDone: () => void }) {
  const { tokens } = useTheme()
  const updateUser = useUpdateUser()
  const [picked, setPicked] = useState<Source | null>(null)
  const [saving, setSaving] = useState(false)

  const finish = async () => {
    if (saving) return
    tap()
    if (!picked) return onDone()
    setSaving(true)
    track('onboarding_heard_from', { source: picked })
    // A failed save isn't worth stopping anyone for: the event above already has the answer.
    await updateUser.mutateAsync({ heardFrom: picked }).catch(() => {})
    onDone()
  }

  return (
    <View style={{ flex: 1 }}>
      <Animated.Text entering={FadeIn.duration(350)} style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
        Where did you hear about us?
      </Animated.Text>
      <Animated.Text entering={FadeIn.delay(80).duration(350)} style={[styles.blurb, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
        Last one, promise. It helps us find more people like you.
      </Animated.Text>

      <View style={styles.chips}>
        {(Object.keys(HEARD_FROM_LABELS) as Source[]).map((key) => {
          const on = picked === key
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                setPicked(on ? null : key)
              }}
              style={[styles.chip, { borderColor: on ? tokens.accent : tokens.borderStrong, backgroundColor: on ? tokens.accentSoft : tokens.inputBg }]}
            >
              <Text style={[styles.chipLabel, { color: on ? tokens.accent : tokens.text2 }]}>{HEARD_FROM_LABELS[key]}</Text>
            </Pressable>
          )
        })}
      </View>

      <Pressable accessibilityRole="button" onPress={finish} disabled={saving} style={[styles.cta, { backgroundColor: tokens.accent, opacity: saving ? 0.6 : 1 }]}>
        <Text style={[styles.ctaText, { color: tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>
          {saving ? 'Saving…' : picked ? 'Start budgeting' : 'Skip for now'}
        </Text>
      </Pressable>
    </View>
  )
}

// Same chip as setup's income quick picks.
const styles = StyleSheet.create({
  title: { fontSize: 32, lineHeight: 37, letterSpacing: -0.3 },
  blurb: { fontSize: 15, lineHeight: 23, marginTop: 7, maxWidth: 320 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', gap: 8, paddingTop: 24 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1 },
  chipLabel: { fontSize: 12, fontFamily: fontFamily.bodyBold },
  cta: { marginTop: 16, minHeight: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 15 },
})
