import { Pressable, StyleSheet, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { HandCoins } from '@/src/components/shared/icons'

const SIZE = 36
export const QUICK_INCOME_PATH = '/modals/quick-income'

/**
 * Log-expense's top-right switch to income. Opens quick-income straight away
 * with this button's centre, so its green disc grows out of here (and shrinks
 * back here on close).
 */
export function IncomeFloodButton({ top, right }: { top: number; right: number }) {
  const router = useRouter()
  const { width } = useWindowDimensions()
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
        router.push({ pathname: QUICK_INCOME_PATH, params: { ox: String(width - right - SIZE / 2), oy: String(top + SIZE / 2) } })
      }}
      style={[styles.button, { top, right }]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Add income"
    >
      <HandCoins size={18} color="#ffffff" />
    </Pressable>
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
})
