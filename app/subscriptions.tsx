import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Plus, MagnifyingGlass } from '@/src/components/shared/icons'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { useOnline } from '@/src/lib/netStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { HeaderButton, ScreenHeader } from '@/src/components/shared/ScreenHeader'
import { useSubscriptions } from '@/src/hooks/useSubscriptions'
import { useRefresh } from '@/src/hooks/useRefresh'
import { SubscriptionsPanel } from '@/src/components/subscriptions/SubscriptionsPanel'
import { useReadOnly } from '@/src/components/budgets/ReadOnlyNotice'
import { ReadOnlyBanner } from '@/src/components/budgets/ReadOnlyBanner'

export default function SubscriptionsScreen() {
  const { tokens } = useTheme()
  const online = useOnline()
  const router = useRouter()
  const { refreshing, onRefresh } = useRefresh()
  const { data: subscriptions = [], isLoading } = useSubscriptions()
  const { readOnly } = useReadOnly()

  if (!online) return <OfflineScreen />

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScreenHeader
        onBack={() => router.back()}
        title="Subscriptions"
        right={readOnly ? null : <HeaderButton label="Add" icon={Plus} accessibilityLabel="Add subscription" onPress={() => router.push('/modals/subscription')} />}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />}
      >
        <ReadOnlyBanner />
        {!readOnly && (
        <Pressable
          onPress={() => router.push({ pathname: '/account/recurring-suggestions', params: { kind: 'subscription' } })}
          style={[styles.findButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}
          accessibilityRole="button"
          accessibilityLabel="Find subscriptions"
          accessibilityHint="Scan past expenses for services you already pay for"
        >
          <Icon icon={MagnifyingGlass} size={17} color={tokens.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.findTitle, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Find subscriptions</Text>
            <Text style={[styles.findBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>Scan past expenses for services you already pay for</Text>
          </View>
        </Pressable>
        )}
        <SubscriptionsPanel subscriptions={subscriptions} loading={isLoading} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 16, gap: 14 },
  findButton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  findTitle: { fontSize: 14 },
  findBody: { fontSize: 12, lineHeight: 16, marginTop: 2 },
})
