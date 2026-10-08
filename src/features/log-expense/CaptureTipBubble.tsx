import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { X } from 'lucide-react-native'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { DROP_SPRING } from '@/src/components/ui/Toast'

// Lets the modal finish sliding up before the bubble pops, so the screen lands first.
const ENTER_DELAY_MS = 650
const CARET_W = 22
const CARET_H = 10
// Flares out of the card's edge and rounds off at the tip, so it reads as part of the bubble.
const CARET_PATH = 'M0 10 C5 10 7 8.5 8.8 5.6 L9.6 4.3 Q11 2 12.4 4.3 L13.2 5.6 C15 8.5 17 10 22 10 Z'

/**
 * The capture tip as a speech bubble off the header's chat icon: it pops out
 * of the icon once the screen has settled, and a soft ring pulses round the
 * icon so the two read as one thing. `anchor` is the icon's box in screen
 * coordinates.
 */
export function CaptureTipBubble({
  anchor,
  title,
  body,
  onTry,
  onDismiss,
}: {
  anchor: { top: number; left: number; size: number }
  title: string
  body: string
  onTry: () => void
  onDismiss: () => void
}) {
  const { tokens, space, radius, type } = useTheme()
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)
  const pulse = useSharedValue(0)

  useEffect(() => {
    progress.value = withDelay(ENTER_DELAY_MS, reduceMotion ? withTiming(1, { duration: 200 }) : withSpring(1, DROP_SPRING))
    if (!reduceMotion) {
      pulse.value = withDelay(ENTER_DELAY_MS, withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1))
    }
  }, [progress, pulse, reduceMotion])

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.5),
    transform: reduceMotion ? [] : [{ scale: 0.6 + progress.value * 0.4 }],
  }))
  const ringStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0 ? 0.6 * (1 - pulse.value) : 0,
    transform: [{ scale: 1 + pulse.value * 0.45 }],
  }))

  // The card sits a touch left of the icon so the caret lands on its flat top, clear of the rounded corner.
  const nudge = 4
  const caretLeft = nudge + anchor.size / 2 - CARET_W / 2
  return (
    <>
      <Reanimated.View
        pointerEvents="none"
        style={[styles.ring, ringStyle, { top: anchor.top, left: anchor.left, width: anchor.size, height: anchor.size, borderRadius: anchor.size / 2, borderColor: tokens.onAccent }]}
      />
      <Reanimated.View
        style={[
          styles.bubble,
          bubbleStyle,
          // Grows out of the icon, not the bubble's middle.
          { top: anchor.top + anchor.size + 4 + CARET_H, left: anchor.left - nudge, transformOrigin: `${nudge + anchor.size / 2}px -${CARET_H}px` },
        ]}
      >
        <View style={[styles.card, { backgroundColor: tokens.onAccent, borderRadius: radius.lg, borderTopLeftRadius: radius.sm, padding: space.md }]}>
          {/* Inside the card, so it shares the card's layer and shadow: no seam where they meet. */}
          <Svg width={CARET_W} height={CARET_H} viewBox={`0 0 ${CARET_W} ${CARET_H}`} style={[styles.caret, { left: caretLeft }]}>
            <Path d={CARET_PATH} fill={tokens.onAccent} />
          </Svg>
          <View style={[styles.head, { gap: space.sm }]}>
            <Text style={{ flex: 1, color: tokens.accent, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>{title}</Text>
            <Pressable onPress={onDismiss} hitSlop={12} accessibilityLabel="Dismiss tip">
              <X size={16} color={tokens.accent} />
            </Pressable>
          </View>
          <Text style={{ color: tokens.accent, opacity: 0.8, fontFamily: fontFamily.bodyMedium, fontSize: type.caption, marginTop: 2 }}>{body}</Text>
          <Pressable
            onPress={onTry}
            accessibilityRole="button"
            accessibilityLabel="Try logging several at once"
            style={[styles.try, { backgroundColor: tokens.accent, borderRadius: radius.full, marginTop: space.sm, paddingHorizontal: space.md }]}
          >
            <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.caption }}>Try it</Text>
          </Pressable>
        </View>
      </Reanimated.View>
    </>
  )
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 2, zIndex: 10 },
  bubble: { position: 'absolute', zIndex: 10, width: 264 },
  caret: { position: 'absolute', top: -(CARET_H - 1) },
  card: { shadowColor: '#7a2a00', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  try: { alignSelf: 'flex-start', paddingVertical: 6 },
})
