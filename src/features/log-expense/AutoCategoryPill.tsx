import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { PopIn } from '@/src/components/shared/PopIn'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

// While the AI fallback is looking for a category, the pill's emoji slot rolls
// through the user's own category emojis like a slot machine, then slows down
// and springs onto the pick. Dictionary hits skip the roll and only play the
// landing. A small ✨ badge stays on the pill while the category is one we
// picked, and disappears once the user picks by hand.

export const PICKING_LABEL = 'Picking…'
const ROLL_STEP_MS = 150
const SETTLE_STEPS_MS = [190, 250, 330] as const
const FALLBACK_EMOJIS = ['🍔', '🚕', '🛒', '🎬', '🏠', '💊']
const EMOJI_BOX = 17
// Underdamped so the final emoji overshoots a touch and clunks into place.
const LAND_SPRING = { mass: 0.6, damping: 9, stiffness: 220 }
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
  const [rollIndex, setRollIndex] = useState(0)
  const [stepMs, setStepMs] = useState(ROLL_STEP_MS)
  const [popTick, setPopTick] = useState(0)

  // React to prop changes during render (React's "adjusting state when a prop
  // changes" pattern) so the first frame after thinking ends already knows
  // whether to settle the roll or show the answer.
  if (thinking !== prevThinking || selKey !== prevSelKey) {
    const landed = selKey !== prevSelKey && !!selected && auto
    let next = phase
    if (thinking !== prevThinking) {
      if (thinking) {
        next = 'rolling'
        setStepMs(ROLL_STEP_MS)
      } else {
        next = phase === 'rolling' && landed && !reduceMotion ? 'settling' : 'idle'
      }
    }
    setPrevThinking(thinking)
    setPrevSelKey(selKey)
    if (next !== phase) setPhase(next)
    if (landed && next === 'idle') setPopTick((t) => t + 1)
  }

  useEffect(() => {
    if (phase !== 'rolling' || reduceMotion) return
    const id = setInterval(() => setRollIndex((i) => i + 1), ROLL_STEP_MS)
    return () => clearInterval(id)
  }, [phase, reduceMotion])

  // Decelerate through a few more emojis, then land on the answer.
  useEffect(() => {
    if (phase !== 'settling') return
    const timers: ReturnType<typeof setTimeout>[] = []
    let at = 0
    for (const ms of SETTLE_STEPS_MS) {
      timers.push(setTimeout(() => { setStepMs(ms); setRollIndex((i) => i + 1) }, at))
      at += ms
    }
    timers.push(setTimeout(() => { setPhase('idle'); setPopTick((t) => t + 1) }, at))
    return () => timers.forEach(clearTimeout)
  }, [phase])

  const scale = useSharedValue(1)
  useEffect(() => {
    if (popTick === 0 || reduceMotion) return
    scale.value = withSequence(withTiming(1.09, { duration: 140 }), withSpring(1, POP_SPRING))
  }, [popTick, reduceMotion, scale])
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const busy = phase !== 'idle'
  const pool = rollEmojis.length > 0 ? rollEmojis : FALLBACK_EMOJIS
  const emoji = busy ? (reduceMotion ? '✨' : pool[rollIndex % pool.length]) : selected?.emoji ?? null
  const label = busy ? PICKING_LABEL : selected?.name ?? 'Category'
  const showMarker = auto && !!selected && !busy

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

  const a11yLabel = busy
    ? 'Picking a category'
    : selected
      ? `Category: ${selected.name}${showMarker ? ', picked for you' : ''}`
      : 'Category'

  return (
    <View>
      <Reanimated.View style={popStyle}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={[
            styles.pill,
            {
              backgroundColor: highlighted ? '#ffffff' : 'rgba(255, 255, 255, 0.3)',
              borderRadius: radius.full,
            },
          ]}
        >
          {emoji !== null && (
            <EmojiSlot
              emoji={emoji}
              ms={stepMs}
              settle={!busy}
              animate={!reduceMotion && (busy || auto)}
              fontSize={type.caption}
            />
          )}
          <Reanimated.Text
            numberOfLines={1}
            style={[
              styles.label,
              labelStyle,
              {
                marginLeft: emoji !== null ? space.xs : 0,
                color: highlighted ? tokens.accent : tokens.onAccent,
                fontFamily: fontFamily.bodySemiBold,
              },
            ]}
          >
            {label}
          </Reanimated.Text>
        </Pressable>
      </Reanimated.View>
      {showMarker && (
        <PopIn play={!reduceMotion} delay={0} style={styles.marker}>
          <Text testID="auto-pick-marker" style={styles.markerText}>✨</Text>
        </PopIn>
      )}
    </View>
  )
}

interface SlotProps {
  emoji: string
  ms: number
  /** Spring onto this emoji (the final landing) instead of a plain roll step. */
  settle: boolean
  animate: boolean
  fontSize: number
}

// One-emoji window: the new emoji slides up from below while the old one
// leaves through the top.
function EmojiSlot({ emoji, ms, settle, animate, fontSize }: SlotProps) {
  const [pair, setPair] = useState<{ cur: string; prev: string | null; n: number }>({ cur: emoji, prev: null, n: 0 })
  if (pair.cur !== emoji) setPair({ cur: emoji, prev: pair.cur, n: pair.n + 1 })

  // Mounting mid-landing (a dictionary hit) rolls the first emoji in too.
  const p = useSharedValue(animate ? 0 : 1)
  useEffect(() => {
    if (!animate) { p.value = 1; return }
    p.value = 0
    p.value = settle
      ? withSpring(1, LAND_SPRING)
      : withTiming(1, { duration: ms, easing: Easing.out(Easing.cubic) })
    // Runs once per emoji change; ms/settle/animate are read for that change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair.n])

  const curStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.4),
    transform: [{ translateY: (1 - p.value) * EMOJI_BOX }],
  }))
  const prevStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - p.value * 1.4),
    transform: [{ translateY: -Math.min(1, p.value) * EMOJI_BOX }],
  }))

  // Emoji Text nodes carry no custom fontFamily: a ZWJ+variation-selector
  // emoji sharing a custom-font run can make Android drop the rest of the run.
  return (
    <View style={styles.slot}>
      {pair.prev !== null && (
        <Reanimated.Text style={[styles.slotEmoji, { fontSize }, prevStyle]}>{pair.prev}</Reanimated.Text>
      )}
      <Reanimated.Text style={[styles.slotEmoji, { fontSize }, curStyle]}>{pair.cur}</Reanimated.Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7 },
  label: { fontSize: 12, flexShrink: 1 },
  slot: { width: EMOJI_BOX + 2, height: EMOJI_BOX, overflow: 'hidden' },
  slotEmoji: { position: 'absolute', left: 0, right: 0, top: 0, lineHeight: EMOJI_BOX, textAlign: 'center' },
  marker: {
    position: 'absolute',
    top: -7,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5a1400',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  markerText: { fontSize: 10, lineHeight: 12 },
})
