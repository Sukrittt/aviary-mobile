import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { BirdLandingMark } from './BirdLandingMark'
import { fontFamily } from '@/src/theme/fonts'

const ORANGE = '#F04E23'
const CREAM = '#FFF6EE'
const SIZE = 240

// The bird sits perched (same nod + blink as Home) while fonts/auth/onboarding resolve in the background. The
// route unmounts as soon as resolving finishes, so this adds no fixed delay.
export function BirdLandingSplash() {
  const wordmark = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const wordmarkIn = Animated.timing(wordmark, {
      toValue: 1,
      duration: 600,
      delay: 150,
      easing: Easing.bezier(0.2, 0.8, 0.25, 1),
      useNativeDriver: true,
    })
    wordmarkIn.start()
    return () => wordmarkIn.stop()
  }, [wordmark])

  const wordmarkStyle = {
    opacity: wordmark.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
    transform: [{ translateY: wordmark.interpolate({ inputRange: [0, 1], outputRange: [7.5, 0] }) }],
  }

  return (
    <View style={styles.root}>
      <BirdLandingMark size={SIZE} color={CREAM} autoplay={false} perched />

      <Animated.Text style={[styles.wordmark, wordmarkStyle]}>Aviary</Animated.Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  // Fixed width instead of shrink-to-fit: negative letterSpacing makes the
  // box size depend on the exact glyph metrics used at layout time, and a
  // paddingRight compensation (previous fix) wasn't enough once production's
  // metrics differed from dev's, still clipping the final "y". A width wide
  // enough for "Aviary" at this font/size is immune to that either way.
  wordmark: { fontFamily: fontFamily.displaySemiBold, fontSize: 34, letterSpacing: -0.5, color: CREAM, marginTop: -6, width: 160, textAlign: 'center' },
})
