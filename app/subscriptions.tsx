import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Plus, Search } from 'lucide-react-native'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { useOnline } from '@/src/lib/netStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { useSubscriptions } from '@/src/hooks/useSubscriptions'
import { useRefresh } from '@/src/hooks/useRefresh'
import { SubscriptionsPanel } from '@/src/components/subscriptions/SubscriptionsPanel'

export default function SubscriptionsScreen() {
  const { tokens } = useTheme()
  const online = useOnline()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { refreshing, onRefresh } = useRefresh()
  const { data: subscriptions = [], isLoading } = useSubscriptions()

  if (!online) return <OfflineScreen />

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Subscriptions</Text>
        <Pressable
          onPress={() => router.push('/modals/subscription')}
          style={[styles.addButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}
          accessibilityRole="button"
          accessibilityLabel="Add subscription"
        >
          <Icon icon={Plus} size={16} color={tokens.text} />
          <Text style={[styles.addText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Add</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />}
      >
        <Pressable
          onPress={() => router.push({ pathname: '/account/recurring-suggestions', params: { kind: 'subscription' } })}
          style={[styles.findButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}
          accessibilityRole="button"
          accessibilityLabel="Find subscriptions"
          accessibilityHint="Scan past expenses for services you already pay for"
        >
          <Icon icon={Search} size={17} color={tokens.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.findTitle, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Find subscriptions</Text>
            <Text style={[styles.findBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>Scan past expenses for services you already pay for</Text>
          </View>
        </Pressable>
        <SubscriptionsPanel subscriptions={subscriptions} loading={isLoading} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 19 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  addText: { fontSize: 12.5 },
  body: { padding: 16, gap: 14 },
  findButton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  findTitle: { fontSize: 14 },
  findBody: { fontSize: 12, lineHeight: 16, marginTop: 2 },
})
