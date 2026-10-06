import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { WrappedCard, WPop, WRise, WrappedCaption } from '@/src/components/wrapped/WrappedCard'
import { useCurrency } from '@/src/context/CurrencyContext'
import { fontFamily } from '@/src/theme/fonts'
import type { WeekRecap } from '@/src/api/weekRecap'
import { recapSlides } from '@/src/features/week-recap/slides'
import { markRecapOpened, useMarkWeekRecapSeen, useWeekRecap } from '@/src/features/week-recap/useWeekRecap'
import { track } from '@/src/lib/analytics'
import { BirdLandingMark } from '@/src/components/splash/BirdLandingMark'

/** Same pace as Wrapped's cards. */
const SLIDE_MS = 5000

function close() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

export default function RecapRoute() {
  const insets = useSafeAreaInsets()
  const { formatCurrency } = useCurrency()
  const { data, isLoading } = useWeekRecap()
  const markSeen = useMarkWeekRecapSeen()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const progress = useRef(new Animated.Value(0)).current
  // Held once loaded: marking it seen flips the cached query to `due: false`,
  // which must not yank the story out from under the reader.
  const [recap, setRecap] = useState<WeekRecap>()
  if (!recap && data?.due && data.recap) setRecap(data.recap)
  const slides = useMemo(() => (recap ? recapSlides(recap, formatCurrency) : []), [recap, formatCurrency])

  useEffect(() => {
    markRecapOpened()
  }, [])

  const { mutate } = markSeen
  useEffect(() => {
    if (!recap) return
    track('week_recap_opened')
    // Seen on open, not on finish: closing early still counts. If every retry
    // fails it stays due, and shows again next launch: better than never.
    mutate()
  }, [recap, mutate])

  // Opened from a stale notification after it was seen: nothing to show.
  const nothingDue = !isLoading && !(data?.due && data.recap)
  useEffect(() => {
    if (nothingDue && !recap) close()
  }, [nothingDue, recap])

  // Plays like Wrapped: the active segment fills over SLIDE_MS, then advances,
  // stopping on the last slide. Holding a side pauses; letting go resumes from
  // where the fill was, and only an index change starts it over at 0.
  const count = slides.length
  useEffect(() => {
    progress.setValue(0)
  }, [index, progress])
  useEffect(() => {
    if (!count || paused) return
    let anim: Animated.CompositeAnimation | undefined
    progress.stopAnimation((current) => {
      anim = Animated.timing(progress, { toValue: 1, duration: SLIDE_MS * (1 - current), easing: Easing.linear, useNativeDriver: false })
      anim.start(({ finished }) => {
        if (finished && index < count - 1) setIndex(index + 1)
      })
    })
    return () => anim?.stop()
  }, [index, paused, count, progress])

  if (!slides.length) return <View style={[styles.container, { backgroundColor: '#4b4fcc' }]} />

  const slide = slides[index]
  const last = index === slides.length - 1
  const step = (dir: number) => setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + dir)))

  return (
    <View style={[styles.container, { backgroundColor: slide.color }]}>
      <View style={styles.tapZoneRow}>
        <Pressable style={styles.tapZone} onPress={() => step(-1)} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} accessibilityLabel="Previous" />
        <Pressable style={styles.tapZone} onPress={() => step(1)} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} accessibilityLabel="Next" />
      </View>
      <WrappedCard key={index} color={slide.color} onColor={slide.ink} eyebrow={slide.eyebrow} interactive={last} style={{ paddingBottom: insets.bottom + 40 }}>
        <WPop delay={80}>
          {slide.bird ? <BirdLandingMark size={72} color={slide.ink} autoplay={false} perched /> : <Text style={styles.emoji}>{slide.emoji}</Text>}
        </WPop>
        <WPop delay={160}>
          <Text style={[styles.title, { color: slide.ink }]}>{slide.title}</Text>
        </WPop>
        <WRise delay={300}>
          <WrappedCaption value={slide.body} onColor={slide.ink} />
        </WRise>
        {last && (
          <WRise delay={450}>
            <Pressable
              onPress={() => {
                track('week_recap_finished')
                close()
              }}
              style={[styles.cta, { backgroundColor: slide.ink }]}
            >
              <Text style={[styles.ctaText, { color: slide.color }]}>Keep going</Text>
            </Pressable>
          </WRise>
        )}
      </WrappedCard>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.progressRow}>
          {slides.map((_, i) => (
            <View key={i} style={styles.progressTrack}>
              {i < index && <View style={styles.progressFill} />}
              {i === index && <Animated.View style={[styles.progressFill, styles.progressFillOrigin, { transform: [{ scaleX: progress }] }]} />}
            </View>
          ))}
        </View>
        <Pressable onPress={close} hitSlop={8} style={styles.iconButton} accessibilityLabel="Close recap">
          <Text style={styles.iconButtonText}>✕</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tapZoneRow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  tapZone: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, gap: 12, alignItems: 'flex-end' },
  progressRow: { flexDirection: 'row', gap: 4, alignSelf: 'stretch' },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.35)' },
  progressFill: { width: '100%', height: '100%', backgroundColor: '#ffffff' },
  progressFillOrigin: { transformOrigin: 'left' },
  iconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  iconButtonText: { fontSize: 13, color: '#fff' },
  emoji: { fontSize: 56 },
  title: { fontSize: 40, lineHeight: 46, fontFamily: fontFamily.displayBold, letterSpacing: -0.8 },
  cta: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999 },
  ctaText: { fontSize: 16, fontFamily: fontFamily.displaySemiBold },
})
