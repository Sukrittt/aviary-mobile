import { View, Text, StyleSheet } from 'react-native'
import Reanimated, { FadeIn, ZoomIn } from 'react-native-reanimated'
import { Card } from '@/src/components/ui/Card'
import { BirdLandingMark } from '@/src/components/splash/BirdLandingMark'
import { useWeekRecap } from '@/src/features/week-recap/useWeekRecap'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { learnedDates } from '@/src/lib/noticed'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * Days 1 to 7: tells new users the app is learning them and that a recap is
 * coming, with a dot per day of the week ticking as they log. Hides once the
 * recap is due. Twin of Web's src/components/home/LearningCard.tsx.
 */
export function LearningCard() {
  const { tokens } = useTheme()
  const learning = useWeekRecap().data?.learning
  const rows = useRecentExpenses().data
  if (!learning) return null

  const start = new Date(`${learning.unlocksOn}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 7)
  const logged = new Set(learnedDates(learning.loggedDates, rows ?? [], start.toISOString().slice(0, 10)))
  const left = 8 - learning.day
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    return { date: d.toISOString().slice(0, 10), letter: WEEKDAYS[d.getUTCDay()], today: i === learning.day - 1 }
  })

  return (
    <Reanimated.View entering={FadeIn.duration(320)}>
      <Card elevated={false}>
        <View style={styles.head} accessible accessibilityLabel={`Aviary is learning your habits. Day ${learning.day} of 7.`}>
          <View style={[styles.bird, { backgroundColor: tokens.accentSoft }]}>
            <BirdLandingMark size={34} color={tokens.accentInk} autoplay={false} perched />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Aviary is learning your habits</Text>
            <Text style={[styles.sub, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>
              Day {learning.day} of 7 · your recap unlocks {left === 1 ? 'tomorrow' : `in ${left} days`}
            </Text>
          </View>
        </View>
        <View style={styles.days}>
          {days.map((d, i) => {
            const on = logged.has(d.date)
            return (
              <View key={d.date} style={styles.dayCol}>
                <View
                  style={[
                    styles.dot,
                    on ? { backgroundColor: tokens.accent, borderColor: tokens.accent } : { borderColor: tokens.border },
                    d.today && { borderColor: tokens.accentInk },
                  ]}
                >
                  {on && (
                    <Reanimated.Text entering={ZoomIn.delay(i * 60).springify()} style={[styles.tick, { color: tokens.onAccent }]}>
                      ✓
                    </Reanimated.Text>
                  )}
                </View>
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
  tick: { fontSize: 15, fontWeight: '900' },
  letter: { fontSize: 11 },
})
