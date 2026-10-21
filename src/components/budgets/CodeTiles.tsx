import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { rippleHaptic, tap } from '@/src/lib/haptics'

const CASCADE_MS = 45

/**
 * A code typed into one tile per character. A real TextInput sits over the
 * tiles, text hidden, so typing, long-press paste and autofill all still work.
 * A letter pops into its tile; a pasted code fills left to right. The row
 * shakes each time `shakeFor` changes to something new (the code that didn't match).
 */
export function CodeTiles({ value, onChange, length, editable = true, autoFocus, error, shakeFor = '' }: {
  value: string
  onChange: (text: string) => void
  length: number
  editable?: boolean
  autoFocus?: boolean
  error?: boolean
  shakeFor?: string
}) {
  const { tokens } = useTheme()
  const reduceMotion = useReducedMotion()
  const [focused, setFocused] = useState(false)
  // Where the last change started, so a paste (or a code from a link) cascades from there.
  const [from, setFrom] = useState(0)
  const prev = useRef(0)
  const shift = useSharedValue(0)
  const shaken = useRef('')

  useEffect(() => {
    const added = value.length - prev.current
    if (added === 1) tap()
    else if (added > 1) rippleHaptic(added, added * CASCADE_MS)
    setFrom(prev.current)
    prev.current = value.length
  }, [value])

  useEffect(() => {
    if (!shakeFor || shakeFor === shaken.current) return
    shaken.current = shakeFor
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    if (reduceMotion) return
    const step = (x: number) => withTiming(x, { duration: 50 })
    shift.value = withSequence(step(-9), step(9), step(-6), step(6), step(-3), step(0))
  }, [shakeFor, reduceMotion, shift])

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }))

  return (
    <Reanimated.View style={[styles.row, row]}>
      {Array.from({ length }, (_, i) => (
        <Tile
          key={i}
          char={value[i] ?? ''}
          delay={reduceMotion ? 0 : Math.max(0, i - from) * CASCADE_MS}
          animate={!reduceMotion}
          borderColor={error ? tokens.coral : focused && i === Math.min(value.length, length - 1) ? tokens.accent : tokens.border}
          testID={`code-tile-${i}`}
        />
      ))}
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={length}
        editable={editable}
        caretHidden
        // No suggestion strip or composing underline: it's a code, not a word.
        keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
        underlineColorAndroid="transparent"
        accessibilityLabel="Invite code"
        style={styles.input}
      />
    </Reanimated.View>
  )
}

function Tile({ char, delay, animate, borderColor, testID }: { char: string; delay: number; animate: boolean; borderColor: string; testID: string }) {
  const { tokens } = useTheme()
  const scale = useSharedValue(1)
  const shown = useSharedValue(0)

  useEffect(() => {
    if (!char) {
      shown.value = 0
      return
    }
    if (!animate) {
      shown.value = 1
      return
    }
    shown.value = withDelay(delay, withTiming(1, { duration: 120 }))
    scale.value = withDelay(delay, withSequence(withTiming(0.82, { duration: 0 }), withSpring(1, { damping: 11, stiffness: 340 })))
  }, [char, delay, animate, scale, shown])

  const pop = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: scale.value }] }))

  return (
    <View testID={testID} style={[styles.tile, { backgroundColor: tokens.inputBg, borderColor }]}>
      <Reanimated.View style={pop}>
        <Text style={[styles.char, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{char}</Text>
      </Reanimated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, height: 60, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  char: { fontSize: 26 },
  // Covers the tiles so a tap anywhere focuses it; its own text is invisible.
  input: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, color: 'transparent', fontSize: 1, opacity: 0 },
})
