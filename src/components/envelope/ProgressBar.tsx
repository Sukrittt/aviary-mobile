import { useProgressWidth } from '@/src/components/ui/useProgressWidth'
import { useTheme } from '@/src/theme/ThemeProvider'
import type { ThemeTokens } from '@/src/theme/tokens'
import { useState } from 'react'
import { Animated,StyleSheet,View,type LayoutChangeEvent } from 'react-native'
export { FILL_DELAY,FILL_DURATION } from '@/src/components/ui/useProgressWidth'

const clamp = (n: number) => Math.max(0, Math.min(100, n))

/** The fill waits out the block's own entrance before it moves, then takes long
 *  enough to be watched — at motion.slow it was over before the eye found it. */
// Exported so callers (the "% used" readout) can tween in lockstep with the bar.

/** Where the colour changes hands. The animated fill crosses these as it grows,
 *  so the bar reddens on the way rather than starting out at its end state. */
const THRESHOLDS = [75, 100]

function colorStops(
  from: number,
  to: number,
  colorAt: (pct: number) => string,
): { inputRange: number[]; outputRange: string[] } {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const inputRange = [lo, ...THRESHOLDS.filter((threshold) => threshold > lo && threshold < hi), hi]
  return { inputRange, outputRange: inputRange.map(colorAt) }
}

// Exported for the Android widget (src/widgets/EnvelopeWidget.tsx), which
// draws its own bars via RemoteViews primitives but wants the same thresholds.
// No red tier: spentPct caps at 100, so red is left for overspent (the `over`
// prop) and almost-out stays amber.
export function fillColor(pct: number, tokens: ThemeTokens): string {
  return pct === 100 ? tokens.text3 : pct > 75 ? tokens.warn : tokens.mint
}

// Tinted-pill background to pair with fillColor's text/dot color — the "N%
// used" badge on the success card.
export function fillSoftColor(pct: number, tokens: ThemeTokens): string {
  return pct === 100 ? tokens.borderStrong : pct > 75 ? tokens.warnSoft : tokens.mintSoft
}

/** Percentage-space color stops shared by every animated envelope surface. */
export function fillColorStops(from: number, to: number, tokens: ThemeTokens) {
  return colorStops(from, to, (pct) => fillColor(pct, tokens))
}

export function fillSoftColorStops(from: number, to: number, tokens: ThemeTokens) {
  return colorStops(from, to, (pct) => fillSoftColor(pct, tokens))
}

/** Spend-vs-assigned bar.
 * over -> coral, pct===100 -> muted, >75 -> warn, else mint.
 *
 * `from` turns the fill into a tween: the bar holds at that percentage and then
 * slides to `pct`. Reserve it for showing a *change* (the expense that was just
 * logged eating into its envelope) — a list of bars all animating is noise. */
export function ProgressBar({ pct, from, over }: { pct: number; from?: number; over?: boolean }) {
  const { tokens } = useTheme()
  const [trackWidth, setTrackWidth] = useState(0)
  const clamped = clamp(pct)

  const animated = from != null
  const onLayout = animated ? (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width) : undefined

  return (
    <View
      testID="progress-bar-track"
      style={[styles.track, { backgroundColor: tokens.borderStrong }]}
      onLayout={onLayout}
    >
      {animated ? (
        <AnimatedFill from={clamp(from)} to={clamped} trackWidth={trackWidth} />
      ) : (
        <View
          testID="progress-bar-fill"
          style={[styles.fill, { width: `${clamped}%`, backgroundColor: over ? tokens.coral : fillColor(clamped, tokens) }]}
        />
      )}
    </View>
  )
}

/**
 * RN core Animated rather than Reanimated: a plain width tween with no worklet,
 * and it keeps the primitive renderable under Jest (same call as AmountText).
 *
 * Animates pixels off the measured track rather than a percentage-string
 * interpolation — under Fabric the interpolated `'x%'` width painted as an empty
 * bar until the animation ran, so the starting position was never seen.
 */
function AnimatedFill({ from, to, trackWidth }: { from: number; to: number; trackWidth: number }) {
  const { tokens } = useTheme()
  const width = useProgressWidth(trackWidth, to, from)

  // Driven off the same value as the width, so the colour hands over exactly as
  // the fill passes each threshold instead of being fixed at the end state.
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const stops = fillColorStops(from, to, tokens)
  const color =
    hi > lo && trackWidth > 0
      ? width.interpolate({
          inputRange: stops.inputRange.map((pct) => (pct / 100) * trackWidth),
          outputRange: stops.outputRange,
        })
      : fillColor(to, tokens)

  return <Animated.View testID="progress-bar-fill" style={[styles.fill, { width, backgroundColor: color }]} />
}

const styles = StyleSheet.create({
  track: { height: 5, borderRadius: 100, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 100 },
})
