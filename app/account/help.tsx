import { useState } from 'react'
import { View, Text, Pressable, ScrollView, Linking, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, BookOpen, Compass, MessageCircle, Star, ChevronRight, ChevronUp } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'

const REPO = 'Sukrittt/aviary-mobile'
const FEEDBACK_BOARD_URL = 'https://aviary.userjot.com'

const ENVELOPES_EXPLAINER = [
  'New money lands in Ready to Assign, unclaimed.',
  'Move it into envelopes like Rent, Food or Football.',
  'Log an expense against an envelope and only that envelope drops.',
  "Next month starts clean: the leftover is gone, but your plan carries over so you're not budgeting from zero.",
  'Watch one number: Ready to Assign. At zero, all your money has a job.',
]

export default function HelpScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [explainerOpen, setExplainerOpen] = useState(false)

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Help & feedback</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Pressable onPress={() => setExplainerOpen((v) => !v)} style={styles.row}>
            <Icon icon={BookOpen} size={16} />
            <Text style={[styles.rowLabel, { flex: 1, marginLeft: 12, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
              How envelopes work
            </Text>
            <Icon icon={explainerOpen ? ChevronUp : ChevronRight} size={16} color={tokens.text3} />
          </Pressable>
          {explainerOpen && (
            <View style={styles.explainerList}>
              {ENVELOPES_EXPLAINER.map((line) => (
                <Text key={line} style={[styles.explainer, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                  {'•  '}{line}
                </Text>
              ))}
            </View>
          )}
          <View style={[styles.divider, { backgroundColor: tokens.border }]} />
          <Pressable onPress={() => router.push('/account/guided-tour')} style={styles.row}>
            <Icon icon={Compass} size={16} />
            <Text style={[styles.rowLabel, { flex: 1, marginLeft: 12, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
              Take the guided tour
            </Text>
            <Icon icon={ChevronRight} size={16} color={tokens.text3} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: tokens.border }]} />
          <Pressable onPress={() => Linking.openURL(FEEDBACK_BOARD_URL)} style={styles.row}>
            <Icon icon={MessageCircle} size={16} />
            <Text style={[styles.rowLabel, { flex: 1, marginLeft: 12, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
              Feedback board
            </Text>
            <Icon icon={ChevronRight} size={16} color={tokens.text3} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: tokens.border }]} />
          <Pressable onPress={() => Linking.openURL(`https://github.com/${REPO}`)} style={styles.row}>
            <Icon icon={Star} size={16} />
            <Text style={[styles.rowLabel, { flex: 1, marginLeft: 12, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
              Star the repo
            </Text>
            <Icon icon={ChevronRight} size={16} color={tokens.text3} />
          </Pressable>
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
  scrollContent: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 14 },
  divider: { height: StyleSheet.hairlineWidth },
  explainerList: { paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
  explainer: { fontSize: 13, lineHeight: 18 },
})
