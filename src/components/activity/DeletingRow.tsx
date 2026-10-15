import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, type LayoutChangeEvent } from 'react-native'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Icon } from '@/src/components/shared/Icon'
import { Trash } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'

export function DeletingRow({
  active,
  onDone,
  children,
}: {
  active: boolean
  onDone: () => void
  children: React.ReactNode
}) {
  const { tokens } = useTheme()
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null)
  const pillProgress = useSharedValue(0)
  const height = useSharedValue(0)
  const opacity = useSharedValue(1)
  // `onDone` is a new function every render of the parent list; reading it via
  // a ref inside the animation's finish callback means this effect never has
  // to list it as a dep (which would restart the delete animation on any
  // unrelated parent re-render mid-delete).
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  // Must be a stable function *defined on the JS runtime*. `runOnJS` (now
  // `scheduleOnRN`) rejects a closure created inside the worklet with
  // "Locally defined function passed to scheduleOnRN", and that throw comes
  // out of an animation callback on the UI thread, which crashes the app.
  // True from the moment a delete is confirmed until `onDone` runs. `onDone`
  // is what actually sends the delete, so a row unmounted mid-collapse (a page
  // or filter change, switching Activity to the feed) still has to call it.
  const pendingRef = useRef(false)
  const finish = useCallback(() => {
    if (!pendingRef.current) return
    pendingRef.current = false
    onDoneRef.current()
  }, [])
  useEffect(() => finish, [finish])

  useEffect(() => {
    if (!active) {
      pendingRef.current = false
      return
    }
    pendingRef.current = true
    if (measuredHeight === null) return
    // Reset first: a row whose previous delete failed is left collapsed, and
    // withTiming to a value it already holds finishes with no animation.
    pillProgress.value = 0
    opacity.value = 1
    height.value = measuredHeight
    pillProgress.value = withTiming(1, { duration: 180 }, (finished) => {
      if (!finished) return
      height.value = withTiming(0, { duration: 220 })
      opacity.value = withTiming(0, { duration: 220 }, (done) => {
        if (done) runOnJS(finish)()
      })
    })
  }, [active, measuredHeight, height, opacity, pillProgress, finish])

  const containerStyle = useAnimatedStyle(() => ({
    height: active && measuredHeight !== null ? height.value : undefined,
    opacity: active ? opacity.value : 1,
  }))
  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: pillProgress.value }],
    opacity: pillProgress.value,
  }))

  function onLayout(e: LayoutChangeEvent) {
    setMeasuredHeight((h) => h ?? e.nativeEvent.layout.height)
  }

  return (
    <Animated.View style={[styles.container, containerStyle]} onLayout={onLayout}>
      {children}
      {active && (
        <Animated.View pointerEvents="none" style={[styles.overlay, overlayStyle, { backgroundColor: tokens.coral }]}>
          <Icon icon={Trash} size={22} color="#fff" weight="bold" />
        </Animated.View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    transformOrigin: 'right',
  },
})
