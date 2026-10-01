import { useEffect } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import {
  Archive,
  ArrowUpRight,
  ChartNoAxesColumnIncreasing,
  FolderOpen,
  MessageCircle,
  ReceiptText,
  Repeat2,
  ScanLine,
  type LucideIcon,
} from 'lucide-react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import Animated, {
  type AnimatedStyle,
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { BIRD_BODY_PATH, BIRD_EYE } from '@/src/components/splash/birdPath'
import { SnoozingBird } from './SnoozingBird'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

type Mood = 'snoozing' | 'searching' | 'clear'
type Subject =
  | 'expenses'
  | 'subscriptions'
  | 'holdings'
  | 'recurring'
  | 'scans'
  | 'chat'
  | 'archive'
  | 'envelopes'
  | 'insights'

const SUBJECT_ICONS: Record<Subject, LucideIcon> = {
  expenses: ReceiptText,
  subscriptions: Repeat2,
  holdings: ChartNoAxesColumnIncreasing,
  recurring: Repeat2,
  scans: ScanLine,
  chat: MessageCircle,
  archive: Archive,
  envelopes: FolderOpen,
  insights: ChartNoAxesColumnIncreasing,
}

const SUBJECT_MOODS: Record<Subject, Mood> = {
  expenses: 'clear',
  subscriptions: 'snoozing',
  holdings: 'clear',
  recurring: 'snoozing',
  scans: 'searching',
  chat: 'clear',
  archive: 'clear',
  envelopes: 'clear',
  insights: 'searching',
}

const EYE_LID_ORIGIN: [string, string, number] = [
  `${((BIRD_EYE.cx - 40) / 460) * 100}%`,
  `${((BIRD_EYE.cy - BIRD_EYE.r - 40) / 460) * 100}%`,
  0,
]

function AwakeBird({
  size,
  color,
  eyeColor,
  lidStyle,
}: {
  size: number
  color: string
  eyeColor: string
  lidStyle?: AnimatedStyle<ViewStyle>
}) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="40 40 460 460" style={StyleSheet.absoluteFill}>
        <Rect x={224} y={340} width={17} height={46} rx={8.5} fill={color} />
        <Rect x={259} y={340} width={17} height={46} rx={8.5} fill={color} />
        <Rect x={128} y={379} width={256} height={26} rx={13} fill={color} />
        <Path d={BIRD_BODY_PATH} fill={color} />
        <Circle {...BIRD_EYE} fill={eyeColor} />
      </Svg>
      {lidStyle ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: EYE_LID_ORIGIN }, lidStyle]}>
          <Svg width={size} height={size} viewBox="40 40 460 460">
            <Circle {...BIRD_EYE} r={BIRD_EYE.r + 1} fill={color} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
}

function SearchingBird({
  size,
  color,
  eyeColor,
  accent,
  lensStyle,
}: {
  size: number
  color: string
  eyeColor: string
  accent: string
  lensStyle: AnimatedStyle<ViewStyle>
}) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="40 40 460 460" style={StyleSheet.absoluteFill}>
        <Rect x={224} y={340} width={17} height={46} rx={8.5} fill={color} />
        <Rect x={259} y={340} width={17} height={46} rx={8.5} fill={color} />
        <Rect x={128} y={379} width={256} height={26} rx={13} fill={color} />
        <Path d={BIRD_BODY_PATH} fill={color} />
        <Circle {...BIRD_EYE} fill={eyeColor} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, lensStyle]}>
        <Svg width={size} height={size} viewBox="40 40 460 460">
          <Circle cx={306} cy={216} r={42} fill="none" stroke={accent} strokeWidth={14} />
          <Path d="M 337 247 L 378 288" stroke={accent} strokeWidth={18} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  )
}

/** One illustrated family for empty lists and charts. The scene is decorative;
 * copy and an optional next step carry all the meaning. */
