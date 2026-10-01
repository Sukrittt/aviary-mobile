import { View, Text, Pressable, Switch, ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { useUser, useUpdateUser } from '@/src/hooks/useUser'
import { HIDEABLE_FEATURES, isHidden, type HideableFeature } from '@/src/lib/features'

export default function FeaturesScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const user = useUser().data
  const updateUser = useUpdateUser()

  const setShown = (key: HideableFeature, shown: boolean) => {
    const hidden = (user?.hiddenFeatures ?? []).filter((k) => k !== key)
    updateUser.mutate({ hiddenFeatures: shown ? hidden : [...hidden, key] })
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Features</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            {HIDEABLE_FEATURES.map((f, i) => (
              <View key={f.key}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: tokens.border }]} />}
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{f.label}</Text>
                    <Text style={[styles.rowHint, { color: tokens.text2 }]}>{f.hint}</Text>
                  </View>
                  <Switch
                    accessibilityLabel={`Show ${f.label}`}
                    value={!isHidden(user, f.key)}
                    disabled={!user}
                    onValueChange={(v) => setShown(f.key, v)}
                    trackColor={{ false: tokens.borderStrong, true: tokens.accent }}
                    thumbColor={tokens.onAccent}
                  />
                </View>
              </View>
            ))}
          </View>
          <Text style={[styles.footnote, { color: tokens.text3 }]}>
            Turn off what you don&apos;t use. Hiding a feature keeps its data, so you can turn it back on anytime.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19 },
  scrollContent: { padding: 16, gap: 20 },
  section: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, gap: 12 },
  rowLabel: { fontSize: 14 },
  rowHint: { fontSize: 11, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  footnote: { fontSize: 11, paddingHorizontal: 4, lineHeight: 15 },
})
