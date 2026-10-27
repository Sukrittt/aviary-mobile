import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const ROW = 44
const VISIBLE = 5
// A looping wheel is the list repeated this many times, started in the middle,
// and quietly re-centred after each spin, so it never runs out. A plain
// ScrollView, not a FlatList: it lives inside BottomSheet's ScrollView.
const LOOPS = 20

/**
 * An iOS-style picker wheel: rows snap under a highlight band and fade with
 * distance, with a selection tick per row. `loop` makes it wrap around
 * (months); without it, it stops at the ends (years).
 */
export function Wheel({ items, index, onChange, loop = false, accessibilityLabel }: {
  items: string[]
  index: number
  onChange: (index: number) => void
  loop?: boolean
  accessibilityLabel: string
}) {
  const { tokens } = useTheme()
  const n = items.length
  const data = useMemo(() => (loop ? Array.from({ length: n * LOOPS }, (_, i) => items[i % n]) : items), [items, n, loop])
  const start = loop ? n * (LOOPS / 2) + index : index
  const list = useRef<ScrollView>(null)
  const scrollY = useRef(new Animated.Value(start * ROW)).current
  // Where the wheel actually sits, in `data` rows.
  const at = useRef(start)
  const ticked = useRef(start)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Bumped on every landing. A parent that clamps (a month that's over) may keep
  // the index it already had, which re-renders nothing, so the wheel asks itself.
  const [landed, setLanded] = useState(0)

  // An outside change (a clamp, a reset) turns the wheel to the nearest copy of that row.
  useEffect(() => {
    if (((at.current % n) + n) % n === index) return
    const target = loop ? at.current - (((at.current % n) + n) % n) + index : index
    at.current = target
    list.current?.scrollTo({ y: target * ROW, animated: true })
  }, [index, n, loop, landed])
  useEffect(() => () => clearTimeout(settle.current), [])

  function land(y: number) {
    clearTimeout(settle.current)
    const row = Math.max(0, Math.min(data.length - 1, Math.round(y / ROW)))
    at.current = row
    // Snap exactly onto the row: Android can stop a hair short, or between rows inside the sheet's own scroll.
    if (Math.abs(y - row * ROW) > 0.5) list.current?.scrollTo({ y: row * ROW, animated: true })
    // Far from the middle copy: jump back to it, same row, no animation. Invisible, and the wheel keeps going.
    const mid = n * (LOOPS / 2) + (row % n)
    if (loop && Math.abs(row - mid) > n * 4) {
      at.current = ticked.current = mid
      list.current?.scrollTo({ y: mid * ROW, animated: false })
    }
    if (row % n !== index) onChange(row % n)
    setLanded((l) => l + 1)
  }

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y
      // Lands once the wheel goes quiet. Momentum and drag-end events don't arrive reliably inside the sheet.
      clearTimeout(settle.current)
      settle.current = setTimeout(() => land(y), 150)
      const row = Math.round(y / ROW)
      if (row !== ticked.current) {
        ticked.current = row
        Haptics.selectionAsync().catch(() => {})
      }
    },
  })

  return (
    <View
      style={{ height: ROW * VISIBLE, flex: 1 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: items[index] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const next = index + (e.nativeEvent.actionName === 'increment' ? 1 : -1)
        if (loop) onChange((next + n) % n)
        else if (next >= 0 && next < n) onChange(next)
      }}
    >
      <View pointerEvents="none" style={[styles.band, { backgroundColor: tokens.inputBg }]} />
      <Animated.ScrollView
        ref={list}
        contentOffset={{ x: 0, y: start * ROW }}
        // contentOffset isn't honoured everywhere on first layout; this puts it there regardless.
        onLayout={() => list.current?.scrollTo({ y: at.current * ROW, animated: false })}
        contentContainerStyle={{ paddingVertical: ROW * Math.floor(VISIBLE / 2) }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        nestedScrollEnabled
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {data.map((item, i) => {
          const range = [-2, -1, 0, 1, 2].map((d) => (i + d) * ROW)
          const opacity = scrollY.interpolate({ inputRange: range, outputRange: [0.25, 0.5, 1, 0.5, 0.25], extrapolate: 'clamp' })
          const scale = scrollY.interpolate({ inputRange: range, outputRange: [0.86, 0.94, 1, 0.94, 0.86], extrapolate: 'clamp' })
          return (
            <Pressable key={i} style={styles.row} onPress={() => { if (i % n !== index) onChange(i % n) }}>
              <Animated.Text style={[styles.text, { color: tokens.text, fontFamily: fontFamily.bodySemiBold, opacity, transform: [{ scale }] }]}>
                {item}
              </Animated.Text>
            </Pressable>
          )
        })}
      </Animated.ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, top: ROW * Math.floor(VISIBLE / 2), height: ROW, borderRadius: 10 },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 20 },
})
