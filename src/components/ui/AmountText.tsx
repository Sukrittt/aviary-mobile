import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef } from 'react'
import { View, Text, Animated, Easing, StyleSheet, type TextStyle, type StyleProp } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { usePrivacy } from '@/src/context/PrivacyContext'
import { rippleHaptic } from '@/src/lib/haptics'

/**
 * Every money display in the app. Owns three things that were previously
 * re-implemented per screen: INR formatting, the "hide amounts" mask (read
 * straight from PrivacyContext instead of being threaded down as a prop), and
 * tabular figures so digits do not jitter as a value changes.
 *
 * `animate` adds the odometer roll — only the digits that actually changed
 * scroll past their old value. Reserve it for hero numbers; a list of forty
 * rolling rows is noise.
 *
 * `settle` adds a haptic roll (one tick per changed digit, so a bigger change
 * rolls longer) and a small pop as the digits land. For balances that change
 * as the result of an action, not ones the user is typing into.
 */
export function AmountText({
  value,
  size,
  color,
  weight = 'displaySemiBold',
  animate = false,
  style,
  rawText,
  id,
  ignoreHide = false,
  settle = false,
}: {
  value: number
  size: number
  color?: string
  weight?: keyof typeof fontFamily
  animate?: boolean
  style?: StyleProp<TextStyle>
  /** Pre-formatted text to show instead of `formatCurrency(value)` — e.g. a
   * numpad's in-progress string, where rounding through `value` would drop a
   * trailing "." or trailing zero the user just typed. Ignored when amounts
   * are hidden. */
  rawText?: string
  /** Opt out of the "hide amounts" mask. For input/confirmation surfaces where
   * the user is actively typing or has just typed the value themselves —
   * masking their own in-progress entry would be hostile. */
  ignoreHide?: boolean
  /** Seeds the odometer's "previous value" from a module-level cache instead
   * of the current value, keyed by this id — needed only by instances that
   * can remount between an old and new value (e.g. Home's Ready to Assign,
   * which remounts on tab blur/focus) so the roll survives the remount. Omit
   * for instances that stay mounted across the change. */
  id?: string
  settle?: boolean
}) {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const { hideAmounts } = usePrivacy()
  const hide = ignoreHide ? false : hideAmounts
  const text = !hide && rawText !== undefined ? rawText : formatCurrency(value, hide)

  const textStyle: StyleProp<TextStyle> = [
    styles.base,
    { fontSize: size, color: color ?? tokens.text, fontFamily: fontFamily[weight] },
    style,
  ]

  // Masked values have no digits to roll, and a static render avoids animating
  // between "₹••••" and a real amount when the toggle flips.
  if (!animate || hide) {
    return (
      <Text style={textStyle} accessibilityLabel={text}>
        {text}
      </Text>
    )
  }

  return <Odometer text={text} value={value} size={size} textStyle={textStyle} id={id} settle={settle} />
}

// Survives a remount of the Odometer instance that owns a given id, so a
// screen that gets torn down and rebuilt between the old and new value (e.g.
// Home on tab blur/focus) still has a real "previous" to diff against instead
// of seeding from the already-updated value.
const lastSeen = new Map<string, { text: string; value: number }>()

function Odometer({
  text,
  value,
  size,
  textStyle,
  id,
  settle,
}: {
  text: string
  value: number
  size: number
  textStyle: StyleProp<TextStyle>
  id?: string
  settle?: boolean
}) {
  const { motion } = useTheme()
  const scale = useRef(new Animated.Value(1)).current
  // usePrevious: during this render prevRef still holds the previous string/value, so
  // each slot can diff old vs new before it is overwritten.
  const seed = id ? lastSeen.get(id) : undefined
  const prevRef = useRef(seed?.text ?? text)
  const prev = prevRef.current
  // Direction comes from the overall value, not a per-character diff — a
  // single digit going down (19 -> 20, units 9 -> 0) doesn't mean the
  // number decreased.
  const prevValueRef = useRef(seed?.value ?? value)
  const direction: 'up' | 'down' = value < prevValueRef.current ? 'down' : 'up'
  useEffect(() => {
    if (settle && value !== prevValueRef.current) {
      rippleHaptic(changedDigitCount(prevRef.current, text), motion.slow)
      // Swell with the roll, then spring back past 1 and settle as the digits land.
      scale.setValue(1)
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: motion.slow, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      ]).start()
    }
    prevRef.current = text
    prevValueRef.current = value
    if (id) lastSeen.set(id, { text, value })
  }, [text, value, id, settle, motion.slow, scale])

  const rowHeight = Math.round(size * 1.2)
  const chars = text.split('')
  const prevChars = prev.split('')
  // A digit count change (e.g. ₹400 -> ₹0) always means a real value change,
  // even when right-aligning happens to pair a surviving slot with the same
  // character (400's ones digit and 0's only digit are both '0') — without
  // this, that slot silently renders static and, if it's the only survivor,
  // nothing animates at all.
  const lengthChanged = chars.length !== prevChars.length

  return (
    <Animated.View style={[styles.row, { transform: [{ scale }] }]} accessibilityLabel={text} accessible>
      {chars.map((ch, i) => {
        // Align from the right so ₹900 -> ₹1,000 rolls the units column, not everything.
        const prevIndex = prevChars.length - (chars.length - i)
        return (
          <Digit
            key={i}
            oldChar={prevIndex >= 0 ? prevChars[prevIndex] : ''}
            newChar={ch}
            rowHeight={rowHeight}
            textStyle={textStyle}
            direction={direction}
            lengthChanged={lengthChanged}
          />
        )
      })}
    </Animated.View>
  )
}

