import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { LoadingPhrase } from '@/src/components/shared/LoadingPhrase'
import { listChangelog } from '@/src/api/changelog'

const LOADING_PHRASES = ['Digging up the release notes…', 'Flipping back through updates…']

export default function ChangelogScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { data: releases, isLoading, isError } = useQuery({ queryKey: ['changelog', 'mobile', 'all'], queryFn: listChangelog })

  const note = isError
    ? "Couldn't load the changelog. Check your connection and try again."
    : releases?.length === 0
      ? "Updates show up here once they're out."
      : null

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Changelog</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        {isLoading && <LoadingPhrase phrases={LOADING_PHRASES} color={tokens.text2} style={{ fontFamily: fontFamily.bodyMedium, textAlign: 'center' }} />}
        {note && <Text style={[styles.note, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{note}</Text>}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19 },
  scrollContent: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  meta: { fontSize: 12 },
  title: { fontSize: 17 },
  highlight: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  line: { flex: 1, fontSize: 14, lineHeight: 20 },
  body: { fontSize: 13, lineHeight: 19 },
  note: { fontSize: 13, textAlign: 'center', marginTop: 24 },
})
