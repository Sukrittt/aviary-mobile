import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { BirdLandingMark } from '@/src/components/splash/BirdLandingMark'
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
  // Highlights carry the screen; the long notes wait behind a tap.
  const [notesOpen, setNotesOpen] = useState(false)

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
            <BirdLandingMark size={52} color={tokens.accentInk} autoplay perched />
          </View>
        </PopIn>

        <PopIn play delay={80} style={{ gap: space.xs, alignItems: 'center' }}>
          <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption }}>{"What's new in Aviary"}</Text>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title, textAlign: 'center' }}>{release.title}</Text>
          {!!meta && <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>{meta}</Text>}
        </PopIn>

        <PopIn play delay={160} style={{ width: '100%', gap: space.sm }}>
          <View style={[styles.card, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.md, padding: space.md, gap: space.md }]}>
            {release.highlights.map((line, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
                <View style={[styles.dot, { backgroundColor: tokens.accent }]} />
                <Text style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body, lineHeight: 22 }}>{line}</Text>
              </View>
            ))}
          </View>
          {!!release.body && (notesOpen ? (
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption, lineHeight: 20, paddingHorizontal: space.xs }}>{release.body}</Text>
          ) : (
            <Button label="Read the full notes" variant="ghost" size="small" onPress={() => setNotesOpen(true)} />
          ))}
        </PopIn>
      </ScrollView>

      <View style={{ padding: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.lg }}>
        <Button label="Got it" onPress={close} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  card: { borderWidth: 1 },
})
