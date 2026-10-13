import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native'
import { posthog } from '@/src/lib/analytics'
import { darkTokens, lightTokens } from '@/src/theme/tokens'
import { fontFamily } from '@/src/theme/fonts'

/**
 * The root ErrorBoundary's screen. It renders in place of the whole root
 * layout, so ThemeProvider and friends are gone: tokens come straight from the
 * system scheme and nothing here may call useTheme. The error itself goes to
 * PostHog, never to the screen.
 */
export function CrashScreen({ error, retry }: { error: Error; retry: () => void }) {
  const tokens = useColorScheme() === 'dark' ? darkTokens : lightTokens

  useEffect(() => {
    try {
      posthog.captureException(error)
    } catch {
      // Reporting must not crash the crash screen.
    }
  }, [error])

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.text }]}>Something went wrong</Text>
      <Text style={[styles.body, { color: tokens.text2 }]}>Our bird hit a branch. Give it another go.</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={[styles.button, { backgroundColor: tokens.accentInk }]}>
        <Text style={[styles.label, { color: tokens.onAccent }]}>Try again</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontFamily: fontFamily.displaySemiBold, fontSize: 24, textAlign: 'center' },
  body: { fontFamily: fontFamily.bodyMedium, fontSize: 16, textAlign: 'center' },
  button: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999 },
  label: { fontFamily: fontFamily.bodyBold, fontSize: 16 },
})
