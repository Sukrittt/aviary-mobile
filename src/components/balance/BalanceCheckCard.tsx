import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Card } from '@/src/components/ui/Card'
import { useBalanceStatus } from '@/src/hooks/useBalanceCheck'
import { useBalanceCheckSnooze } from '@/src/hooks/useBalanceCheckSnooze'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import type { BalanceStatus } from '@/src/api/balanceChecks'

function prompt(status: BalanceStatus): { title: string; body: string } {
  if (!status.anchor) {
    return {
      title: 'Weekly balance check',
      body: "Type your bank balances once a week. We'll catch the spends you didn't log.",
    }
  }
  if (status.open) {
    return { title: 'Finish your balance check', body: "Your last check found money you haven't explained yet." }
  }
  return { title: 'Time for a balance check', body: 'Open GPay or your bank app and type the balance. It takes ten seconds.' }
}

/**
 * Home's slot for the weekly balance check: a prompt when one is due (Later
 * hides it for a day), otherwise a slim meter of how much the user logged
 * themselves at the last check. Nothing at all until there's something to
 * say, and never for the demo account (the server never marks it due).
 */
export function BalanceCheckCard() {
  const { tokens, space, type, radius } = useTheme()
  const router = useRouter()
  const status = useBalanceStatus().data
  const [snoozed, snooze] = useBalanceCheckSnooze()

  if (!status || snoozed === null) return null
  const open = () => router.push('/modals/balance-check')

  if (status.due && !snoozed) {
    const { title, body } = prompt(status)
    return (
      <Card elevated={false} style={{ gap: space.sm }}>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>{title}</Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{body}</Text>
        <View style={[styles.actions, { gap: space.lg, marginTop: space.xs }]}>
          <Pressable
            accessibilityRole="button"
            onPress={open}
            style={[styles.primary, { backgroundColor: tokens.accent, borderRadius: radius.full, paddingHorizontal: space.lg }]}
          >
            <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.caption }}>Check now</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={snooze} hitSlop={8}>
            <Text style={{ color: tokens.accent, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>Later</Text>
          </Pressable>
        </View>
      </Card>
    )
  }

  if (status.loggedPct === null) return null
  const pct = Math.max(0, Math.min(100, status.loggedPct))
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pct}% logged at your last check`}
      accessibilityHint="Check your balance again"
      onPress={open}
      style={[styles.meter, { gap: space.xs, paddingHorizontal: space.xs }]}
    >
      <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>
        {pct}% logged at your last check
      </Text>
      <View style={[styles.track, { backgroundColor: tokens.border, borderRadius: radius.full }]}>
        <View
          testID="logged-meter-fill"
          style={[styles.fill, { width: `${pct}%`, backgroundColor: pct >= 90 ? tokens.mint : tokens.accent, borderRadius: radius.full }]}
        />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center' },
  primary: { paddingVertical: 8 },
  meter: {},
  track: { height: 4, overflow: 'hidden' },
  fill: { height: 4 },
})
