import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Reanimated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

// While the AI fallback is looking for a category, the pill's emoji slot spins
// like a slot-machine reel through the user's own category emojis, then eases
// out onto the pick with a small overshoot. The reel runs entirely on the UI
// thread (one shared position value), so it stays smooth while JS is busy.
// Quick answers and hand picks skip the spin and roll a single notch.

export const PICKING_LABEL = 'Picking…'
/** How long the reel takes to ease out onto the pick. */
export const SETTLE_MS = 1000
/** Minimum time the reel spins before settling, so spin + settle lasts at least 2s. */
export const MIN_SPIN_MS = 2000 - SETTLE_MS
// Milliseconds per emoji at full spin.
const SPIN_STEP_MS = 85
// Easing.back(s) leaves t=0 at (s + 3)x the average speed. Landing roughly
// this many notches ahead keeps the hand-off from full spin seamless.
const SETTLE_BACK = 1.2
const SETTLE_NOTCHES = SETTLE_MS / ((SETTLE_BACK + 3) * SPIN_STEP_MS)
const FALLBACK_EMOJIS = ['🍔', '🚕', '🛒', '🎬', '🏠', '💊']
// Short pools repeat so the target's slot is always off-screen when it's set.
const MIN_REEL = 8
const EMOJI_BOX = 17
// Underdamped so a single-notch landing overshoots a touch and clunks into place.
const LAND_SPRING = { mass: 0.6, damping: 9, stiffness: 220 }
// The pill's width eases between labels ("Picking…" to the category name).
// Near-critically damped: a soft glide, no wobble.
const WIDTH_SPRING = { mass: 1, damping: 20, stiffness: 110 }
// log-expense pins the pill to the input's right edge with this max width.
export const PILL_MAX_WIDTH = 140
const PAD_X = 12
const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable)
// Same spring as PopIn's mount pop, for taste parity.
const POP_SPRING = { mass: 0.7, damping: 12, stiffness: 160 }

type Phase = 'idle' | 'rolling' | 'settling'

interface Props {
  selected: { emoji: string; name: string } | null
  /** The AI lookup is in flight (already gated by thinkingGate's timing). */
  thinking: boolean
  /** `selected` came from auto-pick, not the user. */
  auto: boolean
  /** Missing-field nudge: the pill turns white with accent text. */
  highlighted: boolean
  rollEmojis: string[]
  onPress: () => void
}

