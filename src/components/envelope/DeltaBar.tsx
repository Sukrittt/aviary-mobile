import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef, useState } from 'react'
import { View, Text, Animated, Easing, StyleSheet, type LayoutChangeEvent } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { fillColor, fillColorStops } from './ProgressBar'

const clamp = (n: number) => Math.max(0, Math.min(100, n))
// A tiny expense against a large budget (₹10 of ₹6,000 = 0.17%) would
// otherwise render as an invisible sliver — same floor the reference uses.
const MIN_DELTA_PCT = 2.4

const BASE_DELAY = 500
const BASE_DURATION = 1000
export const DELTA_HOLD = 500
export const DELTA_DELAY = BASE_DELAY + BASE_DURATION + DELTA_HOLD
export const DELTA_DURATION = 1000
// Slow acceleration makes each stage legible; a flat exit lets the fill settle
// at the marker instead of hitting it at peak speed like a pure ease-in.
export const DELTA_EASING = Easing.bezier(0.65, 0, 0.75, 1)
// One haptic tick per this much track the fill crosses, so the bar feels like
// a ratchet: a long bar clicks more than a short one, and the ease-in curve
// makes the clicks speed up just like the fill does.
const HAPTIC_STEP_PCT = 1

/** When (ms from `delay`) a fill eased by DELTA_EASING across `spanPct` of
 *  the track crosses each HAPTIC_STEP_PCT. Scheduled as timers rather than an
 *  Animated listener: the segments run on the native driver, whose values
 *  only reach JS asynchronously (and not at all under Jest). */
function hapticTickTimes(spanPct: number, delay: number, duration: number) {
  const times: number[] = []
  const frames = Math.round(duration / 16)
  for (let f = 1, step = 1; f <= frames; f++) {
    while (step * HAPTIC_STEP_PCT <= DELTA_EASING(f / frames) * spanPct) {
      times.push(delay + (f / frames) * duration)
      step++
    }
  }
  return times
}

/**
 * The budget-card bar on the post-log success screen: the base fill grows to
 * where the envelope stood *before* this expense, then a ghost marker pins
 * that spot and a second, brighter segment eases in to show just the delta —
 * so the charge just made reads as a distinct event, not a bar that was
 * simply longer than expected.
 *
 * RN core Animated rather than Reanimated, matching ProgressBar: plain tweens,
 * no worklet, stays renderable under Jest.
 */
