import { Pressable, StyleSheet, Text, View } from 'react-native'
import Reanimated, { Easing, FadeOut, Keyframe } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { type PhosphorIcon } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { NAV_HEIGHT } from '@/src/theme/scale'
import { NAV_SIDE } from './FloatingNav'

// A short, settled rise out of the + circle: no overshoot.
const RISE = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 8 }, { scale: 0.92 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(160)

/** `tint` colors the glyph, `tintSoft` the chip behind it: the same soft-chip pair as More's feature cards. */
export type QuickAddItem = { label: string; icon: PhosphorIcon; tint: string; tintSoft: string; onPress: () => void }

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
      <View pointerEvents="box-none" style={[styles.anchor, { bottom: NAV_HEIGHT + insets.bottom - 14, right: NAV_SIDE }]}>
        <Reanimated.View
          entering={RISE}
          exiting={FadeOut.duration(120)}
          style={[
            styles.card,
            elevation.floating,
            { backgroundColor: tokens.cardSolid, borderRadius: radius.md, padding: 4 },
          ]}
        >
          {items.map(({ label, icon: Icon, tint, tintSoft, onPress }) => (
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
              <View style={[styles.icon, { backgroundColor: tintSoft }]}>
                <Icon size={16} color={tint} />
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
  anchor: { position: 'absolute', left: 0, alignItems: 'flex-end' },
  // Grows from its bottom-right corner, where the + disc sits.
  card: { minWidth: 150, transformOrigin: 'bottom right' },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
})
