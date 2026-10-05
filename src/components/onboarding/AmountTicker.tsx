import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolateColor,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated'
import { Play } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'


// SetupWizard.dc.html:416-456 (ticker), reworked per-character into an
// odometer roll: each digit that actually changed scrolls past its old value
// like a mechanical counter, instead of the whole number dropping in fresh.
// Unchanged characters (₹, commas, digits that stayed the same) sit still.
// The roll and color flash are for quick-pick jumps only (delta !== 0):
// animating every keypad press read as jarring, so typed digits just appear.
export function AmountTicker({
  text,
  tick,
  dir,
  delta,
  dimmed,
  fontSize = 46,
}: {
  text: string
  tick: number
  dir: 1 | -1
  delta: number
  dimmed: boolean
  fontSize?: number
}) {
  const { tokens } = useTheme()
  const flash = useSharedValue(1)
  const jump = delta !== 0

  // usePrevious pattern: during this render, prevTextRef still holds the text
  // from the render before, so slots can diff old vs new before it's overwritten.
  const prevTextRef = useRef(text)
  const prevText = prevTextRef.current
  useEffect(() => {
    prevTextRef.current = text
  }, [text])

  useEffect(() => {
    if (dimmed) return
    if (!jump) {
      flash.value = 1
      return
    }
    flash.value = 0
    flash.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, dimmed])

  const flashColor = dir >= 0 ? tokens.mint : tokens.coral
  const colorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(flash.value, [0, 1], [flashColor, tokens.text]),
  }))

  const rowHeight = Math.round(fontSize * 1.2)
  const chars = text.split('')
  const prevChars = prevText.split('')

  return (
    <View style={styles.wrap}>
      {jump && <DeltaBadge tick={tick} delta={delta} />}
      <View style={styles.row}>
        {chars.map((ch, i) => {
          const fromRight = chars.length - 1 - i
          const prevIndex = prevChars.length - 1 - fromRight
          const oldCh = prevIndex >= 0 ? prevChars[prevIndex] : ''
          return (
            <Digit
              key={i}
              oldChar={jump ? oldCh : ch}
              newChar={ch}
              dir={dir}
              tick={tick}
              rowHeight={rowHeight}
              fontSize={fontSize}
              dimmed={dimmed}
              colorStyle={colorStyle}
              textColor={tokens.text3}
            />
          )
        })}
      </View>
    </View>
  )
}

function Digit({
  oldChar,
  newChar,
  dir,
  tick,
  rowHeight,
  fontSize,
  dimmed,
  colorStyle,
  textColor,
}: {
  oldChar: string
  newChar: string
  dir: 1 | -1
  tick: number
  rowHeight: number
  fontSize: number
  dimmed: boolean
  colorStyle: ReturnType<typeof useAnimatedStyle>
  textColor: string
}) {
  const changed = oldChar !== newChar
  const translateY = useSharedValue(changed && dir < 0 ? -rowHeight : 0)

  useEffect(() => {
    if (!changed) {
      translateY.value = 0
      return
    }
    translateY.value = dir >= 0 ? 0 : -rowHeight
    translateY.value = withTiming(dir >= 0 ? -rowHeight : 0, { duration: 340, easing: Easing.out(Easing.cubic) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  const columnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))
  const textStyle = [styles.char, { fontSize, height: rowHeight, lineHeight: rowHeight, fontFamily: fontFamily.displaySemiBold }]
  const dimStyle = dimmed ? { color: textColor } : colorStyle

  if (!changed) {
    return (
      <View style={{ height: rowHeight }}>
        <Animated.Text style={[textStyle, dimStyle]}>{newChar}</Animated.Text>
      </View>
    )
  }

  const top = dir >= 0 ? oldChar : newChar
  const bottom = dir >= 0 ? newChar : oldChar

  return (
    <View style={{ height: rowHeight, overflow: 'hidden' }}>
      <Animated.View style={columnStyle}>
        <Animated.Text style={[textStyle, dimStyle]}>{top}</Animated.Text>
        <Animated.Text style={[textStyle, dimStyle]}>{bottom}</Animated.Text>
      </Animated.View>
    </View>
  )
}

function DeltaBadge({ tick, delta }: { tick: number; delta: number }) {
  const { formatMoney } = useCurrency()

  const { tokens } = useTheme()
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(0)

  useEffect(() => {
    opacity.value = 0
    translateY.value = 6
    opacity.value = withSequence(
      withTiming(1, { duration: 170 }),
      withDelay(460, withTiming(1, { duration: 1 })),
      withTiming(0, { duration: 350 }),
    )
    translateY.value = withSequence(
      withTiming(0, { duration: 170 }),
      withDelay(460, withTiming(-4, { duration: 1 })),
      withTiming(-14, { duration: 350 }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }))
  const label = delta > 0 ? `+${formatMoney(delta)}` : `−${formatMoney(-delta)}`
  const color = delta > 0 ? tokens.mint : tokens.coral

  return (
    <Animated.View key={tick} style={[styles.delta, styles.deltaRow, style]}>
      <View style={{ transform: [{ rotate: delta > 0 ? '-90deg' : '90deg' }] }}>
        <Play size={10} color={color} fill={color} />
      </View>
      <Animated.Text style={{ color, fontFamily: fontFamily.bodyMedium, fontSize: 11, fontWeight: '500' }}>
        {label}
      </Animated.Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center' },
  char: { letterSpacing: -0.5, textAlign: 'center' },
  delta: { position: 'absolute', top: -14, left: 0, right: 0 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
})
