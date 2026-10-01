import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Reanimated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { ArrowLeft, X, ChevronRight, ArrowUpRight, Check, Circle } from 'lucide-react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { Button } from '@/src/components/ui/Button'
import { PopIn } from '@/src/components/shared/PopIn'
import { useTourProgress } from '@/src/hooks/useTourProgress'
import { StepDot } from '@/src/components/onboarding/StepDot'
import { useTourContent } from '@/src/components/tour/useTourContent'
import { track } from '@/src/lib/analytics'

import { AssignDemo } from '@/src/components/tour/demos/AssignDemo'
import { LogDemo } from '@/src/components/tour/demos/LogDemo'
import { MoveDemo } from '@/src/components/tour/demos/MoveDemo'
import { RolloverDemo } from '@/src/components/tour/demos/RolloverDemo'
import { InsightsDemo } from '@/src/components/tour/demos/InsightsDemo'
import { NotifyDemo } from '@/src/components/tour/demos/NotifyDemo'
import { ExtrasList } from '@/src/components/tour/demos/ExtrasList'

type View3 = 'hub' | 'chapter' | 'done'

/**
 * The guided tour: seven chapters that explain the app by letting you poke at a
 * fake copy of it. Every demo is local state over the constants in
 * src/components/tour/content.ts, so nothing here can touch real money.
 */
export default function GuidedTourScreen() {
  const { CHAPTERS } = useTourContent()

  const { tokens, radius, space, type } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  // Fresh onboarding links here with ?fresh=1 (see app/_layout.tsx) so the
  // trial notice shows once, right before the app's first real screen.
  // Reopening the tour later from More has no param, so it exits straight back.
  const { fresh } = useLocalSearchParams<{ fresh?: string }>()
  // Read by exitTour to tell a skip from leaving the finished tour, without
  // making the back handler below re-register on every chapter change.
  const progress = useRef({ finished: false, chaptersDone: 0 })
  const exitTour = useCallback(() => {
    if (!progress.current.finished) {
      track('tour_skipped', { fresh: !!fresh, chapters_done: progress.current.chaptersDone })
    }
    router.replace(fresh ? '/account/trial-notice' : '/(tabs)')
  }, [router, fresh])

  // After setup this is the root screen, so Android back must also have an
  // explicit destination. Only intercept it while the tour itself is focused.
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      exitTour()
      return true
    })
    return () => subscription.remove()
  }, [exitTour]))

  const [done, setDone] = useTourProgress()
  const [view, setView] = useState<View3>('hub')
  const [chapter, setChapter] = useState(0)

  const doneCount = done.size
  useEffect(() => {
    progress.current = { finished: view === 'done', chaptersDone: doneCount }
  }, [view, doneCount])

  useEffect(() => {
    track('tour_started', { fresh: !!fresh })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [])

  useEffect(() => {
    if (view === 'chapter') track('tour_step_viewed', { chapter })
    if (view === 'done') track('tour_completed', { fresh: !!fresh })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fresh is fixed for the visit
  }, [view, chapter])
  const firstOpen = CHAPTERS.findIndex((_, i) => !done.has(i))
  const current = CHAPTERS[chapter]
  const isLast = chapter === CHAPTERS.length - 1

  function complete(index: number) {
    setDone((prev) => (prev.has(index) ? prev : new Set(prev).add(index)))
  }

  /** A tab route has to `navigate` (push would stack a second copy of the tabs
   *  on top of this screen); everything else is a pushable detail route. */
  function openReal(href: string) {
    if (href.startsWith('/(tabs)')) router.navigate(href as Href)
    else router.push(href as Href)
  }

  const headerSub =
    view === 'hub'
      ? doneCount
        ? `${doneCount} of ${CHAPTERS.length} chapters done`
        : 'The whole app in 3 minutes'
      : view === 'done'
        ? 'Tour complete'
        : current.title

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border, paddingHorizontal: space.lg, gap: space.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view === 'chapter' ? 'Back to chapters' : 'Close'}
          onPress={() => (view === 'chapter' ? setView('hub') : exitTour())}
          hitSlop={12}
          style={[styles.backButton, { backgroundColor: tokens.cardSolid, borderColor: tokens.border }]}
        >
          <Icon icon={view === 'chapter' ? ArrowLeft : X} size={18} color={tokens.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>
            How this works
          </Text>
          <Text numberOfLines={1} style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
            {headerSub}
          </Text>
        </View>
        {view !== 'done' && (
          <Pressable accessibilityRole="button" onPress={exitTour} hitSlop={12}>
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption }}>Skip</Text>
          </Pressable>
        )}
      </View>

      {view === 'hub' && (
        <Hub
          doneCount={doneCount}
          done={done}
          firstOpen={firstOpen}
          onOpen={(i) => {
            setChapter(i)
            setView('chapter')
          }}
          onStart={() => {
            if (firstOpen === -1) setView('done')
            else {
              setChapter(firstOpen)
              setView('chapter')
            }
          }}
        />
      )}

      {view === 'chapter' && (
        <>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl * 3, gap: space.md }}>
            <View style={{ gap: space.xs }}>
              <Text style={[styles.kicker, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold, fontSize: type.micro }]}>
                {current.kicker}
              </Text>
              <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title, lineHeight: 28 }}>
                {current.title}
              </Text>
              <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption, lineHeight: 20 }}>
                {current.lede}
              </Text>
              <Text
                style={{
                  color: done.has(chapter) ? tokens.mint : tokens.accentInk,
                  fontFamily: fontFamily.bodyExtraBold,
                  fontSize: type.caption,
                  paddingTop: 2,
                }}
              >
                {done.has(chapter) ? 'Nice. That is the whole idea.' : current.nudge}
              </Text>
            </View>

            <Reanimated.View key={chapter} entering={FadeIn.duration(180)} style={{ gap: space.md }}>
              <ChapterDemo index={chapter} onComplete={() => complete(chapter)} />
            </Reanimated.View>

            {!isLast && (
              <Pressable
                accessibilityRole="button"
                onPress={() => openReal(current.href)}
                style={[
                  styles.tryReal,
                  { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.md, padding: space.md, gap: space.md },
                ]}
              >
                <View style={[styles.tile, { backgroundColor: tokens.accentSoft, borderRadius: radius.sm }]}>
                  <Icon icon={ArrowUpRight} size={16} color={tokens.accent} />
                </View>
                <View style={styles.headerText}>
                  <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption }}>
                    Try it for real · {current.linkLabel}
                  </Text>
                  <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
                    {current.linkNote ?? 'Opens the real screen · your progress is saved'}
                  </Text>
                </View>
              </Pressable>
            )}
          </ScrollView>

          <View
            style={[
              styles.footer,
              { backgroundColor: tokens.bg, borderTopColor: tokens.border, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.lg, gap: space.md },
            ]}
          >
            <View style={[styles.rail, { gap: space.sm }]}>
              {CHAPTERS.map((c, i) => (
                <StepDot
                  key={c.title}
                  active={chapter === i}
                  activeColor={tokens.accent}
                  inactiveColor={done.has(i) ? tokens.accentSoft : tokens.borderStrong}
                  onPress={() => setChapter(i)}
                  accessibilityLabel={`Chapter ${i + 1}`}
                />
              ))}
            </View>
            <Button
              label={isLast ? 'Finish the tour' : `Next · ${CHAPTERS[chapter + 1].title.toLowerCase()}`}
              onPress={() => {
                if (isLast) {
                  complete(chapter)
                  setView('done')
                } else setChapter(chapter + 1)
              }}
            />
            <Pressable accessibilityRole="button" onPress={() => setView('hub')} hitSlop={8} style={styles.centerLink}>
              <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption }}>All chapters</Text>
            </Pressable>
          </View>
        </>
      )}

      {view === 'done' && (
        <Done
          done={done}
          onOpen={(i) => {
            setChapter(i)
            setView('chapter')
          }}
          onFinish={exitTour}
          onStartOver={() => {
            setDone(new Set())
            setChapter(0)
            setView('chapter')
          }}
        />
      )}
    </View>
  )
}

