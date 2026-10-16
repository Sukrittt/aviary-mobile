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
import { X } from '@/src/components/shared/icons'
import Svg, { Path } from 'react-native-svg'
import { tap } from '@/src/lib/haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { DROP_SPRING } from '@/src/components/ui/Toast'

// Lets the modal finish sliding up before the bubble pops, so the screen lands first.
const ENTER_DELAY_MS = 650
const CARET_W = 22
const CARET_H = 10
const BUBBLE_W = 264
// Flares out of the card's edge and rounds off at the tip, so it reads as part of the bubble.
const CARET_PATH = 'M0 10 C5 10 7 8.5 8.8 5.6 L9.6 4.3 Q11 2 12.4 4.3 L13.2 5.6 C15 8.5 17 10 22 10 Z'

/**
 * The capture tip as a speech bubble off the header's chat icon: it pops out
 * of the icon once the screen has settled, and a soft ring pulses round the
 * icon so the two read as one thing. `anchor` is the icon's box in screen
 * coordinates; give `right` instead of `left` for an icon at the screen's
 * right edge and the bubble hangs off to the left of it.
 */
export function CaptureTipBubble({
  anchor,
  title,
  body,
  tryLabel = 'Try logging several at once',
  ringColor,
  onTry,
  onDismiss,
}: {
  anchor: { top: number; size: number } & ({ left: number } | { right: number })
  title: string
  body: string
  /** Screen reader label for the card, which runs the tip's action. */
  tryLabel?: string
  /** The pulse round the icon. Defaults to the colour that reads on the orange log header. */
  ringColor?: string
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
  const caretInset = nudge + anchor.size / 2 - CARET_W / 2
  const originX = nudge + anchor.size / 2
  const fromRight = 'right' in anchor
  const iconX = fromRight ? { right: anchor.right } : { left: anchor.left }
  return (
    <>
      <Reanimated.View
        pointerEvents="none"
        style={[styles.ring, ringStyle, iconX, { top: anchor.top, width: anchor.size, height: anchor.size, borderRadius: anchor.size / 2, borderColor: ringColor ?? tokens.onAccent }]}
      />
      <Reanimated.View
        style={[
          styles.bubble,
          bubbleStyle,
          fromRight
            ? { right: anchor.right - nudge, transformOrigin: `${BUBBLE_W - originX}px -${CARET_H}px` }
            : { left: anchor.left - nudge, transformOrigin: `${originX}px -${CARET_H}px` },
          // Grows out of the icon, not the bubble's middle.
          { top: anchor.top + anchor.size + 4 + CARET_H },
        ]}
      >
        {/* The whole card opens the tip; only the X dismisses it. */}
        <Pressable
          onPress={() => {
            tap()
            onTry()
          }}
          accessibilityRole="button"
          accessibilityLabel={tryLabel}
          style={[styles.card, { backgroundColor: tokens.onAccent, borderRadius: radius.lg, padding: space.md }, fromRight ? { borderTopRightRadius: radius.sm } : { borderTopLeftRadius: radius.sm }]}
        >
          {/* Inside the card, so it shares the card's layer and shadow: no seam where they meet. */}
          <Svg width={CARET_W} height={CARET_H} viewBox={`0 0 ${CARET_W} ${CARET_H}`} style={[styles.caret, fromRight ? { right: caretInset } : { left: caretInset }]}>
            <Path d={CARET_PATH} fill={tokens.onAccent} />
          </Svg>
          <View style={[styles.head, { gap: space.sm }]}>
            {/* Ink title over muted body: orange is saved for the one thing to tap. */}
            <Text style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>{title}</Text>
            <Pressable
              onPress={() => {
                tap()
                onDismiss()
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss tip"
            >
              <X size={16} color={tokens.text3} />
            </Pressable>
          </View>
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption, lineHeight: type.caption * 1.4, marginTop: 4 }}>{body}</Text>
          <View style={[styles.try, { backgroundColor: tokens.accent, borderRadius: radius.full, marginTop: space.sm, paddingHorizontal: space.md }]}>
            <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.caption }}>Try it</Text>
          </View>
        </Pressable>
      </Reanimated.View>
    </>
  )
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 2, zIndex: 10 },
  bubble: { position: 'absolute', zIndex: 10, width: BUBBLE_W },
  caret: { position: 'absolute', top: -(CARET_H - 1) },
  card: { shadowColor: '#7a2a00', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  try: { alignSelf: 'flex-start', paddingVertical: 6 },
})
