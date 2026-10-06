import { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { WrappedCard, WPop, WRise, WrappedCaption } from '@/src/components/wrapped/WrappedCard'
import { useCurrency } from '@/src/context/CurrencyContext'
import { fontFamily } from '@/src/theme/fonts'
import { markWeekRecapSeen } from '@/src/api/weekRecap'
import { recapSlides } from '@/src/features/week-recap/slides'
import { markRecapOpened, useWeekRecap } from '@/src/features/week-recap/useWeekRecap'
import { track } from '@/src/lib/analytics'

function close() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

export default function RecapRoute() {
  const insets = useSafeAreaInsets()
  const { formatCurrency } = useCurrency()
  const { data, isLoading } = useWeekRecap()
  const [index, setIndex] = useState(0)
  const recap = data?.due ? data.recap : undefined
  const slides = useMemo(() => (recap ? recapSlides(recap, formatCurrency) : []), [recap, formatCurrency])

  useEffect(() => {
    markRecapOpened()
  }, [])

  useEffect(() => {
    if (!recap) return
    track('week_recap_opened')
    // Seen on open, not on finish: closing early still counts.
    markWeekRecapSeen().catch((err) => console.warn('Marking recap seen failed', err))
  }, [recap])

  // Opened from a stale notification after it was seen elsewhere: nothing to show.
  useEffect(() => {
    if (!isLoading && !recap) close()
  }, [isLoading, recap])

  if (!slides.length) return <View style={[styles.container, { backgroundColor: '#4b4fcc' }]} />

  const slide = slides[index]
  const last = index === slides.length - 1
  const step = (dir: number) => setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + dir)))

  return (
    <View style={[styles.container, { backgroundColor: slide.color }]}>
      <View style={styles.tapZoneRow}>
        <Pressable style={styles.tapZone} onPress={() => step(-1)} accessibilityLabel="Previous" />
        <Pressable style={styles.tapZone} onPress={() => step(1)} accessibilityLabel="Next" />
      </View>
      <WrappedCard key={index} color={slide.color} onColor={slide.ink} eyebrow={slide.eyebrow} interactive={last} style={{ paddingBottom: insets.bottom + 40 }}>
        <WPop delay={80}>
          <Text style={styles.emoji}>{slide.emoji}</Text>
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
              {i <= index && <View style={styles.progressFill} />}
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
  iconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  iconButtonText: { fontSize: 13, color: '#fff' },
  emoji: { fontSize: 56 },
  title: { fontSize: 40, lineHeight: 46, fontFamily: fontFamily.displayBold, letterSpacing: -0.8 },
  cta: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999 },
  ctaText: { fontSize: 16, fontFamily: fontFamily.displaySemiBold },
})
