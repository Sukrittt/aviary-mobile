import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Screen } from '@/src/components/ui/Screen'
import { useTheme } from '@/src/theme/ThemeProvider'

/**
 * A tab's first load, drawn in the shape of the screen it's about to become,
 * so the data fills in without the layout jumping. Tab loads are usually under
 * a second, too short to read a LoadingCaption phrase; long waits (bill scan,
 * Money Brain, Wrapped) keep the captions.
 */

function Bone({ w = '100%', h, r = 8, style }: { w?: DimensionValue; h: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme()
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: tokens.inputBg }, style]} />
}

/** One pulse for the whole body, so every bone breathes in step. */
function Pulse({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(1)
  useEffect(() => {
    if (reduceMotion) return
    opacity.value = withRepeat(withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [reduceMotion, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View testID="tab-skeleton" accessible accessibilityLabel="Loading" style={style}>
      {children}
    </Animated.View>
  )
}

/** Icon circle, two lines and an amount: a transaction or envelope row. */
function Row({ icon = 40 }: { icon?: number }) {
  return (
    <View style={styles.row}>
      <Bone w={icon} h={icon} r={icon / 2} />
      <View style={styles.rowText}>
        <Bone w="55%" h={14} />
        <Bone w="30%" h={11} />
      </View>
      <Bone w={56} h={14} />
    </View>
  )
}

function Rows({ count, icon }: { count: number; icon?: number }) {
  return <>{Array.from({ length: count }, (_, i) => <Row key={i} icon={icon} />)}</>
}

function CardShape({ children }: { children: ReactNode }) {
  const { tokens, radius, space } = useTheme()
  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: tokens.border, padding: space.lg, gap: space.sm }}>
      {children}
    </View>
  )
}

export function HomeSkeleton() {
  const { space, radius } = useTheme()
  return (
    <Screen title={<Bone w={40} h={40} r={20} />} center={<Bone w={84} h={16} />} contentContainerStyle={{ gap: space.lg }}>
      <Pulse>
        <View style={[styles.hero, { paddingVertical: space.lg }]}>
          <Bone w={110} h={12} />
          <Bone w={200} h={56} r={radius.md} />
          <Bone w={140} h={28} r={radius.full} />
        </View>
        <CardShape>
          <Bone w={120} h={18} />
          <Rows count={4} icon={32} />
        </CardShape>
      </Pulse>
    </Screen>
  )
}

export function ActivitySkeleton() {
  const { space } = useTheme()
  return (
    <Screen title="Activity">
      <Pulse>
        <View style={[styles.searchRow, { marginBottom: space.md }]}>
          <Bone w={undefined} h={46} r={100} style={styles.flex} />
          <Bone w={44} h={44} r={22} />
        </View>
        <Bone w={90} h={12} style={{ marginTop: space.sm }} />
        <Rows count={7} />
      </Pulse>
    </Screen>
  )
}

export function EnvelopesSkeleton() {
  const { space } = useTheme()
  return (
    <Screen title="Categories">
      <Pulse>
        <Bone w={150} h={12} style={{ marginBottom: space.md }} />
        <View style={{ gap: space.md }}>
          {[3, 2].map((count, i) => (
            <CardShape key={i}>
              <Bone w={100} h={16} />
              <Rows count={count} icon={28} />
            </CardShape>
          ))}
        </View>
      </Pulse>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowText: { flex: 1, gap: 6 },
})
