import { useEffect, useState } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { SlideInDown, SlideOutUp } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const PHRASES = [
  'Balancing the categories…',
  'Giving your money a job…',
  "Counting what's Ready to Assign…",
  "Chasing down last month's leftovers…",
  'Reconciling the chaos…',
  'Squeezing blood from Bills…',
  'Asking Rent to behave…',
  'Tallying the damage…',
  'Waking up the ledger…',
  "Making sure nothing's overspent (yet)…",
  'Checking if Groceries survived the week…',
  'Persuading Math to add up…',
  'Finding where all the money went…',
  'Teaching your budget to Budget…',
  'Begging the spending trend to flatten…',
  'Hoping the credit card behaves…',
  'Refreshing your financial reality…',
]

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

interface Props {
  style?: StyleProp<ViewStyle>
  phrases?: string[]
  /** Play the phrases in order, like steps, instead of shuffled. */
  ordered?: boolean
}

export function LoadingCaption({ style, phrases = PHRASES, ordered = false }: Props) {
  const { tokens } = useTheme()
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [shuffledPhrases] = useState(() => (ordered ? phrases : shuffleArray(phrases)))

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % shuffledPhrases.length)
    }, 1800)
    return () => clearInterval(interval)
  }, [shuffledPhrases.length])

  return (
    <View style={[styles.wrap, style]}>
      <Animated.Text
        key={phraseIndex}
        entering={SlideInDown.duration(450)}
        exiting={SlideOutUp.duration(450)}
        style={[styles.text, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}
      >
        {shuffledPhrases[phraseIndex]}
      </Animated.Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: 34,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  text: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    fontSize: 13,
    textAlign: 'center',
  },
})