function ChapterDemo({ index, onComplete }: { index: number; onComplete: () => void }) {
  if (index === 0) return <AssignDemo onComplete={onComplete} />
  if (index === 1) return <LogDemo onComplete={onComplete} />
  if (index === 2) return <MoveDemo onComplete={onComplete} />
  if (index === 3) return <RolloverDemo onComplete={onComplete} />
  if (index === 4) return <InsightsDemo onComplete={onComplete} />
  if (index === 5) return <NotifyDemo onComplete={onComplete} />
  return <ExtrasList onComplete={onComplete} />
}

function Hub({
  done,
  doneCount,
  firstOpen,
  onOpen,
  onStart,
}: {
  done: Set<number>
  doneCount: number
  firstOpen: number
  onOpen: (index: number) => void
  onStart: () => void
}) {
  const { CHAPTERS } = useTourContent()

  const { tokens, radius, space, type } = useTheme()
  const insets = useSafeAreaInsets()
  const bob = useSharedValue(0)

  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 1700 }), withTiming(0, { duration: 1700 })), -1, false)
  }, [bob])

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -7 * bob.value }, { rotate: `${-2 + 4 * bob.value}deg` }],
  }))

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl * 2, gap: space.md }}>
        <View style={[styles.hero, { gap: space.md }]}>
          <Reanimated.View
            style={[
              styles.heroBadge,
              { backgroundColor: tokens.accentSoft, borderColor: tokens.accent, borderRadius: radius.lg },
              bobStyle,
            ]}
          >
            <Text style={{ fontSize: 30 }}>✉️</Text>
          </Reanimated.View>
          <View style={styles.headerText}>
            <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.heading - 2, lineHeight: 30 }}>
              Your money gets a job.
            </Text>
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption, lineHeight: 19 }}>
              Seven short chapters. All of them are pokeable, none of them touch your real money.
            </Text>
          </View>
        </View>

        <View style={styles.hubHead}>
          <Text style={[styles.kicker, { color: tokens.text3, fontFamily: fontFamily.bodyBold, fontSize: type.micro }]}>
            THE TOUR
          </Text>
          <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyBold, fontSize: type.micro }}>
            {doneCount}/{CHAPTERS.length}
          </Text>
        </View>

        {CHAPTERS.map((c, i) => {
          const isDone = done.has(i)
          return (
            <PopIn key={c.title} play delay={i * 40}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpen(i)}
                style={[
                  styles.hubRow,
                  {
                    backgroundColor: tokens.cardSolid,
                    borderColor: isDone ? tokens.accent : tokens.border,
                    borderRadius: radius.md,
                    padding: space.md,
                    gap: space.md,
                  },
                ]}
              >
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: isDone ? tokens.accentSoft : tokens.inputBg, borderColor: isDone ? tokens.accent : tokens.border, borderRadius: radius.sm },
                  ]}
                >
                  <Text style={{ color: isDone ? tokens.accentInk : tokens.text2, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>
                    {isDone ? '✓' : String(i + 1)}
                  </Text>
                </View>
                <View style={styles.headerText}>
                  <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>{c.title}</Text>
                  <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 18 }}>
                    {c.blurb}
                  </Text>
                </View>
                <Icon icon={ChevronRight} size={16} color={tokens.text3} />
              </Pressable>
            </PopIn>
          )
        })}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: tokens.bg, borderTopColor: tokens.border, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.lg, gap: space.sm },
        ]}
      >
        <Button
          label={doneCount === 0 ? 'Start the tour' : firstOpen === -1 ? 'See the recap' : `Continue · chapter ${firstOpen + 1}`}
          onPress={onStart}
        />
        <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, textAlign: 'center' }}>
          Jump in anywhere · about 3 minutes end to end
        </Text>
      </View>
    </>
  )
}