export function AutoCategoryPill({ selected, thinking, auto, highlighted, rollEmojis, onPress }: Props) {
  const { tokens, space, radius, type } = useTheme()
  const reduceMotion = useReducedMotion()

  const selKey = selected ? `${selected.emoji}|${selected.name}` : ''
  const [phase, setPhase] = useState<Phase>(thinking ? 'rolling' : 'idle')
  const [prevThinking, setPrevThinking] = useState(thinking)
  const [prevSelKey, setPrevSelKey] = useState(selKey)
  const [popTick, setPopTick] = useState(0)

  // React to prop changes during render (React's "adjusting state when a prop
  // changes" pattern) so the first frame after thinking ends already knows
  // whether to settle the reel or show the answer.
  if (thinking !== prevThinking || selKey !== prevSelKey) {
    const changed = selKey !== prevSelKey && !!selected
    let next = phase
    if (thinking !== prevThinking) {
      // Any answer, even the one already showing, eases the reel out onto it.
      next = thinking ? 'rolling' : phase === 'rolling' && !!selected && !reduceMotion ? 'settling' : 'idle'
    }
    setPrevThinking(thinking)
    setPrevSelKey(selKey)
    if (next !== phase) setPhase(next)
    if (changed && next === 'idle') setPopTick((t) => t + 1)
  }

  useEffect(() => {
    if (phase !== 'settling') return
    const id = setTimeout(() => {
      setPhase('idle')
      setPopTick((t) => t + 1)
      Haptics.selectionAsync().catch(() => {})
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [phase])

  const scale = useSharedValue(1)
  useEffect(() => {
    if (popTick === 0 || reduceMotion) return
    scale.value = withSequence(withTiming(1.09, { duration: 140 }), withSpring(1, POP_SPRING))
  }, [popTick, reduceMotion, scale])
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const busy = phase !== 'idle'
  const pool = rollEmojis.length > 0 ? rollEmojis : FALLBACK_EMOJIS
  const label = busy ? PICKING_LABEL : selected?.name ?? 'Pick a category'
  const pickedForYou = auto && !!selected && !busy

  const labelIn = useSharedValue(1)
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (reduceMotion) return
    labelIn.value = 0
    labelIn.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) })
  }, [label, reduceMotion, labelIn])
  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelIn.value,
    transform: [{ translateY: (1 - labelIn.value) * 4 }],
  }))

  // The pill is pinned by its right edge, so its width is sprung explicitly
  // (a layout transition only moves the right side). An off-screen copy of
  // the content measures the target width; the real content is right-aligned
  // and clipped, so it stays still while the left edge glides.
  const hasEmoji = busy || !!selected
  const labelMax = PILL_MAX_WIDTH - 2 * PAD_X - (hasEmoji ? EMOJI_BOX + 2 + space.xs : 0)
  const [contentW, setContentW] = useState(0)
  const width = useSharedValue(0)
  const widthGeneration = useRef(0)
  const [widthReadyLabel, setWidthReadyLabel] = useState<string | null>(null)
  // Ignore completions from a width spring superseded by a newer measurement.
  const markWidthReady = useCallback((measuredLabel: string, generation: number) => {
    if (widthGeneration.current === generation) setWidthReadyLabel(measuredLabel)
  }, [])
  useEffect(() => () => {
    widthGeneration.current += 1
    cancelAnimation(width)
  }, [width])
  const onMeasure = (measured: number) => {
    // Android rounds text widths down a hair; give it a pixel so it doesn't ellipsize.
    const w = Math.ceil(measured) + 1
    const generation = ++widthGeneration.current
    setWidthReadyLabel(null)
    setContentW(w)
    if (width.value === 0 || reduceMotion) {
      width.value = w + 2 * PAD_X
      markWidthReady(label, generation)
    } else {
      width.value = withSpring(w + 2 * PAD_X, WIDTH_SPRING, (finished) => {
        if (finished) runOnJS(markWidthReady)(label, generation)
      })
    }
  }
  const widthStyle = useAnimatedStyle(() => (width.value > 0 ? { width: width.value } : {}))
  const labelText = (style: object) => (
    <Reanimated.Text
      numberOfLines={1}
      style={[
        styles.label,
        style,
        {
          maxWidth: labelMax,
          marginLeft: hasEmoji ? space.xs : 0,
          color: highlighted ? tokens.accent : tokens.onAccent,
          fontFamily: fontFamily.bodySemiBold,
        },
      ]}
    >
      {label}
    </Reanimated.Text>
  )

  const a11yLabel = busy
    ? 'Picking a category'
    : selected
      ? `Category: ${selected.name}${pickedForYou ? ', picked for you' : ''}`
      : 'Category'

  return (
    <Reanimated.View style={popStyle}>
      <View style={styles.measure} pointerEvents="none" aria-hidden>
        <View key={label} style={styles.row} onLayout={(e) => onMeasure(e.nativeEvent.layout.width)}>
          {hasEmoji && <View style={styles.slot} />}
          {labelText({})}
        </View>
      </View>
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={[
          styles.pill,
          widthStyle,
          {
            backgroundColor: highlighted ? '#ffffff' : 'rgba(255, 255, 255, 0.3)',
            borderRadius: radius.full,
          },
        ]}
      >
        <View style={[styles.row, contentW > 0 && { width: contentW }]}>
        {reduceMotion ? (
          hasEmoji && (
            <Text style={[styles.staticEmoji, { fontSize: type.caption }]}>{busy ? '✨' : selected!.emoji}</Text>
          )
        ) : (
          hasEmoji && (
            <EmojiReel phase={phase} target={selected?.emoji ?? null} rollIn={mounted.current} pool={pool} fontSize={type.caption} />
          )
        )}
        {labelText(labelStyle)}
        </View>
      </AnimatedPressable>
      {popTick > 0 && !!selected && widthReadyLabel === label && !busy && !reduceMotion && <PickBurst key={popTick} />}
    </Reanimated.View>
  )
}

// Fan of short lines that flicks out of the pill's top edge when a category
// lands, so the pick feels like it clicked into place. Remounted per landing.
const BURST_ANGLES = [-66, -44, -22, 0, 22, 44, 66]

function PickBurst() {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })
  }, [p])
  return (
    <View testID="pick-burst" pointerEvents="none" style={styles.burst}>
      {BURST_ANGLES.map((deg) => <BurstLine key={deg} deg={deg} p={p} />)}
    </View>
  )
}

function BurstLine({ deg, p }: { deg: number; p: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    // Snaps in, then fades as it flies out and shortens.
    opacity: p.value < 0.15 ? p.value / 0.15 : 1 - (p.value - 0.15) / 0.85,
    transform: [{ rotate: `${deg}deg` }, { translateY: -6 - p.value * 9 }, { scaleY: 1 - p.value * 0.6 }],
  }))
  return <Reanimated.View style={[styles.burstLine, style]} />
}

