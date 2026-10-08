import { useEffect } from 'react'
import { AppState, Pressable, StyleSheet, Text } from 'react-native'
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { WifiOff } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'
import { useOnline } from '@/src/lib/netStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { DROP_SPRING, dropInStyle } from '@/src/components/ui/Toast'

const RETRY_MS = 15_000

/**
 * Screens keep showing their saved data while offline; this pill is what says
 * so. It's also the way back: only an answered request flips the app online
 * (see netStatus), so while it's up it retries the visible screen's queries on
 * tap, every 15s, and on every return to the foreground.
 */
export function OfflineBanner() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const online = useOnline()
  const qc = useQueryClient()

  useEffect(() => {
    if (online) return
    const retry = () => void qc.refetchQueries({ type: 'active' })
    const timer = setInterval(retry, RETRY_MS)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') retry()
    })
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [online, qc])

  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)
  useEffect(() => {
    if (online) progress.value = withTiming(0, { duration: 220 })
    else progress.value = reduceMotion ? withTiming(1, { duration: 160 }) : withSpring(1, DROP_SPRING)
  }, [online, reduceMotion, progress])
  const animStyle = useAnimatedStyle(() => dropInStyle(progress.value, 1, 0, reduceMotion))

  return (
    <Reanimated.View pointerEvents={online ? 'none' : 'box-none'} style={[styles.wrap, { top: insets.top + 8 }, animStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="You're offline. Tap to retry."
        accessibilityElementsHidden={online}
        importantForAccessibility={online ? 'no-hide-descendants' : 'yes'}
        onPress={() => void qc.refetchQueries({ type: 'active' })}
        style={[styles.pill, { backgroundColor: tokens.cardSolid, borderColor: tokens.border }]}
      >
        <WifiOff size={14} color={tokens.text3} />
        <Text style={[styles.text, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>You&apos;re offline · Tap to retry</Text>
      </Pressable>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { fontSize: 12 },
})
