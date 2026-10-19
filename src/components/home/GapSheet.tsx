import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useIsFocused, useRouter } from 'expo-router'
import { ArrowClockwise, ChatText, UploadSimple } from '@/src/components/shared/icons'
import { BottomSheet } from '@/src/components/shared/Modal'
import { Icon } from '@/src/components/shared/Icon'
import { useDismissedRolloverBanner } from '@/src/hooks/useDismissedRolloverBanner'
import { useUser } from '@/src/hooks/useUser'
import { gapToFill } from '@/src/features/fill-gap/gap'
import { isHidden } from '@/src/lib/features'
import { todayLocal } from '@/src/lib/date'
import { formatDateShort } from '@/src/lib/format'
import { track } from '@/src/lib/analytics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/**
 * Home's "Pick up where you left off": when the last expense is two or more
 * days old, three calm ways to catch up. Once per gap: any answer, Not now
 * or a swipe away is remembered against the last expense's date, so it only
 * comes back after something newer is logged and another gap opens.
 */
export function GapSheet({ lastSpent }: { lastSpent: Record<string, string> | undefined }) {
  const since = lastSpent ? gapToFill(lastSpent, todayLocal(), null) : null
  const [seen, setSeen] = useDismissedRolloverBanner(`gap-${since ?? 'none'}`)
  if (!since || seen !== false) return null
  return <OpenGapSheet since={since} onSeen={() => setSeen(true)} />
}

/**
 * Mounted only while there's a gap to offer, so its focus hook (it waits
 * while another screen is on top of Home) never re-renders Home's tree on an
 * ordinary tab switch.
 */
function OpenGapSheet({ since, onSeen }: { since: string; onSeen: () => void }) {
  const focused = useIsFocused()
  const { tokens, space, radius, type } = useTheme()
  const router = useRouter()
  const user = useUser().data

  function choose(option: string, go?: () => void) {
    track('gap_sheet_choice', { option })
    onSeen()
    go?.()
  }

  // Ask Aviary off means no chat to type into: log-expense is the way to type them then.
  const typeHref = user && !isHidden(user, 'askAviary') ? ({ pathname: '/modals/money-brain', params: { capture: '1' } } as const) : '/modals/log-expense'
  const options = [
    { key: 'type', icon: ChatText, label: 'Type what you spent', hint: 'List them in one go: auto 240, lunch 150', go: () => router.push(typeHref) },
    { key: 'upload', icon: UploadSimple, label: 'Upload a statement or screenshot', hint: 'Your UPI or bank app has the details', go: () => router.push('/modals/statement') },
    { key: 'fresh', icon: ArrowClockwise, label: 'Start fresh', hint: 'One rough total, then carry on from today', go: () => router.push({ pathname: '/modals/fresh-start', params: { since } }) },
  ]

  return (
    <BottomSheet visible={focused} onClose={() => choose('dismiss')}>
      <View style={{ gap: space.xs, marginBottom: space.md }}>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>Pick up where you left off</Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>
          {`Your last expense was on ${formatDateShort(since)}. Catch up whichever way is easiest.`}
        </Text>
      </View>
      <View style={{ gap: space.sm }}>
        {options.map((o) => (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            onPress={() => choose(o.key, o.go)}
            style={[styles.option, { gap: space.md, padding: space.md, backgroundColor: tokens.inputBg, borderRadius: radius.lg }]}
          >
            <Icon icon={o.icon} size={20} color={tokens.accentInk} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{o.label}</Text>
              <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{o.hint}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => choose('later')} style={[styles.later, { marginTop: space.sm }]}>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>Not now</Text>
      </Pressable>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center' },
  later: { alignItems: 'center', paddingVertical: 10 },
})
