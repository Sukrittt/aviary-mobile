import type { ReactNode } from 'react'
import { Modal as RNModal, Pressable, KeyboardAvoidingView, Keyboard, Platform, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'

interface Props {
  visible: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * Reusable bottom-sheet: backdrop + slide-up card. RN's built-in Modal already
 * animates the slide (proven in investments.tsx's inline action sheet), so
 * open/close needs no Animated/reanimated. The card is deliberately a plain
 * Pressable: a Reanimated layout transition on it stalled inside iOS's Modal
 * (which resizes its root after mount), leaving the card painted above the
 * screen's bottom while touches hit its real frame, so taps went dead.
 * Exported as `BottomSheet` (not `Modal`) so importers don't shadow
 * react-native's own `Modal`.
 */
export function BottomSheet({ visible, onClose, children }: Props) {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()

  // First backdrop tap just dismisses the keyboard; a second tap closes the sheet.
  const handleBackdrop = () => (Keyboard.isVisible() ? Keyboard.dismiss() : onClose())

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Android edge-to-edge: RN's Modal opens as its own Dialog window, which by
      // default stops short of the status/nav bars, exposing the screen behind it
      // there. These make the Dialog draw full-bleed like the rest of the app.
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable testID="bottom-sheet-backdrop" style={styles.backdrop} onPress={handleBackdrop}>
          <Pressable
            testID="bottom-sheet-card"
            style={[
              styles.sheet,
              { backgroundColor: tokens.modalStrong, borderColor: tokens.borderStrong, maxHeight: '85%' },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </RNModal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
})