export function EmptyState({
  title,
  description,
  mood,
  subject = 'expenses',
  action,
  compact = false,
  testID,
  style,
}: {
  title: string
  description: string
  mood?: Mood
  subject?: Subject
  action?: { label: string; onPress: () => void }
  compact?: boolean
  testID?: string
  style?: StyleProp<ViewStyle>
}) {
  const { tokens, type, space, radius, motion } = useTheme()
  const reduceMotion = useReducedMotion()
  const resolvedMood = mood ?? SUBJECT_MOODS[subject]
  const scene = useSharedValue(0)
  const copy = useSharedValue(0)
  const birdLoop = useSharedValue(0)
  const propLoop = useSharedValue(0)
  const searchLoop = useSharedValue(0)
  const blink = useSharedValue(0)

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

  useEffect(() => {
    if (reduceMotion) {
      birdLoop.value = 0
      propLoop.value = 0
      return
    }
    const ambient = { duration: 2400, easing: Easing.bezier(0.77, 0, 0.175, 1) }
    birdLoop.value = withRepeat(withTiming(1, ambient), -1, true)
    propLoop.value = withDelay(600, withRepeat(withTiming(1, ambient), -1, true))
    return () => {
      cancelAnimation(birdLoop)
      cancelAnimation(propLoop)
    }
  }, [birdLoop, propLoop, reduceMotion])

  useEffect(() => {
    cancelAnimation(searchLoop)
    if (reduceMotion || resolvedMood !== 'searching') {
      searchLoop.value = 0
      return
    }

    const scanEase = Easing.bezier(0.77, 0, 0.175, 1)
    searchLoop.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 380, easing: scanEase }),
        withTiming(1, { duration: 760, easing: scanEase }),
        withTiming(0, { duration: 380, easing: scanEase }),
        withDelay(880, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    )
    return () => cancelAnimation(searchLoop)
  }, [reduceMotion, resolvedMood, searchLoop])

  useEffect(() => {
    cancelAnimation(blink)
    const shouldBlink = resolvedMood === 'clear' && (subject === 'expenses' || subject === 'envelopes')
    if (reduceMotion || !shouldBlink) {
      blink.value = 0
      return
    }

    blink.value = withRepeat(
      withSequence(
        withDelay(3200, withTiming(0, { duration: 0 })),
        withTiming(1, { duration: 70, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 110, easing: Easing.out(Easing.quad) }),
      ),
      -1,
      false,
    )
    return () => cancelAnimation(blink)
  }, [blink, reduceMotion, resolvedMood, subject])

  const sceneStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, scene.value)),
    transform: reduceMotion ? [] : [{ translateY: (1 - scene.value) * 8 }, { scale: 0.96 + scene.value * 0.04 }],
  }))
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.value,
    transform: reduceMotion ? [] : [{ translateY: (1 - copy.value) * 6 }],
  }))
  const birdMotionStyle = useAnimatedStyle(() => {
    if (reduceMotion || resolvedMood === 'snoozing' || resolvedMood === 'searching') return {}
    const direction = subject === 'expenses' || subject === 'chat' ? -1 : 1
    return {
      transform: [
        { translateY: birdLoop.value * -3 },
        { rotate: `${birdLoop.value * direction * 1.5}deg` },
      ],
    }
  })
  const searchLensStyle = useAnimatedStyle(() => ({
    transform: reduceMotion
      ? []
      : [
          { translateX: searchLoop.value * 14 },
          { translateY: Math.abs(searchLoop.value) * 3 },
        ],
  }))
  const blinkStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ scaleY: 0.01 + blink.value * 0.99 }],
  }))
  const propMotionStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {}
    return {
      transform: [
        { translateY: propLoop.value * -3 },
        { rotate: `${(propLoop.value - 0.5) * 3}deg` },
        { scale: 1 + propLoop.value * 0.025 },
      ],
    }
  })
  const Prop = SUBJECT_ICONS[subject]
  const sceneConfig = SUBJECT_SCENES[subject]
  const sceneSize = compact ? 132 : 176
  const subjectAccent = subject === 'holdings'
    ? tokens.mint
    : subject === 'archive'
      ? tokens.blue
      : subject === 'chat'
        ? tokens.violet
        : tokens.accent
  const subjectSoft = subject === 'holdings'
    ? tokens.mintSoft
    : subject === 'archive'
      ? tokens.blueSoft
      : subject === 'chat'
        ? tokens.violetSoft
        : tokens.accentSoft

  return (
    <View testID={testID} style={[styles.wrap, compact ? styles.compactWrap : { paddingHorizontal: space.lg, paddingVertical: space.xxl }, style]}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.scene, { width: sceneSize, height: sceneSize * 0.8 }, sceneStyle]}
      >
        <View style={[styles.sceneCanvas, compact && styles.compactCanvas]}>
          <View style={[styles.halo, sceneConfig.halo, { backgroundColor: subjectSoft }]} />
          <View style={[styles.orbit, sceneConfig.orbit, { borderColor: tokens.borderStrong }]} />
          <View style={[styles.ground, sceneConfig.ground, { backgroundColor: subjectSoft }]} />
          <View style={[styles.bird, sceneConfig.bird]}>
            <Animated.View style={birdMotionStyle}>
              {resolvedMood === 'snoozing' ? (
                <SnoozingBird size={112} color={tokens.text} accent={subjectAccent} eyeColor={tokens.bg} />
              ) : resolvedMood === 'searching' ? (
                <SearchingBird size={112} color={tokens.text} eyeColor={tokens.bg} accent={subjectAccent} lensStyle={searchLensStyle} />
              ) : (
                <AwakeBird
                  size={112}
                  color={tokens.text}
                  eyeColor={tokens.bg}
                  lidStyle={subject === 'expenses' || subject === 'envelopes' ? blinkStyle : undefined}
                />
              )}
            </Animated.View>
          </View>
          <View style={[styles.prop, sceneConfig.prop, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: sceneConfig.propRadius ?? radius.md }]}>
            <Animated.View style={[styles.propGlyph, propMotionStyle]}>
              <Prop size={23} color={subjectAccent} strokeWidth={1.8} />
            </Animated.View>
          </View>
          <View style={[styles.dot, sceneConfig.dotOne, { backgroundColor: subjectAccent }]} />
          <View style={[styles.dot, styles.dotSmall, sceneConfig.dotTwo, { backgroundColor: subjectAccent }]} />
        </View>
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
            size="small"
            style={{ backgroundColor: tokens.accentSoft, marginTop: space.sm }}
          />
        ) : null}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  compactWrap: { paddingHorizontal: 12, paddingVertical: 18 },
  scene: { width: 176, height: 140, marginBottom: 12 },
  sceneCanvas: { position: 'relative', width: 176, height: 140 },
  compactCanvas: { position: 'absolute', left: -22, top: -17.5, transform: [{ scale: 0.75 }] },
  halo: { position: 'absolute', width: 112, height: 112, borderRadius: 56, left: 28, top: 10, opacity: 0.65 },
  orbit: { position: 'absolute', width: 140, height: 118, borderRadius: 70, left: 15, top: 6, borderWidth: 1, transform: [{ rotate: '-18deg' }] },
  ground: { position: 'absolute', width: 84, height: 8, borderRadius: 50, bottom: 21, left: 40 },
  bird: { position: 'absolute', left: 25, top: 16 },
  prop: { position: 'absolute', right: 10, bottom: 25, width: 46, height: 52, borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '10deg' }] },
  propGlyph: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  dotSmall: { width: 4, height: 4, borderRadius: 2 },
  copy: { alignItems: 'center', maxWidth: 300 },
})

