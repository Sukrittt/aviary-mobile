import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, View, Text, Pressable, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useWrapped } from '@/src/hooks/useWrapped'
import { useBudgets } from '@/src/hooks/useBudgets'
import { moneyStayedPut } from '@/src/lib/monthly'
import { useWrappedMusic } from '@/src/hooks/useWrappedMusic'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { Icon } from '@/src/components/shared/Icon'
import {
  CoverCard,
  IntroCard,
  TotalSpentCard,
  TopCategoryCard,
  BiggestPurchaseCard,
  TopWeekdayCard,
  WeekRaceCard,
  CategoryBreakdownCard,
  StreakCard,
  BadgesCard,
  ArchetypeCard,
} from './WrappedCards'
import { ShareCard } from './ShareCard'
import type { WrappedData } from '@/src/api/wrapped'
import { track } from '@/src/lib/analytics'

const CARD_DURATION_MS = 5000
/** How long a segment cut short by a tap takes to ease up to full. Doubles as the delay
 *  before the slide swaps, so keep it short — it's real input latency. */
const SEGMENT_CATCH_UP_MS = 180
const SWIPE_DOWN_CLOSE_DISTANCE = 120
const SWIPE_DOWN_CLOSE_VELOCITY = 800
/** progress row (10 + 3) + top bar (10 + 30) — cards start below it so the eyebrow never collides. */
const OVERLAY_HEIGHT = 53
const END_GRADIENT: [string, string, string] = ['#5055d3', '#9d2398', '#c55123']

function PlayIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Path d="M5 3 L17 10 L5 17 Z" fill={color} strokeLinejoin="round" />
    </Svg>
  )
}

interface Slide {
  bg: string
  text: string
  gradient?: [string, string, string]
  visible: boolean
  render: () => React.ReactElement
}

function buildSlides(
  data: WrappedData,
  moneySaved: number | undefined,
  begin: (muted: boolean) => void,
  restart: () => void,
): Slide[] {
  return [
    {
      bg: '#cd7d00',
      text: '#2e1200',
      visible: true,
      render: () => (
        <CoverCard data={data} color="#cd7d00" onColor="#2e1200" onStart={() => begin(false)} onStartMuted={() => begin(true)} />
      ),
    },
    { bg: '#4b4fcc', text: '#ffffff', visible: true, render: () => <IntroCard data={data} color="#4b4fcc" onColor="#ffffff" /> },
    { bg: '#008140', text: '#ffffff', visible: true, render: () => <TotalSpentCard data={data} color="#008140" onColor="#ffffff" /> },
    {
      bg: '#c91f3a',
      text: '#ffffff',
      visible: data.topCategories.length > 0,
      render: () => <TopCategoryCard data={data} color="#c91f3a" onColor="#ffffff" />,
    },
    {
      bg: '#ad2ca7',
      text: '#ffffff',
      visible: data.biggestPurchase !== null,
      render: () => <BiggestPurchaseCard data={data} color="#ad2ca7" onColor="#ffffff" />,
    },
    {
      bg: '#008097',
      text: '#ffffff',
      visible: data.topWeekday !== null,
      render: () => <TopWeekdayCard data={data} color="#008097" onColor="#ffffff" />,
    },
    {
      bg: '#43368e',
      text: '#ffffff',
      visible: (data.weeklyTotals?.length ?? 0) > 0,
      render: () => <WeekRaceCard data={data} color="#43368e" onColor="#ffffff" />,
    },
    {
      bg: '#c87600',
      text: '#2b1000',
      visible: data.topCategories.reduce((s, c) => s + c.total, 0) > 0,
      render: () => <CategoryBreakdownCard data={data} color="#c87600" onColor="#2b1000" />,
    },
    {
      bg: '#007a3a',
      text: '#ffffff',
      visible: data.longestStreak !== null,
      render: () => <StreakCard data={data} color="#007a3a" onColor="#ffffff" moneySaved={moneySaved} />,
    },
    { bg: '#a624a0', text: '#ffffff', visible: true, render: () => <BadgesCard data={data} color="#a624a0" onColor="#ffffff" /> },
    { bg: '#c11435', text: '#ffffff', visible: true, render: () => <ArchetypeCard data={data} color="#c11435" onColor="#ffffff" /> },
    {
      bg: '#5055d3',
      text: '#ffffff',
      gradient: END_GRADIENT,
      visible: true,
      render: () => (
        <ShareCard data={data} onColor="#ffffff" onRestart={restart} />
      ),
    },
  ].filter((s) => s.visible)
}

