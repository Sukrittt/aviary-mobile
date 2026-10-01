import { useEffect } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { ArrowUpRight, ChartNoAxesColumnIncreasing, ReceiptText, Repeat2 } from 'lucide-react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { BIRD_BODY_PATH, BIRD_EYE } from '@/src/components/splash/birdPath'
import { SnoozingBird } from './SnoozingBird'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

type Mood = 'snoozing' | 'searching'
type Subject = 'expenses' | 'subscriptions' | 'holdings'

/** One illustrated family for empty lists and charts. The scene is decorative;
 * copy and an optional next step carry all the meaning. */
export function EmptyState({
  title,
  description,
  mood = 'snoozing',
  subject = 'expenses',
  action,
  testID,
  style,
}: {
  title: string
  description: string
  mood?: Mood
  subject?: Subject
  action?: { label: string; onPress: () => void }
  testID?: string
  style?: StyleProp<ViewStyle>
}) {
  const { tokens, type, space, radius, motion } = useTheme()
  const reduceMotion = useReducedMotion()
  const scene = useSharedValue(0)
  const copy = useSharedValue(0)

  useEffect(() => {
    scene.value = reduceMotion
      ? withTiming(1, { duration: motion.fast })
      : withSpring(1, motion.spring)
    copy.value = withDelay(reduceMotion ? 0 : 60, withTiming(1, {
      duration: motion.base,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
    }))
    return () => {
      cancelAnimation(scene)
      cancelAnimation(copy)
    }
  }, [scene, copy, reduceMotion, motion])

  const sceneStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, scene.value)),
    transform: reduceMotion ? [] : [{ translateY: (1 - scene.value) * 8 }, { scale: 0.96 + scene.value * 0.04 }],
  }))
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.value,
    transform: reduceMotion ? [] : [{ translateY: (1 - copy.value) * 6 }],
  }))
  const Prop = subject === 'subscriptions' ? Repeat2 : subject === 'holdings' ? ChartNoAxesColumnIncreasing : ReceiptText

  return (
    <View testID={testID} style={[styles.wrap, { paddingHorizontal: space.lg, paddingVertical: space.xxl }, style]}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.scene, sceneStyle]}
      >
        <View style={[styles.halo, { backgroundColor: tokens.accentSoft }]} />
        <View style={[styles.orbit, { borderColor: tokens.borderStrong }]} />
        <View style={[styles.ground, { backgroundColor: tokens.accentSoft }]} />
        <View style={styles.bird}>
          {mood === 'snoozing' ? (
            <SnoozingBird size={112} color={tokens.text} accent={tokens.accent} eyeColor={tokens.bg} />
          ) : (
            <Svg width={112} height={112} viewBox="40 40 460 460">
              <Rect x={224} y={340} width={17} height={46} rx={8.5} fill={tokens.text} />
              <Rect x={259} y={340} width={17} height={46} rx={8.5} fill={tokens.text} />
              <Rect x={128} y={379} width={256} height={26} rx={13} fill={tokens.text} />
              <Path d={BIRD_BODY_PATH} fill={tokens.text} />
              <Circle {...BIRD_EYE} fill={tokens.bg} />
              <Circle cx={306} cy={216} r={42} fill="none" stroke={tokens.accent} strokeWidth={14} />
              <Path d="M 337 247 L 378 288" stroke={tokens.accent} strokeWidth={18} strokeLinecap="round" />
            </Svg>
          )}
        </View>
        <View style={[styles.prop, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.md }]}>
          <Prop size={23} color={tokens.accentInk} strokeWidth={1.8} />
        </View>
        <View style={[styles.dot, { backgroundColor: tokens.accent, top: 24, left: 27 }]} />
        <View style={[styles.dot, { backgroundColor: tokens.accent, bottom: 27, right: 24, width: 4, height: 4 }]} />
      </Animated.View>
      <Animated.View style={[styles.copy, { gap: space.sm }, copyStyle]}>
        <Text accessibilityRole="header" style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title, textAlign: 'center' }}>
          {title}
        </Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.body, lineHeight: 22, textAlign: 'center' }}>
          {description}
        </Text>
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            icon={ArrowUpRight}
            variant="ghost"
            style={{ backgroundColor: tokens.accentSoft, marginTop: space.sm }}
          />
        ) : null}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  scene: { width: 176, height: 140, marginBottom: 12 },
  halo: { position: 'absolute', width: 112, height: 112, borderRadius: 56, left: 28, top: 10, opacity: 0.65 },
  orbit: { position: 'absolute', width: 140, height: 118, borderRadius: 70, left: 15, top: 6, borderWidth: 1, transform: [{ rotate: '-18deg' }] },
  ground: { position: 'absolute', width: 84, height: 8, borderRadius: 50, bottom: 21, left: 40 },
  bird: { position: 'absolute', left: 25, top: 16 },
  prop: { position: 'absolute', right: 10, bottom: 25, width: 46, height: 52, borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '10deg' }] },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  copy: { alignItems: 'center', maxWidth: 300 },
})