interface ReelProps {
  phase: Phase
  /** The emoji to land on; null while nothing is picked yet. */
  target: string | null
  /** Roll the first emoji in from a notch back, instead of mounting still. */
  rollIn: boolean
  pool: string[]
  fontSize: number
}

// One-emoji window onto an endless reel. `pos` is the reel's position in
// emoji units; each item places itself at its wrapped distance from it, so the
// reel loops without ever re-rendering. To land on a target, the slot a few
// notches ahead (still off-screen) has its emoji swapped for the target and
// the reel eases onto that slot.
function EmojiReel({ phase, target, rollIn, pool, fontSize }: ReelProps) {
  const strip = useMemo(() => {
    let s = pool
    while (s.length < MIN_REEL) s = s.concat(pool)
    return s
  }, [pool])
  const n = strip.length
  const pos = useSharedValue(phase === 'idle' && target && rollIn ? -1 : 0)
  const [overrides, setOverrides] = useState<Record<number, string>>(() => (target ? { 0: target } : {}) as Record<number, string>)
  const landed = useRef<string | null>(phase === 'idle' && !rollIn ? target : null)

  useEffect(() => {
    const land = (at: number, anim: number) => {
      setOverrides((o) => ({ ...o, [((at % n) + n) % n]: target! }))
      pos.value = anim
      landed.current = target
    }
    if (phase === 'rolling') {
      cancelAnimation(pos)
      const from = Math.round(pos.value)
      landed.current = null
      // Ease up to speed over the first notch (Easing.in(quad) ends at exactly
      // full speed), then spin at a constant rate forever.
      pos.value = withSequence(
        withTiming(from + 1, { duration: SPIN_STEP_MS * 2, easing: Easing.in(Easing.quad) }),
        withRepeat(withTiming(from + 1 + n, { duration: SPIN_STEP_MS * n, easing: Easing.linear }), -1),
      )
      return
    }
    if (!target || landed.current === target) return
    cancelAnimation(pos)
    const p = pos.value
    if (phase === 'settling') {
      const at = Math.ceil(p + SETTLE_NOTCHES - 0.5)
      land(at, withTiming(at, { duration: SETTLE_MS, easing: Easing.out(Easing.back(SETTLE_BACK)) }))
    } else {
      const at = Math.round(p) + 1
      land(at, withSpring(at, LAND_SPRING))
    }
    // Only phase and target changes move the reel; the rest is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, target])

  // Emoji Text nodes carry no custom fontFamily: a ZWJ+variation-selector
  // emoji sharing a custom-font run can make Android drop the rest of the run.
  return (
    <View style={styles.slot}>
      {strip.map((emoji, i) => (
        <ReelItem key={i} index={i} count={n} pos={pos} fontSize={fontSize} emoji={overrides[i] ?? emoji} />
      ))}
    </View>
  )
}

interface ReelItemProps {
  index: number
  count: number
  pos: SharedValue<number>
  fontSize: number
  emoji: string
}

function ReelItem({ index, count, pos, fontSize, emoji }: ReelItemProps) {
  const style = useAnimatedStyle(() => {
    const wrapped = (((index - pos.value) % count) + count) % count
    // Signed distance from the window, in emoji units: 0 is dead centre.
    const y = wrapped > count / 2 ? wrapped - count : wrapped
    const away = Math.min(1, Math.abs(y))
    // Curved like a drum: items tilt, shrink and fade as they leave the window.
    return {
      opacity: 1 - away * 0.8,
      transform: [
        { perspective: 120 },
        { translateY: y * EMOJI_BOX },
        { rotateX: `${-y * 50}deg` },
        { scale: 1 - away * 0.2 },
      ],
    }
  })
  return <Reanimated.Text style={[styles.slotEmoji, { fontSize }, style]}>{emoji}</Reanimated.Text>
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: PAD_X, paddingVertical: 7, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  burst: { position: 'absolute', top: 0, left: '50%', width: 0, height: 0 },
  burstLine: { position: 'absolute', left: -1, top: -4, width: 2, height: 8, borderRadius: 1, backgroundColor: '#ffffff' },
  // Wide enough that nothing up to PILL_MAX_WIDTH is squeezed while measuring.
  measure: { position: 'absolute', top: 0, left: 0, width: 300, opacity: 0, flexDirection: 'row' },
  label: { fontSize: 12 },
  slot: { width: EMOJI_BOX + 2, height: EMOJI_BOX, overflow: 'hidden' },
  slotEmoji: { position: 'absolute', left: 0, right: 0, top: 0, lineHeight: EMOJI_BOX, textAlign: 'center' },
  staticEmoji: { lineHeight: EMOJI_BOX },
})
