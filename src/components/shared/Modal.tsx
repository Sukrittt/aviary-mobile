import { useEffect, useState, type ReactNode } from 'react'
import {
  Modal as RNModal,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import Reanimated, { Easing, Extrapolation, interpolate, LinearTransition, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { elevation, motion, radius } from '@/src/theme/scale'

interface Props {
  visible: boolean
  onClose: () => void
  children: ReactNode
}

// Settles with a hint of overshoot over the card's travel; motion.spring
// (damping 15) is tuned for small press feedback and bounces too far here.
const SHEET_SPRING = { damping: 24, stiffness: 240, mass: 0.9 }
const INSET = 8

/**
 * Reusable bottom-sheet: a floating card over a dimmed backdrop. RN's Modal runs
 * with animationType="none" and the two layers animate on their own: the
 * backdrop fades, the card springs up. RN's "slide" moved the whole modal, so
 * the dim rode up with the card like a curtain. The modal stays mounted until
 * the close animation finishes.
 * The card moves by a plain transform, never a Reanimated layout transition:
 * one stalled inside iOS's Modal (which resizes its root after mount), leaving
 * the card painted above the screen's bottom while touches hit its real frame.
 * Exported as `BottomSheet` (not `Modal`) so importers don't shadow
 * react-native's own `Modal`.
 */
export function BottomSheet({ visible, onClose, children }: Props) {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [mounted, setMounted] = useState(visible)
  const progress = useSharedValue(0)
  // Travel is the card's own height (window height until it's measured), so the
  // card is in view for the whole motion instead of popping in from far below.
  const travel = useSharedValue(height)

  // Mount right away on open; unmount waits for the close animation below.
  if (visible && !mounted) setMounted(true)

  useEffect(() => {
    if (visible) {
      progress.value = withSpring(1, SHEET_SPRING)
    } else {
      progress.value = withTiming(0, { duration: motion.base }, (finished) => {
        if (finished) runOnJS(setMounted)(false)
      })
    }
  }, [visible, progress])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }))
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * travel.value }],
  }))

  // First backdrop tap just dismisses the keyboard; a second tap closes the sheet.
  const handleBackdrop = () => (Keyboard.isVisible() ? Keyboard.dismiss() : onClose())

  return (
    <RNModal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      // Android edge-to-edge: RN's Modal opens as its own Dialog window, which by
      // default stops short of the status/nav bars, exposing the screen behind it
      // there. These make the Dialog draw full-bleed like the rest of the app.
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, backdropStyle]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable testID="bottom-sheet-backdrop" style={styles.backdrop} onPress={handleBackdrop}>
          <Reanimated.View
            // Content that grows or shrinks while open (a section appearing)
            // eases the card's top edge instead of jumping it.
            layout={LinearTransition.duration(280).easing(Easing.out(Easing.cubic))}
            style={[styles.float, { marginBottom: INSET }, cardStyle]}
            onLayout={(e) => (travel.value = e.nativeEvent.layout.height + INSET)}
          >
            <Pressable
              testID="bottom-sheet-card"
              style={[styles.sheet, { backgroundColor: tokens.cardSolid, borderColor: tokens.borderStrong }]}
              onPress={(e) => e.stopPropagation()}
            >
              <ScrollView
                // The card floats INSET above the screen's bottom, so it only
                // needs the rest of the home-indicator inset as padding.
                contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom - INSET, 0) + 16 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            </Pressable>
          </Reanimated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </RNModal>
  )
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  // Shadow lives on this wrapper: the card's overflow:hidden would clip it on iOS.
  float: { marginHorizontal: INSET, maxHeight: '85%', ...elevation.floating },
  sheet: { flexShrink: 1, borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
})