/** Digit slots that roll between two values, right-aligned like the odometer, plus any added or dropped. */
function changedDigitCount(prev: string, next: string) {
  const a = prev.replace(/\D/g, '')
  const b = next.replace(/\D/g, '')
  let n = Math.abs(a.length - b.length)
  for (let i = 1; i <= Math.min(a.length, b.length); i++) if (a[a.length - i] !== b[b.length - i]) n++
  return Math.max(n, 1)
}

function Digit({
  oldChar,
  newChar,
  rowHeight,
  textStyle,
  direction,
  lengthChanged,
}: {
  oldChar: string
  newChar: string
  rowHeight: number
  textStyle: StyleProp<TextStyle>
  direction: 'up' | 'down'
  lengthChanged: boolean
}) {
  const { motion } = useTheme()
  // Only roll between two digits. Pairing a structural char (₹, `,`, `-`)
  // with a digit or the other structural char — which right-aligned diffing
  // does whenever the string crosses a grouping boundary, e.g. "₹1,000" ->
  // "₹100" — stacks the wrong glyph until the roll finishes, flashing "," or
  // a stray digit where the symbol/leading digit should be.
  const isDigit = (c: string) => c >= '0' && c <= '9'
  // `|| lengthChanged`: a digit-count change is always a real value change,
  // even where a surviving slot's char coincidentally matches (400 -> 0's
  // ones place is '0' both times) — force the roll so that isn't silently static.
  const changed = oldChar !== '' && isDigit(oldChar) && isDigit(newChar) && (oldChar !== newChar || lengthChanged)
  // RN core Animated rather than Reanimated: this is a plain translateY tween
  // with no gesture or worklet, and it keeps the primitive renderable under Jest.
  const translateY = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!changed) return
    // Increase rolls up (old exits top, new enters from bottom); decrease
    // mirrors it (old exits bottom, new enters from top) — the stack order
    // below is flipped to match, so both cases animate toward translateY 0.
    translateY.setValue(direction === 'down' ? -rowHeight : 0)
    Animated.timing(translateY, {
      toValue: direction === 'down' ? 0 : -rowHeight,
      duration: motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
    // Depend on both chars, not just newChar: right-aligned diffing means a
    // slot's newChar can repeat a value it held back when it wasn't
    // "changed" (e.g. index 1 is '1' in both "₹100" and "₹10"). With only
    // [newChar], React sees no dependency change and never starts the roll,
    // so the view stays frozen on oldChar forever — the "shows 00 not 10"
    // bug. oldChar must be in the deps so a fresh "changed" pair always fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldChar, newChar, direction])

  const charStyle = [textStyle, { height: rowHeight, lineHeight: rowHeight }]

  if (!changed) {
    return (
      <View style={{ height: rowHeight }}>
        <Text style={charStyle}>{newChar}</Text>
      </View>
    )
  }

  return (
    <View style={{ height: rowHeight, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {direction === 'down' ? (
          <>
            <Text style={charStyle}>{newChar}</Text>
            <Text style={charStyle}>{oldChar}</Text>
          </>
        ) : (
          <>
            <Text style={charStyle}>{oldChar}</Text>
            <Text style={charStyle}>{newChar}</Text>
          </>
        )}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  base: { fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
})