export function DeltaBar({ from, to, amount }: { from: number; to: number; amount: number }) {
  const { formatMoney } = useCurrency()

  const { tokens, space, radius, type } = useTheme()
  const [trackWidth, setTrackWidth] = useState(0)
  const [tagWidth, setTagWidth] = useState(0)
  const fromPct = clamp(from)
  const toPct = clamp(to)
  const deltaPct = Math.max(toPct - fromPct, MIN_DELTA_PCT)

  const base = useRef(new Animated.Value(0)).current
  const marker = useRef(new Animated.Value(0)).current
  const delta = useRef(new Animated.Value(0)).current
  const tag = useRef(new Animated.Value(0)).current
  const fillProgress = useRef(new Animated.Value(fromPct)).current

  useEffect(() => {
    if (trackWidth === 0) return
    base.setValue(0)
    marker.setValue(0)
    delta.setValue(0)
    tag.setValue(0)
    fillProgress.setValue(fromPct)
    // Base fill clicks with the lightest selection tick; the delta (the charge
    // just made) clicks a notch heavier and lands with a thud on the marker.
    const timers = [
      ...hapticTickTimes(fromPct, BASE_DELAY, BASE_DURATION).map((t) =>
        setTimeout(() => Haptics.selectionAsync().catch(() => {}), t),
      ),
      ...hapticTickTimes(deltaPct, DELTA_DELAY, DELTA_DURATION).map((t) =>
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), t),
      ),
      setTimeout(
        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
        DELTA_DELAY + DELTA_DURATION,
      ),
    ]
    Animated.timing(base, {
      toValue: 1,
      duration: BASE_DURATION,
      delay: BASE_DELAY,
      easing: DELTA_EASING,
      useNativeDriver: true,
    }).start()
    Animated.timing(fillProgress, {
      toValue: toPct,
      duration: DELTA_DURATION,
      delay: DELTA_DELAY,
      easing: DELTA_EASING,
      useNativeDriver: false,
    }).start()
    Animated.timing(marker, {
      toValue: 1,
      duration: 300,
      delay: DELTA_DELAY,
      easing: Easing.bezier(0.2, 0.9, 0.25, 1),
      useNativeDriver: false,
    }).start()
    Animated.timing(delta, {
      toValue: 1,
      duration: DELTA_DURATION,
      delay: DELTA_DELAY,
      easing: DELTA_EASING,
      useNativeDriver: true,
    }).start()
    Animated.timing(tag, {
      toValue: 1,
      duration: 340,
      delay: DELTA_DELAY + 300,
      easing: Easing.bezier(0.2, 0.9, 0.25, 1),
      useNativeDriver: false,
    }).start()
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackWidth, fromPct, toPct])

  const colorStops = fillColorStops(fromPct, toPct, tokens)
  const fill =
    toPct > fromPct
      ? fillProgress.interpolate({
          inputRange: colorStops.inputRange,
          outputRange: colorStops.outputRange,
        })
      : fillColor(toPct, tokens)
  const baseWidth = (fromPct / 100) * trackWidth
  const deltaLeft = (fromPct / 100) * trackWidth
  const deltaWidth = (deltaPct / 100) * trackWidth
  const markerScale = marker.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
  const tagOpacity = tag
  // Measure the pill so long amounts and markers near 100% stay in the card.
  const maxTagLeft = Math.max(0, trackWidth - tagWidth)
  const tagLeft = tagWidth > 0 ? Math.min(deltaLeft, maxTagLeft) : 0
  const tagTranslate = tag.interpolate({
    inputRange: [0, 1],
    outputRange: [Math.min(4, maxTagLeft - tagLeft), 0],
  })

  return (
    <View>
      <View
        testID="delta-bar-wrap"
        style={styles.trackWrap}
        onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <View testID="delta-bar-track" style={[styles.track, { backgroundColor: tokens.borderStrong }]}>
          {/* Muted on purpose: the delta segment below is what should read as
              "new" — an equal-brightness base made the whole bar look like a
              single static fill instead of two beats. */}
          <Animated.View
            testID="delta-bar-base"
            style={[styles.fill, styles.base, { width: baseWidth, transform: [{ scaleX: base }] }]}
          >
            <Animated.View
              testID="delta-bar-base-color"
              style={[styles.fillColor, { backgroundColor: fill }]}
            />
          </Animated.View>
          <Animated.View
            testID="delta-bar-delta"
            style={[styles.fill, { left: deltaLeft, width: deltaWidth, transform: [{ scaleX: delta }] }]}
          >
            <Animated.View
              testID="delta-bar-delta-color"
              style={[styles.fillColor, { backgroundColor: fill }]}
            />
          </Animated.View>
        </View>
        {/* Outside the track's own overflow:hidden clip — a 20px marker on an
            8px bar needs to bleed above/below it. */}
        <Animated.View
          testID="delta-bar-marker"
          style={[
            styles.marker,
            { left: deltaLeft, backgroundColor: tokens.text, transform: [{ scaleY: markerScale }] },
          ]}
        />
      </View>
      <View style={[styles.tagRow, { marginTop: space.xs }]}>
        <Animated.View
          testID="delta-bar-tag"
          onLayout={(e: LayoutChangeEvent) => setTagWidth(e.nativeEvent.layout.width)}
          style={[styles.tag, { left: tagLeft, opacity: tagOpacity, transform: [{ translateX: tagTranslate }] }]}
        >
          <Animated.View style={[styles.tagPill, { backgroundColor: fill, borderRadius: radius.full }]}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: tokens.bg, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>
              {`+${formatMoney(Math.round(amount))}`}
            </Text>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  trackWrap: { height: 8 },
  track: { flex: 1, borderRadius: 100, overflow: 'hidden' },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 100,
    overflow: 'hidden',
    transformOrigin: 'left',
  },
  fillColor: { position: 'absolute', inset: 0, borderRadius: 100 },
  base: { opacity: 0.55 },
  marker: { position: 'absolute', top: -6, width: 2, height: 20, borderRadius: 2, opacity: 0.85 },
  tagRow: { height: 22 },
  tag: { position: 'absolute', maxWidth: '100%' },
  tagPill: { paddingVertical: 4, paddingHorizontal: 9 },
})
