import { useEffect, type ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { ArrowUpRight } from '@/src/components/shared/icons'
import Svg, { Circle, G, Path, Rect } from 'react-native-svg'
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
type SceneKey = Exclude<Subject, 'recurring'> | Mood

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

/** A subject keeps its own scene in its usual mood; any other mood (a filter
 * with no results, a list that hasn't started) shows the plain mood scene. */
export function sceneFor(subject: Subject, mood?: Mood): SceneKey {
  const resolved = mood ?? SUBJECT_MOODS[subject]
  if (resolved !== SUBJECT_MOODS[subject]) return resolved
  return subject === 'recurring' ? 'snoozing' : subject
}

// Scenes are drawn in the 512-unit bird artboard and fit into a 176x140 canvas.
// Every layer is a full-size Svg over the same padded viewBox so animated
// layers stay aligned and props that poke past the frame aren't clipped.
const CANVAS = { width: 176, height: 140 }
const PAD = 40

interface Frame {
  x: number
  y: number
  k: number
  left: number
  top: number
  width: number
  height: number
  viewBox: string
}

function frame(x: number, y: number, w: number, h: number): Frame {
  const k = Math.min(CANVAS.width / w, CANVAS.height / h)
  return {
    x,
    y,
    k,
    left: (CANVAS.width - w * k) / 2 - PAD * k,
    top: (CANVAS.height - h * k) / 2 - PAD * k,
    width: (w + PAD * 2) * k,
    height: (h + PAD * 2) * k,
    viewBox: `${x - PAD} ${y - PAD} ${w + PAD * 2} ${h + PAD * 2}`,
  }
}

const WIDE = frame(30, 70, 480, 370)
const TALL = frame(30, 70, 480, 400)
const BOX = frame(30, 40, 480, 400)

/** Artboard point as a transform origin in the layer's own pixels. */
function pivot(f: Frame, x: number, y: number): [number, number, number] {
  return [(x - f.x + PAD) * f.k, (y - f.y + PAD) * f.k, 0]
}

function Layer({
  f,
  style,
  children,
  overlay,
}: {
  f: Frame
  style?: StyleProp<AnimatedStyle<ViewStyle>>
  children: ReactNode
  overlay?: ReactNode
}) {
  return (
    <Animated.View style={[{ position: 'absolute', left: f.left, top: f.top, width: f.width, height: f.height }, style]}>
      <Svg width={f.width} height={f.height} viewBox={f.viewBox}>
        {children}
      </Svg>
      {overlay}
    </Animated.View>
  )
}

const inOut = Easing.inOut(Easing.ease)

/** CSS-style keyframes: [value, ms to reach it] steps, looped forever. */
function keyframes(steps: [number, number][], easing = inOut) {
  const [first, ...rest] = steps.map(([value, duration]) => withTiming(value, { duration, easing }))
  return withRepeat(withSequence(first, ...rest), -1, false)
}

/** Starts an animation on mount. Reduced motion parks it on `still` instead. */
function useMotion(start: () => number, still = 0) {
  const reduceMotion = useReducedMotion()
  const value = useSharedValue(reduceMotion ? still : 0)
  useEffect(() => {
    if (reduceMotion) {
      value.value = still
      return
    }
    value.value = start()
    return () => cancelAnimation(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion])
  return value
}

const BOB = { duration: 2400, easing: Easing.bezier(0.77, 0, 0.175, 1) }
const BODY_CENTER = { x: 245, y: 248 }
const NECK = { x: 250, y: 340 }

function useBob(f: Frame, dx = 0, dy = 0) {
  const bob = useMotion(() => withRepeat(withTiming(1, BOB), -1, true))
  return useAnimatedStyle(() => ({
    transformOrigin: pivot(f, BODY_CENTER.x + dx, BODY_CENTER.y + dy),
    transform: [{ translateY: bob.value * -3 * f.k }, { rotate: `${bob.value * -1.5}deg` }],
  }))
}

interface SceneProps {
  ink: string
  eye: string
  accent: string
}

function Legs({ ink }: { ink: string }) {
  return (
    <>
      <Rect x={224} y={340} width={17} height={46} rx={8.5} fill={ink} />
      <Rect x={259} y={340} width={17} height={46} rx={8.5} fill={ink} />
    </>
  )
}

function Perch({ ink }: { ink: string }) {
  return (
    <>
      <Legs ink={ink} />
      <Rect x={128} y={379} width={256} height={26} rx={13} fill={ink} />
    </>
  )
}

function Body({ ink, eye }: { ink: string; eye: string }) {
  return (
    <>
      <Path d={BIRD_BODY_PATH} fill={ink} />
      <Circle {...BIRD_EYE} fill={eye} />
    </>
  )
}

function SearchingScene({ ink, eye, accent }: SceneProps) {
  const scanEase = Easing.bezier(0.77, 0, 0.175, 1)
  const sweep = useMotion(() =>
    withRepeat(
      withSequence(
        withTiming(-1, { duration: 380, easing: scanEase }),
        withTiming(1, { duration: 760, easing: scanEase }),
        withTiming(0, { duration: 380, easing: scanEase }),
        withDelay(880, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    ),
  )
  const lensStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value * 14 }, { translateY: Math.abs(sweep.value) * 3 }],
  }))
  return (
    <>
      <Layer f={WIDE}>
        <Perch ink={ink} />
        <Body ink={ink} eye={eye} />
      </Layer>
      <Layer f={WIDE} style={lensStyle}>
        <Circle cx={306} cy={216} r={42} fill="none" stroke={accent} strokeWidth={14} />
        <Path d="M 337 247 L 378 288" stroke={accent} strokeWidth={18} strokeLinecap="round" />
      </Layer>
    </>
  )
}

