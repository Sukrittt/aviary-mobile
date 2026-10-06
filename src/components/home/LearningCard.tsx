import { useEffect, type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Reanimated, {
  Easing,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated'
import { Check } from 'lucide-react-native'
import { Card } from '@/src/components/ui/Card'
import { BirdLandingMark } from '@/src/components/splash/BirdLandingMark'
import { useWeekRecap } from '@/src/features/week-recap/useWeekRecap'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { learnedDates } from '@/src/lib/noticed'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Circles pop in one after another once the card is in; checks follow on the same stagger. */
const DOT_DELAY = (i: number) => 250 + i * 70
const CHECK_DELAY = (i: number) => 520 + i * 70

/** Today's circle keeps gently breathing after it pops in. */
function Pulse({ delay, children }: { delay: number; children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  useEffect(() => {
    if (reduceMotion) return
    const half = { duration: 800, easing: Easing.inOut(Easing.ease) }
    scale.value = withDelay(delay, withRepeat(withSequence(withTiming(0.86, half), withTiming(1, half)), -1))
  }, [delay, reduceMotion, scale])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return <Reanimated.View style={style}>{children}</Reanimated.View>
}

/**
 * Days 1 to 7: tells new users the app is learning them and that a recap is
 * coming. The dots count the week down, not attendance: every day that has
 * passed is ticked whether or not anything was spent, so a quiet day never
 * reads as a miss. Today ticks once they log. Hides once the recap is due. Twin of Web's src/components/home/LearningCard.tsx.
 */
export function LearningCard() {
  const { tokens } = useTheme()
  const learning = useWeekRecap().data?.learning
  const rows = useRecentExpenses().data
  if (!learning) return null

  const start = new Date(`${learning.unlocksOn}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 7)
  const left = 8 - learning.day
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    return { date: d.toISOString().slice(0, 10), letter: WEEKDAYS[d.getUTCDay()], today: i === learning.day - 1 }
  })
  const logged = new Set(learnedDates(learning.loggedDates, rows, start.toISOString().slice(0, 10), days[learning.day - 1].date))

  return (
    // Springs in like the Get started card; the envelopes card below has a
    // layout transition, so it slides down rather than jumping.
    <Reanimated.View
      entering={FadeInDown.duration(420).springify().damping(22).stiffness(200)}
      layout={LinearTransition.springify().damping(44).stiffness(400)}
    >
      <Card elevated={false}>
        <View style={styles.head} accessible accessibilityLabel={`We're learning your habits. Day ${learning.day} of 7.`}>
          <View style={[styles.bird, { backgroundColor: tokens.accentSoft }]}>
            <BirdLandingMark size={34} color={tokens.accentInk} autoplay={false} perched />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{"We're learning your habits"}</Text>
            <Text style={[styles.sub, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>
              Day {learning.day} of 7 · your recap unlocks {left === 1 ? 'tomorrow' : `in ${left} days`}
            </Text>
          </View>
        </View>
        <View style={styles.days}>
          {days.map((d, i) => {
            const done = i < learning.day - 1 || (d.today && logged.has(d.date))
            return (
              <View key={d.date} style={styles.dayCol} testID={done ? 'learning-day-done' : d.today ? 'learning-day-today' : 'learning-day-ahead'}>
                <Reanimated.View entering={ZoomIn.delay(DOT_DELAY(i)).springify().damping(13)}>
                  {d.today && !done ? (
                    <Pulse delay={DOT_DELAY(i) + 650}>
                      <View style={[styles.dot, { borderColor: tokens.accentInk }]} />
                    </Pulse>
                  ) : (
                    <View style={[styles.dot, done ? { backgroundColor: tokens.accent, borderColor: tokens.accent } : { borderColor: tokens.border }]}>
                      {done && (
                        <Reanimated.View entering={ZoomIn.delay(CHECK_DELAY(i)).springify().damping(12)}>
                          <Check size={18} color={tokens.onAccent} strokeWidth={3} />
                        </Reanimated.View>
                      )}
                    </View>
                  )}
                </Reanimated.View>
                <Text style={[styles.letter, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>{d.letter}</Text>
              </View>
            )
          })}
        </View>
      </Card>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bird: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16 },
  sub: { fontSize: 13, marginTop: 2 },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  dayCol: { alignItems: 'center', gap: 6 },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 11 },
})
