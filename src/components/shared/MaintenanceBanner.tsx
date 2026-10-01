import { useEffect, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text } from 'react-native'
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { TriangleAlert, X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { getSystemStatus } from '@/src/api/systemStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { DROP_SPRING, dropInStyle } from '@/src/components/ui/Toast'

/**
 * The maintenance notice set from the web admin's System page. Polled every
 * 5 minutes and on every return to the foreground. A floating pill under the
 * status bar, matching the web banner, that drops in and out with the
 * log-expense Toast's animation. Tapping it hides the current message until a
 * different one is set. Any failure renders nothing.
 */
export function MaintenanceBanner() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const { data, refetch } = useQuery({ queryKey: ['system-status'], queryFn: getSystemStatus, refetchInterval: 5 * 60_000, retry: false })

  // React Query's refetch-on-focus is web-only; the app's equivalent is coming back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch()
    })
    return () => sub.remove()
  }, [refetch])

  const message = data?.maintenance?.on ? data.maintenance.message : ''
  const visible = !!message && message !== dismissed
  // Last non-empty copy, so the exit animation doesn't shrink an empty pill.
  const [text, setText] = useState(message)
  if (message && message !== text) setText(message)

  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)
  useEffect(() => {
    if (!visible) progress.value = withTiming(0, { duration: 220 })
    else progress.value = reduceMotion ? withTiming(1, { duration: 160 }) : withSpring(1, DROP_SPRING)
  }, [visible, reduceMotion, progress])
  const animStyle = useAnimatedStyle(() => dropInStyle(progress.value, 1, 0, reduceMotion))

  if (!text) return null

  return (
    <Reanimated.View pointerEvents={visible ? 'box-none' : 'none'} style={[styles.wrap, { top: insets.top + 8 }, animStyle]}>
      <Pressable
        accessibilityRole="alert"
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
        onPress={() => setDismissed(text)}
        style={[styles.pill, { backgroundColor: tokens.cardSolid, borderColor: tokens.warn }]}
      >
        <TriangleAlert size={16} color={tokens.warn} />
        <Text style={[styles.text, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{text}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={8}
          onPress={() => setDismissed(text)}
          style={[styles.close, { backgroundColor: tokens.warnSoft }]}
        >
          <X size={14} color={tokens.text} />
        </Pressable>
      </Pressable>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  text: { flexShrink: 1, fontSize: 13 },
  close: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
})
