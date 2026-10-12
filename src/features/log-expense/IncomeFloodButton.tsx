import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native'
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useIsFocused, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { HandCoins } from 'lucide-react-native'
import { INCOME_FLOOD } from '@/src/theme/tokens'

const SIZE = 36
export const QUICK_INCOME_PATH = '/modals/quick-income'

/**
 * Log-expense's top-right switch to income: a green disc grows out of the
 * button until it covers the screen, then quick-income fades in over the same
 * green. Rendered last in the screen so the disc draws over everything else.
 */
export function IncomeFloodButton({ top, right }: { top: number; right: number }) {
  const router = useRouter()
  const focused = useIsFocused()
  const reduceMotion = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const scale = useSharedValue(0)
  const going = useRef(false)

  // Back from income: clear the flood so the accent screen is underneath again.
  useEffect(() => {
    if (!focused) return
    going.current = false
    scale.value = 0
  }, [focused, scale])

  // Centre of the button, and a radius reaching the farthest corner from it.
  const cx = width - right - SIZE / 2
  const cy = top + SIZE / 2
  const r = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy))

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const go = () => router.push(QUICK_INCOME_PATH)

  return (
    <>
      <Pressable
        onPress={() => {
          if (going.current) return
          going.current = true
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
          if (reduceMotion) return go()
          scale.value = withTiming(1, { duration: 650, easing: Easing.inOut(Easing.cubic) }, (done) => {
            if (done) runOnJS(go)()
          })
        }}
        style={[styles.button, { top, right }]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Add income"
      >
        <HandCoins size={18} color="#ffffff" />
      </Pressable>
      <Reanimated.View
        testID="income-flood"
        pointerEvents="none"
        style={[styles.disc, { left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: r }, discStyle]}
      />
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  disc: { position: 'absolute', backgroundColor: INCOME_FLOOD },
})
