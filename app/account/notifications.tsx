import { useEffect, useState } from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { Toggle } from '@/src/components/ui/Toggle'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { useOnline } from '@/src/lib/netStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { useUser, useUpdateUser } from '@/src/hooks/useUser'
import { useRefresh } from '@/src/hooks/useRefresh'
import type { UserProfile } from '@/src/api/account'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { habitNudgesEnabled, setHabitNudgesEnabled } from '@/src/lib/habitNudges'

const CADENCE_OPTIONS: { value: NonNullable<UserProfile['notifyCadence']>; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
]

const LEAD_DAY_OPTIONS = [1, 3, 7] as const

export default function NotificationsScreen() {
  const { tokens } = useTheme()
  const online = useOnline()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { refreshing, onRefresh } = useRefresh()

  const userQuery = useUser()
  const updateUser = useUpdateUser()
  const user = userQuery.data

  const cadence = user?.notifyCadence ?? 'off'
  const thresholds = user?.notifyThresholds ?? true
  const bills = user?.notifyBills ?? true
  const billLeadDays = user?.notifyBillLeadDays ?? 3
  const coach = user?.notifyCoach ?? true
  const wrapped = user?.notifyWrapped ?? true

  // Device-local, unlike the switches above: habit nudges are scheduled on this phone.
  const recent = useRecentExpenses()
  const [habits, setHabits] = useState(true)
  useEffect(() => { habitNudgesEnabled().then(setHabits) }, [])
  const toggleHabits = (v: boolean) => {
    setHabits(v)
    void setHabitNudgesEnabled(v, recent.data ?? [])
  }

  if (!online) return <OfflineScreen />

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Notifications</Text>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />
        }
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>CADENCE</Text>
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Digest</Text>
                <Text style={[styles.rowHint, { color: tokens.text2 }]}>A summary of this month&apos;s spending</Text>
              </View>
              <View style={[styles.segmented, { backgroundColor: tokens.inputBg }]}>
                {CADENCE_OPTIONS.map((opt) => {
                  const active = cadence === opt.value
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => updateUser.mutate({ notifyCadence: opt.value })}
                      style={[styles.segment, { backgroundColor: active ? tokens.accent : 'transparent' }]}
                    >
                      <Text style={[styles.segmentText, { color: active ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          </View>
          {cadence === 'off' && (
            <Text style={[styles.footnote, { color: tokens.text3 }]}>
              Off also turns off bill reminders and the coaching nudge below. Category limit alerts have their own switch.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>CATEGORY ALERTS</Text>
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Category limit alerts</Text>
                <Text style={[styles.rowHint, { color: tokens.text2 }]}>Alerts the instant a threshold is crossed</Text>
              </View>
              <Toggle
                value={thresholds}
                onValueChange={(v) => updateUser.mutate({ notifyThresholds: v })}
              />
            </View>
          </View>
          <Text style={[styles.footnote, { color: tokens.text3 }]}>
            Set thresholds per category in Envelopes.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>HABITS</Text>
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Log it reminders</Text>
                <Text style={[styles.rowHint, { color: tokens.text2 }]}>Reminders when you usually spend</Text>
              </View>
              <Toggle
                value={habits}
                onValueChange={toggleHabits}
              />
            </View>
          </View>
          <Text style={[styles.footnote, { color: tokens.text3 }]}>
            Learned from your last 8 weeks. Ignore one a few times and it backs off.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>BILLS</Text>
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Remind before renewal</Text>
                <Text style={[styles.rowHint, { color: tokens.text2 }]}>Subscriptions due soon</Text>
              </View>
              <Toggle
                value={bills}
                onValueChange={(v) => updateUser.mutate({ notifyBills: v })}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: tokens.border }]} />
            <View style={[styles.row, { opacity: bills ? 1 : 0.5 }]}>
              <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Lead time</Text>
              <View style={[styles.segmented, { backgroundColor: tokens.inputBg }]}>
                {LEAD_DAY_OPTIONS.map((days) => {
                  const active = billLeadDays === days
                  return (
                    <Pressable
                      key={days}
                      disabled={!bills}
                      onPress={() => updateUser.mutate({ notifyBillLeadDays: days })}
                      style={[styles.segment, { backgroundColor: active ? tokens.accent : 'transparent' }]}
                    >
                      <Text style={[styles.segmentText, { color: active ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
                        {days}d
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>COACHING</Text>
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Smart nudge</Text>
                <Text style={[styles.rowHint, { color: tokens.text2 }]}>Tips when spending trends high</Text>
              </View>
              <Toggle
                value={coach}
                onValueChange={(v) => updateUser.mutate({ notifyCoach: v })}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>WRAPPED</Text>
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>New edition unlocked</Text>
                <Text style={[styles.rowHint, { color: tokens.text2 }]}>A ping when last month&apos;s Wrapped is ready</Text>
              </View>
              <Toggle
                value={wrapped}
                onValueChange={(v) => updateUser.mutate({ notifyWrapped: v })}
              />
            </View>
          </View>
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
  sectionLabel: { fontSize: 11, letterSpacing: 0.5, paddingHorizontal: 4 },
  card: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, gap: 12 },
  rowLabel: { fontSize: 14 },
  rowHint: { fontSize: 11, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  segmented: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 100 },
  segment: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 8 },
  segmentText: { fontSize: 11 },
  footnote: { fontSize: 11, paddingHorizontal: 4, lineHeight: 15 },
})