interface SubjectScene {
  halo?: ViewStyle
  orbit?: ViewStyle
  ground?: ViewStyle
  bird?: ViewStyle
  prop?: ViewStyle
  propRadius?: number
  dotOne?: ViewStyle
  dotTwo?: ViewStyle
}

/** Different silhouettes keep nearby empty cards from reading like repeats. */
const SUBJECT_SCENES: Record<Subject, SubjectScene> = {
  expenses: {
    halo: { left: 43, top: 4, borderRadius: 42 },
    orbit: { left: 30, top: 18, width: 110, height: 98, borderRadius: 24, borderStyle: 'dashed', transform: [{ rotate: '8deg' }] },
    bird: { left: 30, top: 14, transform: [{ scaleX: -1 }] },
    prop: { right: 5, bottom: 12, width: 43, height: 60, transform: [{ rotate: '8deg' }] },
    dotOne: { top: 22, left: 23 },
    dotTwo: { bottom: 21, right: 29 },
  },
  subscriptions: {
    halo: { left: 20, width: 120, height: 120, borderRadius: 60 },
    orbit: { left: 13, top: 3, width: 145, height: 123, borderWidth: 2, transform: [{ rotate: '-28deg' }] },
    bird: { left: 21 },
    prop: { right: 3, bottom: 28, width: 47, height: 47, transform: [{ rotate: '-8deg' }] },
    propRadius: 24,
    dotOne: { top: 18, left: 20 },
    dotTwo: { bottom: 16, right: 31 },
  },
  holdings: {
    halo: { left: 52, top: 5, width: 98, height: 98, borderRadius: 49 },
    orbit: { left: 8, top: 20, width: 155, height: 100, borderWidth: 0, borderBottomWidth: 2, borderStyle: 'dashed', borderRadius: 0, transform: [{ rotate: '-10deg' }] },
    ground: { left: 25, bottom: 15, width: 120, transform: [{ rotate: '-8deg' }] },
    bird: { left: 30, top: 9, transform: [{ rotate: '-4deg' }] },
    prop: { right: 1, bottom: 28, width: 52, height: 44, transform: [{ rotate: '4deg' }] },
    propRadius: 16,
    dotOne: { top: 18, left: 42 },
    dotTwo: { bottom: 22, right: 17 },
  },
  recurring: {
    halo: { left: 24, top: 8, width: 116, height: 106, borderRadius: 42 },
    orbit: { left: 17, top: 1, width: 142, height: 126, borderWidth: 2, transform: [{ rotate: '25deg' }] },
    bird: { left: 22, top: 13, transform: [{ rotate: '3deg' }] },
    prop: { right: 1, bottom: 21, width: 49, height: 49, transform: [{ rotate: '9deg' }] },
    propRadius: 25,
    dotOne: { top: 11, left: 41 },
    dotTwo: { bottom: 28, right: 18 },
  },
  scans: {
    halo: { left: 35, top: 18, width: 98, height: 94, borderRadius: 28 },
    orbit: { left: 22, top: 12, width: 132, height: 106, borderRadius: 18, borderStyle: 'dashed', transform: [{ rotate: '-5deg' }] },
    bird: { left: 21, top: 10 },
    prop: { right: 1, bottom: 10, width: 48, height: 48, transform: [{ rotate: '6deg' }] },
    propRadius: 10,
    dotOne: { top: 15, left: 22 },
    dotTwo: { bottom: 17, right: 24 },
  },
  chat: {
    halo: { left: 14, top: 11, width: 116, height: 102, borderRadius: 38 },
    orbit: { borderWidth: 0 },
    ground: { left: 31, width: 94 },
    bird: { left: 17, top: 12, transform: [{ rotate: '-4deg' }] },
    prop: { right: 0, bottom: 27, width: 58, height: 46, transform: [{ rotate: '4deg' }] },
    propRadius: 18,
    dotOne: { top: 17, right: 21 },
    dotTwo: { top: 5, right: 7 },
  },
  archive: {
    halo: { left: 43, top: 2, width: 102, height: 102, borderRadius: 51 },
    orbit: { borderWidth: 0 },
    ground: { opacity: 0 },
    bird: { left: 35, top: 3, transform: [{ rotate: '2deg' }] },
    prop: { right: 13, bottom: 4, width: 122, height: 45, transform: [{ rotate: '1deg' }] },
    propRadius: 10,
    dotOne: { top: 16, left: 35 },
    dotTwo: { bottom: 17, right: 16 },
  },
  envelopes: {
    halo: { left: 37, top: 18, width: 103, height: 92, borderRadius: 32, transform: [{ rotate: '-8deg' }] },
    orbit: { left: 24, top: 14, width: 120, height: 104, borderRadius: 36, borderStyle: 'dashed', transform: [{ rotate: '13deg' }] },
    ground: { opacity: 0 },
    bird: { left: 40, top: 4, transform: [{ rotate: '7deg' }] },
    prop: { right: 7, bottom: 4, width: 126, height: 48, transform: [{ rotate: '-2deg' }] },
    propRadius: 12,
    dotOne: { top: 13, left: 26 },
    dotTwo: { bottom: 14, right: 17 },
  },
  insights: {
    halo: { left: 42, top: 10, width: 96, height: 100, borderRadius: 34 },
    orbit: { left: 18, top: 13, width: 140, height: 105, borderRadius: 52, borderStyle: 'dotted', transform: [{ rotate: '8deg' }] },
    ground: { left: 20, width: 122, height: 5 },
    bird: { left: 22, top: 8 },
    prop: { right: 0, bottom: 11, width: 51, height: 47, transform: [{ rotate: '-5deg' }] },
    propRadius: 9,
    dotOne: { top: 12, left: 27 },
    dotTwo: { bottom: 19, right: 20 },
  },
}
