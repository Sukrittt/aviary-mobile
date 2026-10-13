import { Pressable, StyleSheet, Text, View } from 'react-native'
import Reanimated, { Easing, FadeOut, Keyframe } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { type PhosphorIcon } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { NAV_HEIGHT } from '@/src/theme/scale'

// A short, settled rise out of the + circle: no overshoot.
const RISE = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 8 }, { scale: 0.92 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(160)

export type QuickAddItem = { label: string; icon: PhosphorIcon; tint: string; onPress: () => void }

/**
 * The add slot's long-press menu: a small card that grows up out of the +
 * circle. Nothing dims the screen; a tap anywhere else closes it.
 */
export function QuickAddMenu({ items, onClose }: { items: QuickAddItem[]; onClose: () => void }) {
  const { tokens, space, radius, type, elevation } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <>
      {/* Invisible: the screen stays in full view, a tap anywhere just closes the menu. */}
      <Pressable testID="quick-add-scrim" style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <View pointerEvents="box-none" style={[styles.anchor, { bottom: NAV_HEIGHT + insets.bottom - 14 }]}>
        <Reanimated.View
          entering={RISE}
          exiting={FadeOut.duration(120)}
          style={[
            styles.card,
            elevation.floating,
            { backgroundColor: tokens.cardSolid, borderRadius: radius.md, padding: 4 },
          ]}
        >
          {items.map(({ label, icon: Icon, tint, onPress }) => (
            <Pressable
              key={label}
              accessibilityRole="menuitem"
              accessibilityLabel={label}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                onClose()
                onPress()
              }}
              style={({ pressed }) => [
                styles.row,
                { gap: space.sm, paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: radius.sm },
                pressed && { backgroundColor: tokens.inputBg },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: tint }]}>
                <Icon size={14} color="#ffffff" />
              </View>
              <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>{label}</Text>
            </Pressable>
          ))}
        </Reanimated.View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // Grows from its bottom edge, where the + circle sits.
  card: { minWidth: 150, transformOrigin: 'bottom' },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
})
