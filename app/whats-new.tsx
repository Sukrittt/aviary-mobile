import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { Button } from '@/src/components/ui/Button'
import { PopIn } from '@/src/components/shared/PopIn'
import { shownRelease } from '@/src/features/changelog/useChangelogGate'

function close() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

/** Opened by useChangelogGate, once per account, for the newest mobile release. */
export default function WhatsNewScreen() {
  const { tokens, radius, space, type } = useTheme()
  const insets = useSafeAreaInsets()
  const [release] = useState(shownRelease)

  // Restored from a cold start with nothing claimed: nothing to show.
  useEffect(() => {
    if (!release) close()
  }, [release])
  if (!release) return <View style={{ flex: 1, backgroundColor: tokens.bg }} />

  const date = release.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : ''
  const meta = [release.version, date].filter(Boolean).join(' · ')

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
          <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption }}>{"What's new in Aviary"}</Text>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title, textAlign: 'center' }}>{release.title}</Text>
          {!!meta && <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>{meta}</Text>}
        </PopIn>

        <PopIn play delay={160} style={{ width: '100%' }}>
          <View style={[styles.card, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.md, padding: space.md, gap: space.sm }]}>
            {release.highlights.map((line, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption, lineHeight: 20 }}>•</Text>
                <Text style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption, lineHeight: 20 }}>{line}</Text>
              </View>
            ))}
            {!!release.body && (
              <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption, lineHeight: 20, marginTop: space.xs }}>{release.body}</Text>
            )}
          </View>
        </PopIn>
      </ScrollView>

      <View style={{ padding: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.lg }}>
        <Button label="Got it" onPress={close} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { width: 60, height: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1 },
})