function Done({
  done,
  onOpen,
  onFinish,
  onStartOver,
}: {
  done: Set<number>
  onOpen: (index: number) => void
  onFinish: () => void
  onStartOver: () => void
}) {
  const { CHAPTERS } = useTourContent()

  const { tokens, radius, space, type } = useTheme()
  const insets = useSafeAreaInsets()
  const doneCount = done.size

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.lg, alignItems: 'center' }}
    >
      <PopIn play delay={0}>
        <View style={[styles.medal, { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }]}>
          <Text style={{ fontSize: 40 }}>🏅</Text>
        </View>
      </PopIn>
      <PopIn play delay={80} style={{ gap: space.xs, alignItems: 'center' }}>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title, textAlign: 'center' }}>
          {doneCount === CHAPTERS.length ? 'You know the whole app.' : `Tour done · ${doneCount} of ${CHAPTERS.length} poked.`}
        </Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption, textAlign: 'center', lineHeight: 20 }}>
          Fund the envelopes, log as you go, pull money from other envelopes when life happens, start clean on the 1st. That is the entire loop.
        </Text>
      </PopIn>

      <View style={[styles.recap, { backgroundColor: tokens.cardSolid, borderColor: tokens.border, borderRadius: radius.md }]}>
        {CHAPTERS.map((c, i) => (
          <PopIn key={c.title} play delay={160 + i * 60}>
            <View
              style={[styles.recapRow, { borderBottomColor: tokens.border, paddingHorizontal: space.md, paddingVertical: space.md, gap: space.sm }]}
            >
              <View style={[styles.tick, { backgroundColor: done.has(i) ? tokens.accentSoft : tokens.inputBg }]}>
                {done.has(i) ? (
                  <PopIn play delay={160 + i * 60 + 120}>
                    <Icon icon={Check} size={12} color={tokens.accentInk} strokeWidth={3} />
                  </PopIn>
                ) : (
                  <Icon icon={Circle} size={10} color={tokens.text3} strokeWidth={2.5} />
                )}
              </View>
              <Text numberOfLines={1} style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.caption }}>
                {c.title}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => onOpen(i)} hitSlop={8}>
                <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyExtraBold, fontSize: type.micro }}>
                  {done.has(i) ? 'Revisit' : 'Try it'}
                </Text>
              </Pressable>
            </View>
          </PopIn>
        ))}
      </View>

      <PopIn play delay={160 + CHAPTERS.length * 60} style={{ width: '100%', gap: space.sm }}>
        <Button label="Back to my money" onPress={onFinish} />
        <Pressable accessibilityRole="button" onPress={onStartOver} hitSlop={8} style={styles.centerLink}>
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyExtraBold, fontSize: type.caption }}>Start over</Text>
        </Pressable>
      </PopIn>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { letterSpacing: 1 },
  hero: { flexDirection: 'row', alignItems: 'center' },
  heroBadge: { width: 66, height: 66, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hubHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  hubRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  badge: { width: 34, height: 34, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  tryReal: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  rail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  centerLink: { alignSelf: 'center' },
  medal: { width: 94, height: 94, borderRadius: 47, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  recap: { width: '100%', borderWidth: 1, overflow: 'hidden' },
  recapRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  tick: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
})
