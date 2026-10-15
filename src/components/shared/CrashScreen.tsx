import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { posthog } from '@/src/lib/analytics'
import { ThemeProvider, useTheme } from '@/src/theme/ThemeProvider'
import { EmptyState } from './EmptyState'
import { Button } from '@/src/components/ui/Button'

/**
 * The root ErrorBoundary's screen. It renders in place of the whole root
 * layout, so the providers are gone; it brings its own ThemeProvider, which
 * reads the saved appearance, so a Light pick on a dark phone stays light here
 * too. The error itself goes to PostHog, never to the screen.
 */
export function CrashScreen({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    try {
      posthog.captureException(error)
    } catch {
      // Reporting must not crash the crash screen.
    }
  }, [error])

  return (
    <ThemeProvider>
      <CrashBody retry={retry} />
    </ThemeProvider>
  )
}

function CrashBody({ retry }: { retry: () => void }) {
  const { tokens } = useTheme()
  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <EmptyState mood="searching" title="Something went wrong" description="Our bird hit a branch. Give it another go." />
      <Button label="Try again" onPress={retry} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
})
