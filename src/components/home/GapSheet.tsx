import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useIsFocused, useRouter } from 'expo-router'
import { ArrowClockwise, CaretRight, ChatText, UploadSimple } from '@/src/components/shared/icons'
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
 * days old, three calm ways to catch up, upload first. Once per gap: any answer, Not now
 * or a swipe away is remembered against the last expense's date, so it only
 * comes back after something newer is logged and another gap opens.
 * The one exception is going back: leave an option without logging anything
 * (back gesture or its close) and the sheet is here again to pick another.
 */
export function GapSheet({ lastSpent }: { lastSpent: Record<string, string> | undefined }) {
  const since = lastSpent ? gapToFill(lastSpent, todayLocal(), null) : null
  const [seen, setSeen] = useDismissedRolloverBanner(`gap-${since ?? 'none'}`)
  // The gap an option was opened for. Once anything's logged the gap moves on and this stops matching.
  const [picked, setPicked] = useState<string | null>(null)
  if (!since || (seen !== false && picked !== since)) return null
  return (
    <OpenGapSheet
      since={since}
      onSeen={(option) => {
        setSeen(true)
        setPicked(option === 'later' || option === 'dismiss' ? null : since)
      }}
    />
  )
}

/**
 * Mounted only while there's a gap to offer, so its focus hook (it waits
 * while another screen is on top of Home) never re-renders Home's tree on an
 * ordinary tab switch.
 */
function OpenGapSheet({ since, onSeen }: { since: string; onSeen: (option: string) => void }) {
  const focused = useIsFocused()
  const { tokens, space, radius, type } = useTheme()
  const router = useRouter()
  const user = useUser().data

  function choose(option: string, go?: () => void) {
    track('gap_sheet_choice', { option })
    onSeen(option)
    go?.()
  }

  // Ask Aviary off means no chat to type into: log-expense is the way to type them then.
  const capture = Boolean(user && !isHidden(user, 'askAviary'))
  const typeHref = capture ? ({ pathname: '/modals/money-brain', params: { capture: '1' } } as const) : '/modals/log-expense'
  // Upload leads: the reason people can't catch up is not remembering, and their UPI app does.
  const others = [
    { key: 'type' as const, icon: ChatText, label: 'Type what you remember', hint: capture ? 'One line, several spends. Aviary sorts them.' : 'Add what you remember, one at a time.', go: () => router.push(typeHref) },
    { key: 'fresh' as const, icon: ArrowClockwise, label: 'Start fresh', hint: 'One rough total, then carry on from today.', go: () => router.push({ pathname: '/modals/fresh-start', params: { since } }) },
  ]
  const label = { color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }
  const hint = { color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption, marginTop: 2 }

  return (
    <BottomSheet visible={focused} onClose={() => choose('dismiss')}>
      <View style={{ gap: space.xs, marginBottom: space.lg }}>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>Pick up where you left off</Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption, lineHeight: 19 }}>
          {`Last logged on ${formatDateShort(since)}. Catching up takes about a minute, and nothing lands until you've checked it.`}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => choose('upload', () => router.push('/modals/statement'))}
        style={[styles.hero, { padding: space.lg, backgroundColor: tokens.modalBg, borderColor: tokens.borderStrong, borderRadius: radius.lg }]}
      >
        <View style={[styles.option, { gap: space.md }]}>
          {/* App tones, not the landing's pastels: accent for the option that leads, neutral for the rest. */}
          <View style={[styles.tile, { width: 48, height: 48, borderRadius: radius.md, backgroundColor: tokens.accentSoft }]}>
            <Icon icon={UploadSimple} size={24} color={tokens.accentInk} />
          </View>
          <View style={{ flex: 1 }}>
            {/* Over the title, not pinned to the corner: a corner badge sat on top of the title once it ran wide. */}
            <View style={[styles.chip, { backgroundColor: tokens.mintSoft }]}>
              <Text style={{ color: tokens.mint, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>Easiest</Text>
            </View>
            <Text style={[label, { fontSize: type.bodyLg }]}>Upload a screenshot or statement</Text>
            <Text style={hint}>Your UPI or bank app remembers what you don&apos;t.</Text>
          </View>
        </View>
        <View style={[styles.steps, { marginTop: space.md, paddingTop: space.md, borderTopColor: tokens.borderStrong }]}>
          {['Share it', 'Aviary reads it', "You tick what's right"].map((step, i) => (
            <View key={step} style={styles.step}>
              {i > 0 && <Text style={{ color: tokens.borderStrong, fontSize: type.caption }}>›</Text>}
              <View style={[styles.stepNo, { backgroundColor: tokens.inputBg }]}>
                <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 14 }}>{i + 1}</Text>
              </View>
              <Text style={{ color: i === 0 ? tokens.text : tokens.text2, fontFamily: i === 0 ? fontFamily.bodySemiBold : fontFamily.bodyMedium, fontSize: type.micro }}>{step}</Text>
            </View>
          ))}
        </View>
      </Pressable>

      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {others.map((o) => (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            onPress={() => choose(o.key, o.go)}
            style={[styles.option, { gap: space.md, padding: space.md, backgroundColor: tokens.inputBg, borderRadius: radius.lg }]}
          >
            <View style={[styles.tile, { width: 36, height: 36, borderRadius: 11, backgroundColor: tokens.modalBg }]}>
              <Icon icon={o.icon} size={18} color={tokens.text2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={label}>{o.label}</Text>
              <Text style={hint}>{o.hint}</Text>
            </View>
            <Icon icon={CaretRight} size={16} color={tokens.text3} />
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
  hero: { borderWidth: 1.5 },
  chip: { alignSelf: 'flex-start', marginBottom: 6, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  step: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stepNo: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  later: { alignItems: 'center', paddingVertical: 10 },
})
