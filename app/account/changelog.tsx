import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { ScreenHeader } from '@/src/components/shared/ScreenHeader'
import { LoadingPhrase } from '@/src/components/shared/LoadingPhrase'
import { listChangelog } from '@/src/api/changelog'

const LOADING_PHRASES = ['Digging up the release notes…', 'Flipping back through updates…']

export default function ChangelogScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { data: releases, isLoading, isError, isRefetching, refetch } = useQuery({ queryKey: ['changelog', 'mobile', 'all'], queryFn: listChangelog })

  const note = isError
    ? "Couldn't load the changelog. Check your connection and try again."
    : releases?.length === 0
      ? "Updates show up here once they're out."
      : null

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScreenHeader title="Changelog" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        {isLoading && <LoadingPhrase phrases={LOADING_PHRASES} color={tokens.text2} style={{ fontFamily: fontFamily.bodyMedium, textAlign: 'center' }} />}
        {note && <Text style={[styles.note, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{note}</Text>}
        {isError && (
          <Pressable accessibilityRole="button" disabled={isRefetching} onPress={() => void refetch()} hitSlop={8} style={[styles.retry, { backgroundColor: tokens.accentSoft }]}>
            <Text style={[styles.retryText, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}>{isRefetching ? 'Trying…' : 'Try again'}</Text>
          </Pressable>
        )}
        {releases?.map((release) => {
          const date = release.publishedAt
            ? new Date(release.publishedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
            : ''
          const meta = [release.version, date].filter(Boolean).join(' · ')
          return (
            <View key={release.id} style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              {!!meta && <Text style={[styles.meta, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{meta}</Text>}
              <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{release.title}</Text>
              {release.highlights.map((line, i) => (
                <View key={i} style={styles.highlight}>
                  <View style={[styles.dot, { backgroundColor: tokens.accent }]} />
                  <Text style={[styles.line, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>{line}</Text>
                </View>
              ))}
              {!!release.body && <Text style={[styles.body, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{release.body}</Text>}
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  meta: { fontSize: 12 },
  title: { fontSize: 17 },
  highlight: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  line: { flex: 1, fontSize: 14, lineHeight: 20 },
  body: { fontSize: 13, lineHeight: 19 },
  note: { fontSize: 13, textAlign: 'center', marginTop: 24 },
  retry: { alignSelf: 'center', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { fontSize: 13 },
})
