import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { ChevronLeft } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { motion } from '@/src/theme/scale'
import { OPERATORS } from '@/src/lib/calcAmount'

const BASE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'del'] as const
const CALC_TOGGLE = '+/.'
const CALC_KEYS = [...OPERATORS, '.']
const CALC_WIDTH = 56

/**
 * Custom numeric keypad. Shared by the code screen, the setup wizard and the
 * log-expense screen — a keypad on-screen instead of the OS keyboard is what
 * keeps amount entry to one thumb and no keyboard pop.
 *
 * `onAccent` renders it for the log screen's accent ground, where the usual
 * card/border colors would vanish.
 *
 * `calculator` turns the extra slot into a "+/." key that slides out a column
 * of operators (and '.'), all sent through onDigit, so a split bill can be
 * added up right on the amount.
 */
export function Numpad({
  onDigit,
  onBackspace,
  onClear,
  disabled = false,
  extraKey,
  onAccent = false,
  calculator = false,
}: {
  onDigit: (digit: string) => void
  onBackspace: () => void
  /** Long-pressing the delete key clears the whole field. Omit to disable. */
  onClear?: () => void
  disabled?: boolean
  /** Fills the blank slot before '0' (e.g. '00' for an amount pad). Omit for a blank slot. */
  extraKey?: string
  onAccent?: boolean
  calculator?: boolean
}) {
  const { tokens, radius, space } = useTheme()
  const [calcOpen, setCalcOpen] = useState(false)
  // The operator column hugs the screen edge, out past the parent's side
  // padding (log-expense's footer uses space.lg), like a drawer pulled in.
  const bleed = space.lg
  const open = useSharedValue(0)
  useEffect(() => {
    open.value = withSpring(calcOpen ? 1 : 0, { ...motion.springTight, overshootClamping: true })
  }, [calcOpen, open])
  const gridStyle = useAnimatedStyle(() => ({ paddingRight: open.value * (CALC_WIDTH - bleed + space.sm) }))
  const columnStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - open.value) * (CALC_WIDTH + space.sm) }] }))
  const keys = [...BASE_KEYS.slice(0, 9), calculator ? CALC_TOGGLE : extraKey ?? '', ...BASE_KEYS.slice(9)]

  const keyBg = onAccent ? 'transparent' : tokens.card
  const keyBorder = onAccent ? 'transparent' : tokens.border
  // Log-expense's accent flood stays the same saturated orange in both
  // schemes, so its keys stay white in both too — tokens.onAccent flips to
  // near-black in dark mode for normal accent surfaces, which is wrong here.
  const keyColor = onAccent ? '#ffffff' : tokens.text

  const press = (k: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    if (k === 'del') onBackspace()
    else if (k === CALC_TOGGLE) setCalcOpen((o) => !o)
    else onDigit(k)
  }
  const fill = onAccent ? 'rgba(255, 255, 255, 0.16)' : tokens.inputBg

  const grid = (
    <Animated.View style={[{ gap: space.md - 2 }, calculator && gridStyle]}>
      {[0, 3, 6, 9].map((start) => (
        <View key={start} style={[styles.row, { gap: space.md - 2 }]}>
          {keys.slice(start, start + 3).map((k, j) => {
            const i = start + j
            if (k === '') return <View key={i} style={[styles.key, { borderWidth: 0 }]} />
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={k === 'del' ? 'Delete' : k === CALC_TOGGLE ? 'Calculator' : k}
                accessibilityState={k === CALC_TOGGLE ? { expanded: calcOpen } : undefined}
                disabled={disabled}
                onPress={() => press(k)}
                onLongPress={
                  k === 'del' && onClear
                    ? () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
                        onClear()
                      }
                    : undefined
                }
                style={({ pressed }) => [
                  styles.key,
                  {
                    backgroundColor: keyBg,
                    borderColor: keyBorder,
                    borderRadius: radius.lg,
                    opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
                  },
                ]}
              >
                {k === CALC_TOGGLE && calcOpen && <View style={[styles.toggleFill, { backgroundColor: fill }]} />}
                {k === 'del' ? (
                  <ChevronLeft size={22} color={keyColor} />
                ) : (
                  <Text style={[styles.label, { color: keyColor, fontFamily: fontFamily.displaySemiBold }]}>{k}</Text>
                )}
              </Pressable>
            )
          })}
        </View>
      ))}
    </Animated.View>
  )
  if (!calculator) return grid

  return (
    <View>
      {grid}
      <Animated.View
        pointerEvents={calcOpen ? 'auto' : 'none'}
        accessibilityElementsHidden={!calcOpen}
        importantForAccessibility={calcOpen ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.calcColumn,
          { right: -bleed, backgroundColor: fill, borderTopLeftRadius: radius.xl, borderBottomLeftRadius: radius.xl },
          columnStyle,
        ]}
      >
        {CALC_KEYS.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k}
            disabled={disabled}
            onPress={() => press(k)}
            style={({ pressed }) => [styles.calcKey, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.label, { color: keyColor, fontFamily: fontFamily.displaySemiBold }]}>{k}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Fixed rows, not a wrapping grid: the rows can narrow (calculator column
  // sliding in) without a key ever wrapping to the next line.
  row: { flexDirection: 'row' },
  key: { flex: 1, minHeight: 56, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 22 },
  toggleFill: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  calcColumn: { position: 'absolute', top: 4, bottom: -20, width: CALC_WIDTH, justifyContent: 'space-evenly' },
  calcKey: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