/** Places the shared SnoozingBird (square 40 40 460 460 artboard) on a frame. */
function Dozing({ ink, eye, accent, zs = true }: SceneProps & { zs?: boolean }) {
  const f = WIDE
  return (
    <View style={{ position: 'absolute', left: f.left + (40 - f.x + PAD) * f.k, top: f.top + (40 - f.y + PAD) * f.k }}>
      <SnoozingBird size={460 * f.k} color={ink} accent={accent} eyeColor={eye} zs={zs} />
    </View>
  )
}

function SnoozingScene(props: SceneProps) {
  return <Dozing {...props} />
}

function ClearScene({ ink, eye }: SceneProps) {
  const bobStyle = useBob(WIDE)
  return (
    <>
      <Layer f={WIDE}>
        <Perch ink={ink} />
      </Layer>
      <Layer f={WIDE} style={bobStyle}>
        <Body ink={ink} eye={eye} />
      </Layer>
    </>
  )
}

function ExpensesScene({ ink, eye, accent }: SceneProps) {
  const f = WIDE
  const peck = useMotion(() => keyframes([[0, 1210], [12, 220], [6, 154], [13, 176], [0, 440]]))
  const blink = useMotion(() => keyframes([[0, 3864], [1, 84], [1, 126], [0, 126]]))
  const hop = useMotion(() =>
    withRepeat(withTiming(1, { duration: 1900, easing: Easing.bezier(0.3, 0, 0.2, 1) }), -1, true),
  )
  const peckStyle = useAnimatedStyle(() => ({
    transformOrigin: pivot(f, NECK.x, NECK.y),
    transform: [{ rotate: `${peck.value}deg` }],
  }))
  const lidStyle = useAnimatedStyle(() => ({
    transformOrigin: pivot(f, BIRD_EYE.cx, BIRD_EYE.cy - 20),
    transform: [{ scaleY: 0.01 + blink.value * 0.99 }],
  }))
  const coinStyle = useAnimatedStyle(() => ({
    transformOrigin: pivot(f, 452, 384),
    transform: [{ translateY: hop.value * -9 * f.k }, { rotate: `${hop.value * 14}deg` }],
  }))
  return (
    <>
      <Layer f={f}>
        <Perch ink={ink} />
      </Layer>
      <Layer
        f={f}
        style={peckStyle}
        overlay={
          <Layer f={f} style={[{ left: 0, top: 0 }, lidStyle]}>
            <Circle cx={BIRD_EYE.cx} cy={BIRD_EYE.cy} r={20} fill={ink} />
          </Layer>
        }
      >
        <Body ink={ink} eye={eye} />
      </Layer>
      <Layer f={f} style={coinStyle}>
        <Circle cx={452} cy={340} r={38} fill="none" stroke={accent} strokeWidth={13} />
        <Path d="M 452 322 V 358" stroke={accent} strokeWidth={12} strokeLinecap="round" />
      </Layer>
    </>
  )
}

function SubscriptionsScene(props: SceneProps) {
  const f = WIDE
  const turn = useMotion(() => withRepeat(withTiming(1, { duration: 5000, easing: Easing.linear }), -1, false))
  const spinStyle = useAnimatedStyle(() => ({
    transformOrigin: pivot(f, 415, 158),
    transform: [{ rotate: `${turn.value * 360}deg` }],
  }))
  return (
    <>
      <Dozing {...props} zs={false} />
      <Layer f={f} style={spinStyle}>
        <Path d="M 452 150 A 38 38 0 1 1 420 120" fill="none" stroke={props.accent} strokeWidth={13} strokeLinecap="round" />
        <Path d="M 406 104 L 424 122 L 406 140" fill="none" stroke={props.accent} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
      </Layer>
    </>
  )
}

