import { Pressable, StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { NAV_HEIGHT } from '@/src/theme/scale'

export type QuickAddItem = { label: string; icon: LucideIcon; tint: string; onPress: () => void }

/**
 * The add slot's long-press menu: a small card that grows up out of the +
 * circle, over a dimmed backdrop that closes it on tap.
 */
export function QuickAddMenu({ items, onClose }: { items: QuickAddItem[]; onClose: () => void }) {
  const { tokens, space, radius, type, elevation } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <>
      <Reanimated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, styles.scrim]}>
        <Pressable testID="quick-add-scrim" style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Reanimated.View>
      <View pointerEvents="box-none" style={[styles.anchor, { bottom: NAV_HEIGHT + insets.bottom }]}>
        <Reanimated.View
          entering={ZoomIn.springify().damping(16).stiffness(220)}
          exiting={ZoomOut.duration(140)}
          style={[
            styles.card,
            elevation.floating,
            { backgroundColor: tokens.cardSolid, borderRadius: radius.lg, padding: space.xs },
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
                { gap: space.md, padding: space.sm, borderRadius: radius.md },
                pressed && { backgroundColor: tokens.inputBg },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: tint }]}>
                <Icon size={18} color="#ffffff" />
              </View>
              <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{label}</Text>
            </Pressable>
          ))}
        </Reanimated.View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  anchor: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // Grows from its bottom edge, where the + circle sits.
  card: { minWidth: 200, transformOrigin: 'bottom' },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
})
