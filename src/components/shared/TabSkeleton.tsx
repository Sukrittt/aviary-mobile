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
function Pulse({ children, label = 'Loading' }: { children: ReactNode; label?: string }) {
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(1)
  useEffect(() => {
    if (reduceMotion) return
    opacity.value = withRepeat(withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [reduceMotion, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View testID="tab-skeleton" accessible accessibilityLabel={label} style={style}>
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

function CardShape({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { tokens, radius, space } = useTheme()
  return (
    <View style={[{ borderRadius: radius.lg, borderWidth: 1, borderColor: tokens.border, padding: space.lg, gap: space.sm }, style]}>
      {children}
    </View>
  )
}

/** Home's category row: icon tile, name and spent/of, progress bar, last spent, available pill. */
function CategoryRow() {
  return (
    <View style={styles.catRow}>
      <View style={styles.rowText}>
        <View style={styles.catTop}>
          <Bone w={26} h={26} r={10} />
          <Bone w="35%" h={13} />
          <Bone w={70} h={12} style={styles.pushRight} />
        </View>
        <Bone h={6} r={3} />
        <Bone w={90} h={11} />
      </View>
      <View style={styles.pillCol}>
        <Bone w={60} h={20} r={6} />
      </View>
    </View>
  )
}

function CategoryGroup({ count }: { count: number }) {
  const { tokens } = useTheme()
  return (
    <View style={[styles.group, { borderTopColor: tokens.border }]}>
      <View style={styles.groupHead}>
        <View style={styles.catTop}>
          <Bone w={16} h={16} r={4} />
          <Bone w={90} h={13} />
        </View>
        <Bone w={70} h={12} />
      </View>
      <View style={[styles.groupRows, { borderLeftColor: tokens.border }]}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={i > 0 && [styles.rowDivider, { borderTopColor: tokens.border }]}>
            <CategoryRow />
          </View>
        ))}
      </View>
    </View>
  )
}

/** The money brief's narrative while it loads: three lines, like web's. */
export function BriefLinesSkeleton() {
  return (
    <Pulse label="Loading your money brief">
      <View style={styles.briefLines}>
        <Bone h={12} />
        <Bone h={12} />
        <Bone w="60%" h={12} />
      </View>
    </Pulse>
  )
}

/** Below the brief while it loads: three insight rows and three question chips, like web's. */
export function BriefSkeleton() {
  const { space } = useTheme()
  return (
    <Pulse>
      <View style={{ gap: space.lg }}>
        <CardShape style={{ gap: 0, paddingVertical: space.sm }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.row}>
              <Bone w={36} h={36} r={12} />
              <View style={styles.rowText}>
                <Bone w="55%" h={13} />
                <Bone w="35%" h={11} />
              </View>
              <Bone w={56} h={14} />
            </View>
          ))}
        </CardShape>
        <View style={styles.briefChips}>
          {[0, 1, 2].map((i) => <Bone key={i} w={i === 1 ? 96 : 128} h={38} r={20} />)}
        </View>
      </View>
    </Pulse>
  )
}

/** Mirrors Home with everything assigned: slim Ready to Assign row, then the Categories card. */
export function HomeSkeleton() {
  const { space, radius } = useTheme()
  return (
    <Screen
      title={<Bone w={40} h={40} r={20} />}
      center={
        <View style={styles.headerMonth}>
          <Bone w={90} h={18} />
          <Bone w={70} h={11} />
        </View>
      }
      contentContainerStyle={{ gap: space.lg }}
    >
      <Pulse>
        <CardShape style={[styles.slimRta, { marginTop: space.sm, marginBottom: space.lg }]}>
          <View style={styles.catTop}>
            <Bone w={30} h={30} r={9} />
            <Bone w={120} h={15} />
          </View>
          <Bone w={44} h={15} />
        </CardShape>
        <CardShape>
          <View style={styles.groupHead}>
            <Bone w={110} h={20} />
            <Bone w={96} h={34} r={radius.full} />
          </View>
          <View style={{ marginTop: space.sm }}>
            <CategoryGroup count={3} />
          </View>
        </CardShape>
      </Pulse>
    </Screen>
  )
}

/** Insights' monthly trend while it loads: a row of bars over month labels. */
export function TrendSkeleton({ height }: { height: number }) {
  const bars = [0.45, 0.7, 0.55, 0.85, 0.6, 0.4]
  return (
    <Pulse label="Loading spending trend">
      <View style={[styles.trend, { height }]}>
        {bars.map((f, i) => (
          <View key={i} style={styles.trendCol}>
            <Bone h={(height - 24) * f} r={6} />
            <Bone w="60%" h={10} />
          </View>
        ))}
      </View>
    </Pulse>
  )
}

/** Insights' breakdown while it loads: the donut ring, then a few legend rows. */
export function DonutSkeleton({ size = 200 }: { size?: number }) {
  const { tokens } = useTheme()
  return (
    <Pulse label="Loading spending breakdown">
      <View style={styles.donut}>
        <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 26, borderColor: tokens.inputBg }} />
      </View>
      <Rows count={3} icon={28} />
    </Pulse>
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

/**
 * The paywall while plans load: header, then the trial timeline or the four
 * feature cards, then the two plan cards. Same padding as PlanPicker's body.
 */
export function PlanPickerSkeleton({ timeline }: { timeline: boolean }) {
  return (
    <Pulse label="Loading plans">
      <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Bone w={84} h={12} />
          <Bone w="90%" h={28} />
          <Bone w="60%" h={28} />
          <Bone w="100%" h={14} />
        </View>
        {timeline ? (
          <View style={{ gap: 18 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
                <Bone w={32} h={32} r={16} />
                <View style={[styles.rowText, { paddingTop: 6 }]}>
                  <Bone w={100} h={15} />
                  <Bone w="95%" h={12} />
                  <Bone w="70%" h={12} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} w="48%" h={120} r={18} style={{ flexGrow: 1 }} />
            ))}
          </View>
        )}
        <View style={{ gap: 8 }}>
          <Bone h={72} r={16} />
          <Bone h={60} r={16} />
        </View>
      </View>
    </Pulse>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerMonth: { alignItems: 'center', gap: 4 },
  slimRta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  group: { borderTopWidth: 1, paddingVertical: 8 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  groupRows: { paddingLeft: 12, marginLeft: 6, borderLeftWidth: StyleSheet.hairlineWidth },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2, marginLeft: -12, paddingLeft: 12 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pushRight: { marginLeft: 'auto' },
  pillCol: { width: 84, alignItems: 'flex-end' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  briefLines: { gap: 8, marginTop: 12 },
  briefChips: { flexDirection: 'row', gap: 8 },
  rowText: { flex: 1, gap: 6 },
  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  trendCol: { flex: 1, alignItems: 'center', gap: 8 },
  donut: { alignItems: 'center', marginTop: 16, marginBottom: 8 },
})
