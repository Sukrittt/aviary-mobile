import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CloudWarning } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Button } from '@/src/components/ui/Button'

/**
 * One gate for a screen whose data failed to load (query error, not offline —
 * see OfflineScreen for that case). Replaces a bare line of coral text with a
 * real screen: icon, message, and a way out that doesn't require reopening
 * the app.
 */
export function ErrorScreen({
  title = "Couldn't load this",
  message = 'Check your connection and try again.',
  onRetry,
}: {
  title?: string
  message?: string
  onRetry: () => void
}) {
  const { tokens, space, radius } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top + 24, gap: space.md }]}>
      <View style={[styles.iconBadge, { backgroundColor: tokens.chipActiveBg, borderRadius: radius.full }]}>
        <CloudWarning size={26} color={tokens.text3} />
      </View>
      <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{message}</Text>
      <Button label="Try again" onPress={onRetry} style={{ backgroundColor: tokens.accent, marginTop: space.sm }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconBadge: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22 },
  subtitle: { fontSize: 13, textAlign: 'center', maxWidth: 240 },
})