const BARS = [
  { x: 60, y: 440, height: 30 },
  { x: 145, y: 410, height: 60 },
  { x: 230, y: 378, height: 92 },
]

function Bar({ index, color }: { index: number; color: string }) {
  const f = TALL
  const bar = BARS[index]
  const grow = useMotion(
    () => withDelay(index * 120, withTiming(1, { duration: 700, easing: Easing.bezier(0.23, 1, 0.32, 1) })),
    1,
  )
  const growStyle = useAnimatedStyle(() => ({
    transformOrigin: pivot(f, bar.x + 35, 470),
    transform: [{ scaleY: grow.value }],
  }))
  return (
    <Layer f={f} style={growStyle}>
      <Rect x={bar.x} y={bar.y} width={70} height={bar.height} rx={12} fill={color} />
    </Layer>
  )
}

function HoldingsScene({ ink, eye, accent }: SceneProps) {
  const bobStyle = useBob(TALL, 15, -8)
  return (
    <>
      <Layer f={TALL}>
        <G transform="translate(15 -8)">
          <Legs ink={ink} />
        </G>
      </Layer>
      <Layer f={TALL} style={bobStyle}>
        <G transform="translate(15 -8)">
          <Body ink={ink} eye={eye} />
        </G>
      </Layer>
      {BARS.map((_, index) => (
        <Bar key={index} index={index} color={accent} />
      ))}
    </>
  )
}

function ScansScene({ ink, eye, accent }: SceneProps) {
  const f = WIDE
  const scan = useMotion(() =>
    withRepeat(withTiming(1, { duration: 2600, easing: Easing.bezier(0.45, 0, 0.55, 1) }), -1, true),
  )
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scan.value * 170 * f.k }] }))
  return (
    <>
      <Layer f={f}>
        <Perch ink={ink} />
        <Body ink={ink} eye={eye} />
        <G fill="none" stroke={accent} strokeWidth={14} strokeLinecap="round">
          <Path d="M 70 150 V 110 H 110" />
          <Path d="M 430 110 H 470 V 150" />
          <Path d="M 470 400 V 440 H 430" />
          <Path d="M 110 440 H 70 V 400" />
        </G>
      </Layer>
      <Layer f={f} style={lineStyle}>
        <Rect x={80} y={135} width={380} height={12} rx={6} fill={accent} opacity={0.85} />
      </Layer>
    </>
  )
}

function TypingDot({ cx, delay, color }: { cx: number; delay: number; color: string }) {
  const f = WIDE
  const bounce = useMotion(() => withDelay(delay, keyframes([[-10, 360], [0, 360], [0, 480]])))
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value * f.k }] }))
  return (
    <Layer f={f} style={dotStyle}>
      <Circle cx={cx} cy={139} r={8} fill={color} />
    </Layer>
  )
}

function ChatScene({ ink, eye, accent }: SceneProps) {
  const bobStyle = useBob(WIDE)
  return (
    <>
      <Layer f={WIDE}>
        <Perch ink={ink} />
        <Path
          d="M 392 96 H 496 A 18 18 0 0 1 514 114 V 164 A 18 18 0 0 1 496 182 H 430 L 404 204 V 182 H 392 A 18 18 0 0 1 374 164 V 114 A 18 18 0 0 1 392 96 Z"
          fill="none"
          stroke={accent}
          strokeWidth={13}
          strokeLinejoin="round"
        />
      </Layer>
      <Layer f={WIDE} style={bobStyle}>
        <Body ink={ink} eye={eye} />
      </Layer>
      {[418, 444, 470].map((cx, index) => (
        <TypingDot key={cx} cx={cx} delay={index * 150} color={accent} />
      ))}
    </>
  )
}

