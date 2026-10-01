import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Sparkles, Wrench } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { nextAllowanceReset } from '@/src/lib/aiAllowance'
import { Button } from '@/src/components/ui/Button'

interface Props {
  title?: string
  message?: string
  icon?: typeof Wrench
}

/** Shown in place of an AI screen while the admin's AI kill switch is on, or the month's allowance is spent. */
export function AiUnavailableScreen({
  title = 'Under maintenance',
  message = 'This feature is temporarily unavailable. Please come back after some time.',
  icon: IconComp = Wrench,
}: Props) {
  const { tokens, space, radius } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top + 24, gap: space.md }]}>
      <View style={[styles.iconBadge, { backgroundColor: tokens.chipActiveBg, borderRadius: radius.full }]}>
        <IconComp size={26} color={tokens.text3} />
      </View>
      <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
        {message}
      </Text>
      <Button
        label="Go back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ backgroundColor: tokens.accent, marginTop: space.sm }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconBadge: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22 },
  subtitle: { fontSize: 13, textAlign: 'center', maxWidth: 260 },
})

/** The month's AI allowance is spent. Used inline by Ask Aviary and as the modal the root layout opens when a chat or bill scan is refused. */
export function AiAllowanceScreen() {
  const resetsOn = nextAllowanceReset().toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  return (
    <AiUnavailableScreen
      icon={Sparkles}
      title="AI allowance reached"
      message={`You've used this month's AI allowance. Ask Aviary and bill scanning are back on ${resetsOn}. Everything else works as normal.`}
    />
  )
}
