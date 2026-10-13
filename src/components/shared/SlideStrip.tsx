import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'

const OPEN = { duration: 320, easing: Easing.out(Easing.cubic) }

/**
 * A strip in a gapped column that makes room for itself: on arrival its height
 * (and the column's `gap`) opens so the cards below ease down, then it fades
 * in. On `leaving` it slides off to the right and closes the same way, so the
 * cards rise back. Same beats as Web's savings strip. Only this view's own
 * height animates; the column never animates its layout, which on Fabric could
 * leave cards drawn away from their touch targets (see Home).
 */
export function SlideStrip({
  leaving,
  gap,
  onGone,
  children,
}: {
  leaving: boolean
  gap: number
  onGone: () => void
  children: ReactNode
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const open = useSharedValue(0)
  const shown = useSharedValue(0)
  const x = useSharedValue(0)
  // Same reasons as DeletingRow: a fresh onGone each parent render mustn't
  // restart the animation, and runOnJS needs a stable JS-side function.
  const onGoneRef = useRef(onGone)
  onGoneRef.current = onGone
  const finish = useCallback(() => onGoneRef.current(), [])

  const measured = size !== null
  useEffect(() => {
    if (!measured) return
    open.value = withTiming(1, OPEN)
    shown.value = withDelay(180, withTiming(1, { duration: 240 }))
  }, [measured, open, shown])

  useEffect(() => {
    if (!leaving) return
    // Not measured yet (or in tests, where layout never fires): just finish.
    if (size === null) return finish()
    x.value = withTiming(size.width, { duration: 300, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (!finished) return
      open.value = withTiming(0, OPEN, (done) => {
        if (done) runOnJS(finish)()
      })
    })
    // Only a new `leaving` starts the exit; a re-measure mid-slide mustn't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving])

  const outer = useAnimatedStyle(() => ({
    height: size ? size.height * open.value : 0,
    // At zero height the column's gap would still open; cancel it until we do.
    marginBottom: -gap * (1 - open.value),
  }))
  const inner = useAnimatedStyle(() => ({
    opacity: shown.value * (size ? 1 - x.value / size.width : 1),
    transform: [{ translateX: x.value }, { translateY: (1 - shown.value) * 6 }],
  }))

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout
    setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }))
  }

  return (
    <Animated.View style={[styles.clip, outer]}>
      {/* Absolute, so the clipped box's animated height never squeezes it: it
          always lays out (and measures) at its natural height. */}
      <View style={styles.content} onLayout={onLayout}>
        <Animated.View style={inner}>{children}</Animated.View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  content: { position: 'absolute', top: 0, left: 0, right: 0 },
})