export function WrappedScreen() {
  const router = useRouter()
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const { data, isLoading, error } = useWrapped()
  const { data: budgets } = useBudgets()

  const [index, setIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const [hint, setHint] = useState<'play' | null>(null)
  /** Fill of the active segment only, 0..1. Segments already played render as plain Views,
   *  so there is exactly one animated node in the row at any time. */
  const progress = useRef(new Animated.Value(0)).current
  /** Slide an in-flight catch-up is heading to, or null when idle. */
  const pendingRef = useRef<number | null>(null)
  const opacity = useRef(new Animated.Value(1)).current
  const translateY = useRef(new Animated.Value(0)).current
  const hintOpacity = useRef(new Animated.Value(0)).current

  useWrappedMusic(started && !muted)

  const moneySaved = useMemo(() => {
    if (!data || !budgets) return undefined
    return moneyStayedPut(budgets, data.range, data.totalSpent)
  }, [data, budgets])

  // Which card people stop on is the only thing about Wrapped worth knowing,
  // so each card counts once per visit. Index 0 is the start screen.
  const seenCards = useRef(new Set<number>())
  useEffect(() => {
    if (!started || index < 1 || seenCards.current.has(index)) return
    seenCards.current.add(index)
    track('wrapped_card_viewed', { index })
  }, [started, index])

  const begin = useCallback((startMuted: boolean) => {
    track('wrapped_opened', { muted: startMuted })
    setMuted(startMuted)
    setStarted(true)
    progress.setValue(0)
    setIndex(1)
  }, [progress])

  const restart = useCallback(() => {
    setStarted(false)
    pendingRef.current = null
    progress.setValue(0)
    setIndex(0)
  }, [progress])

  function setDragY(y: number) {
    translateY.setValue(Math.max(0, y))
  }

  function snapBack() {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start()
  }

  function close() {
    router.back()
  }

  // safe: begin/restart are useCallback'd above with stable deps (progress ref + setters)
  const slides = useMemo(() => (data ? buildSlides(data, moneySaved, begin, restart) : []), [data, moneySaved, begin, restart])
  const contentSlides = slides.slice(1)

  // Vertical-only + a real offset before activating, so this never steals
  // taps from the tap-zone Pressables underneath (RNGH negotiates the two
  // since GestureHandlerRootView wraps the whole app in _layout.tsx).
  const swipeDownGesture = Gesture.Pan()
    .activeOffsetY(15)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      runOnJS(setDragY)(e.translationY)
    })
    .onEnd((e) => {
      if (e.translationY > SWIPE_DOWN_CLOSE_DISTANCE || e.velocityY > SWIPE_DOWN_CLOSE_VELOCITY) {
        runOnJS(close)()
      } else {
        runOnJS(snapBack)()
      }
    })

  function flashHint(kind: 'play') {
    setHint(kind)
    hintOpacity.setValue(1)
    Animated.timing(hintOpacity, { toValue: 0, duration: 500, delay: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setHint(null)
    })
  }

  function swap(next: number) {
    pendingRef.current = null
    progress.setValue(0)
    opacity.setValue(0)
    setIndex(next)
  }

  // The slide only changes once the outgoing segment has finished filling, so a progress
  // animation and a React re-render never overlap — running them together is what made a
  // tap-through read as a flicker.
  function goTo(next: number) {
    if (!started || next === index || next < 1 || next >= slides.length) return
    // Second tap inside the catch-up window: drop the flourish and move now.
    if (pendingRef.current !== null) {
      progress.stopAnimation()
      swap(next)
      return
    }
    pendingRef.current = next
    progress.stopAnimation((current) => {
      // Auto-advance (already at 1) and tap-left have no ground to cover — cut straight over.
      const catchUp = next > index ? Math.round(SEGMENT_CATCH_UP_MS * (1 - current)) : 0
      if (catchUp === 0) {
        swap(next)
        return
      }
      Animated.timing(opacity, { toValue: 0, duration: catchUp, useNativeDriver: true }).start()
      Animated.timing(progress, {
        toValue: 1,
        duration: catchUp,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) swap(next)
      })
    })
  }

  // Targets the pending slide, not the displayed one, so tapping faster than the catch-up
  // still advances one slide per tap.
  function tapSide(dir: 1 | -1) {
    goTo((pendingRef.current ?? index) + dir)
  }

  // Keeps the auto-advance effect below from re-running goTo on every render
  // (goTo closes over index/started/slides.length, so it's a new function each
  // time) — the effect always calls the latest goTo via this ref instead of
  // listing goTo itself as a dep, which would restart the progress-fill timer
  // on unrelated re-renders (e.g. hint/muted changing).
  const goToRef = useRef(goTo)
  goToRef.current = goTo

  function tapCenter() {
    const next = !paused
    setPaused(next)
    if (!next) flashHint('play')
  }

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }).start()
  }, [index, opacity])

  // Story-style top bar: the active segment fills over CARD_DURATION_MS, then auto-advances.
  // Resuming from pause continues from wherever the segment was left, rather than restarting
  // it — only an actual index change (which resets `progress` in swap()) starts over at 0.
  useEffect(() => {
    if (!started || paused || contentSlides.length === 0 || index < 1) return
    let anim: Animated.CompositeAnimation | undefined
    progress.stopAnimation((current) => {
      anim = Animated.timing(progress, {
        toValue: 1,
        duration: CARD_DURATION_MS * (1 - current),
        easing: Easing.linear,
        useNativeDriver: false,
      })
      anim.start(({ finished }) => {
        if (finished) goToRef.current(index + 1)
      })
    })
    return () => anim?.stop()
  }, [index, started, paused, contentSlides.length, progress])

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
        <View style={styles.centerFill}>
          <LoadingCaption />
        </View>
      </View>
    )
  }

  if (error || slides.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
        <View style={styles.centerFill}>
          <Text style={[styles.errorText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            {error instanceof Error ? error.message : 'Not enough expenses yet for a Wrapped recap.'}
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon icon={ArrowLeft} size={16} color={tokens.text} />
            <Text style={[styles.closeText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const slide = slides[index]

  return (
    <GestureDetector gesture={swipeDownGesture}>
      <Animated.View
        style={[styles.container, { backgroundColor: slide.bg, paddingTop: insets.top, transform: [{ translateY }] }]}
      >
        {/* Full-bleed, unpadded — cardWrap below is inset by the top/bottom overlay padding,
            so a gradient set only on the card would leave slide.bg's flat color visible in
            that margin. This layer covers the whole screen regardless of that padding. */}
        {slide.gradient && (
          <LinearGradient
            pointerEvents="none"
            colors={slide.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Tap zones sit under the card so real interactive children (ShareCard's button,
            CoverCard's start buttons) still win the touch. */}
        {started && (
          <View style={styles.tapZoneRow}>
            <Pressable style={styles.tapZoneSide} onPress={() => tapSide(-1)} />
            <Pressable style={styles.tapZoneCenter} onPress={tapCenter} />
            <Pressable style={styles.tapZoneSide} onPress={() => tapSide(1)} />
          </View>
        )}

        {/* box-none: this wrapper never claims taps itself, so the tap zones behind it still
            work everywhere except where a real interactive child (e.g. ShareCard's button) is. */}
        <Animated.View
          pointerEvents="box-none"
          style={[styles.cardWrap, { opacity, paddingTop: started ? OVERLAY_HEIGHT : 0, paddingBottom: insets.bottom + 24 }]}
        >
          {slide.render()}
        </Animated.View>

        {started && paused && <BlurView pointerEvents="none" intensity={35} tint="dark" style={StyleSheet.absoluteFill} />}

        {started && (
          <View pointerEvents="box-none" style={[styles.overlayControls, { top: insets.top }]}>
            <View style={styles.progressRow}>
              {contentSlides.map((_, i) => (
                <View key={i} style={styles.progressTrack}>
                  {i < index - 1 && <View style={styles.progressFill} />}
                  {i === index - 1 && (
                    <Animated.View
                      style={[styles.progressFill, styles.progressFillOrigin, { transform: [{ scaleX: progress }] }]}
                    />
                  )}
                </View>
              ))}
            </View>

            <View style={styles.topBar}>
              <Text style={[styles.topBarLabel, { color: `${slide.text}dd` }]}>EXPENSE WRAPPED</Text>
              <View style={styles.topBarButtons}>
                <Pressable onPress={() => setMuted((m) => !m)} hitSlop={8} style={styles.iconButton}>
                  <Text style={styles.iconButtonText}>{muted ? '🔇' : '♫'}</Text>
                </Pressable>
                <Pressable onPress={close} hitSlop={8} style={styles.iconButton}>
                  <Text style={styles.iconButtonText}>✕</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {started && paused && (
          <View pointerEvents="none" style={styles.centerIndicator}>
            <BlurView intensity={60} tint="light" style={styles.pausedBubble}>
              <PlayIcon color="#ffffff" />
            </BlurView>
            <Text style={styles.pausedLabel}>PAUSED</Text>
          </View>
        )}

        {started && hint === 'play' && (
          <Animated.View pointerEvents="none" style={[styles.centerIndicator, { opacity: hintOpacity }]}>
            <View style={[styles.indicatorBubble, { borderColor: `${slide.text}55` }]}>
              <PlayIcon color={slide.text} />
            </View>
          </Animated.View>
        )}

      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  errorText: { fontSize: 14, textAlign: 'center' },
  overlayControls: { position: 'absolute', left: 0, right: 0 },
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingTop: 10 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.35)' },
  progressFill: { width: '100%', height: '100%', borderRadius: 2, backgroundColor: '#ffffff' },
  progressFillOrigin: { transformOrigin: 'left' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 },
  topBarButtons: { flexDirection: 'row', gap: 8 },
  topBarLabel: { fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  centerIndicator: { position: 'absolute', top: '44%', left: 0, right: 0, alignItems: 'center' },
  indicatorBubble: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedBubble: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedLabel: {
    marginTop: 10,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: { fontSize: 13, color: '#fff' },
  closeText: { fontSize: 18 },
  cardWrap: { flex: 1 },
  tapZoneRow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  tapZoneSide: { flex: 3 },
  tapZoneCenter: { flex: 4 },
})