function ArchiveScene({ ink, eye, accent }: SceneProps) {
  const f = BOX
  const duck = useMotion(() => keyframes([[0, 1120], [34, 640], [34, 800], [0, 640]]))
  const peekStyle = useAnimatedStyle(() => ({ transform: [{ translateY: duck.value * f.k }] }))
  return (
    <>
      {/* Clipped at the box rim so the bird sinks into the box rather than through it. */}
      <View
        style={{
          position: 'absolute',
          left: f.left,
          top: f.top,
          width: f.width,
          height: (300 - f.y + PAD) * f.k,
          overflow: 'hidden',
        }}
      >
        <Layer f={f} style={[{ left: 0, top: 0 }, peekStyle]}>
          <Body ink={ink} eye={eye} />
        </Layer>
      </View>
      <Layer f={f}>
        <Path
          d="M 118 300 H 382 V 392 A 20 20 0 0 1 362 412 H 138 A 20 20 0 0 1 118 392 Z"
          fill="none"
          stroke={accent}
          strokeWidth={13}
          strokeLinejoin="round"
        />
        <Path d="M 98 300 H 402" stroke={accent} strokeWidth={13} strokeLinecap="round" />
        <Path d="M 226 348 H 274" stroke={accent} strokeWidth={12} strokeLinecap="round" />
      </Layer>
    </>
  )
}

function EnvelopesScene({ ink, eye, accent }: SceneProps) {
  const f = TALL
  const tilt = useMotion(() => keyframes([[0, 1200], [9, 450], [9, 900], [0, 450]]))
  const tiltStyle = useAnimatedStyle(() => ({
    transformOrigin: pivot(f, NECK.x, NECK.y - 40),
    transform: [{ rotate: `${tilt.value}deg` }],
  }))
  return (
    <>
      <Layer f={f}>
        <G transform="translate(0 -40)">
          <Legs ink={ink} />
        </G>
      </Layer>
      <Layer f={f} style={tiltStyle}>
        <G transform="translate(0 -40)">
          <Body ink={ink} eye={eye} />
        </G>
      </Layer>
      <Layer f={f}>
        <Rect x={128} y={345} width={256} height={118} rx={20} fill="none" stroke={accent} strokeWidth={13} />
        <Path
          d="M 136 358 L 256 420 L 376 358"
          fill="none"
          stroke={accent}
          strokeWidth={13}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Layer>
    </>
  )
}

function InsightsScene({ ink, eye, accent }: SceneProps) {
  const f = WIDE
  const bobStyle = useBob(f)
  const rock = useMotion(() => withRepeat(withTiming(1, { duration: 2200, easing: inOut }), -1, true))
  const markStyle = useAnimatedStyle(() => ({
    transformOrigin: pivot(f, 440, 231),
    transform: [{ translateY: rock.value * -5 * f.k }, { rotate: `${-6 + rock.value * 14}deg` }],
  }))
  return (
    <>
      <Layer f={f}>
        <Perch ink={ink} />
      </Layer>
      <Layer f={f} style={bobStyle}>
        <Body ink={ink} eye={eye} />
      </Layer>
      <Layer f={f} style={markStyle}>
        <Path d="M 414 140 A 28 28 0 1 1 446 172 Q 440 180 440 196" fill="none" stroke={accent} strokeWidth={13} strokeLinecap="round" />
        <Circle cx={440} cy={222} r={9} fill={accent} />
      </Layer>
    </>
  )
}

/** Bird at full size plus one prop in its own line language; the prop carries the motion. */
const SCENES: Record<SceneKey, (props: SceneProps) => ReactNode> = {
  searching: SearchingScene,
  snoozing: SnoozingScene,
  clear: ClearScene,
  expenses: ExpensesScene,
  subscriptions: SubscriptionsScene,
  holdings: HoldingsScene,
  scans: ScansScene,
  chat: ChatScene,
  archive: ArchiveScene,
  envelopes: EnvelopesScene,
  insights: InsightsScene,
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
  const { tokens, type, space, motion } = useTheme()
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
  const sceneKey = sceneFor(subject, mood)
  const Scene = SCENES[sceneKey]
  const accent = subject === 'holdings'
    ? tokens.mint
    : subject === 'archive'
      ? tokens.blue
      : subject === 'chat'
        ? tokens.violet
        : tokens.accent
  const sceneSize = compact ? 132 : 176

  return (
    <View testID={testID} style={[styles.wrap, compact ? styles.compactWrap : { paddingHorizontal: space.lg, paddingVertical: space.xxl }, style]}>
      <Animated.View
        testID={`empty-state-scene-${sceneKey}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.scene, { width: sceneSize, height: sceneSize * 0.8 }, sceneStyle]}
      >
        <View style={[styles.sceneCanvas, compact && styles.compactCanvas]}>
          <Scene ink={tokens.text} eye={tokens.bg} accent={accent} />
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
  sceneCanvas: { position: 'relative', width: CANVAS.width, height: CANVAS.height },
  compactCanvas: { position: 'absolute', left: -22, top: -17.5, transform: [{ scale: 0.75 }] },
  copy: { alignItems: 'center', maxWidth: 300 },
})
