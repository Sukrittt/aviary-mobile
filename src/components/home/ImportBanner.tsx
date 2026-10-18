import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/src/components/ui/Card'
import { SlideStrip } from '@/src/components/shared/SlideStrip'
import { ConfettiPiece } from '@/src/components/onboarding/SetupDone'
import { continueImport, getImportStatus, type ImportStatus } from '@/src/api/imports'
import { bannerProgress, bannerSub, historyDone, importEta } from '@/src/components/onboarding/importCopy'
import { useDismissedRolloverBanner } from '@/src/hooks/useDismissedRolloverBanner'
import { track } from '@/src/lib/analytics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/**
 * The slim strip on Home while an import's history comes in, and the nudge
 * once it's all in. Ported from Web's ImportBanner. Polls every 5 seconds only
 * while importing. When no pass holds the import (the first ran out of time,
 * or the app was closed), the poll starts the next one, so an open Home
 * finishes an import on its own.
 */

const POLL_MS = 5_000
/** A continue call takes a lease of ~70 s, so asking more often than this is just noise. */
const CONTINUE_EVERY_MS = 20_000
/** A sliver of bar from the start, so the first few hundred rows don't read as stuck. */
const MIN_FILL = 0.04

/**
 * Walks to each new `target` over `ms`, so a count that arrives in 5-second
 * jumps ticks up steadily instead. Lands one poll behind, never ahead. The
 * first known value shows as is: a reopen shouldn't replay the import from 0.
 * Twin of Web's ImportBanner useGlide.
 */
function useGlide(target: number | null, ms: number): number {
  const reduceMotion = useReducedMotion()
  const [value, setValue] = useState(target ?? 0)
  const [known, setKnown] = useState(target !== null)
  if (!known && target !== null) {
    setKnown(true)
    setValue(target)
  }
  const latest = useRef<number | null>(target)
  useEffect(() => {
    if (target === null || reduceMotion) return
    const from = latest.current
    if (from === null) {
      latest.current = target
      return
    }
    let frame = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / ms)
      latest.current = Math.round(from + (target - from) * t)
      setValue(latest.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, ms, reduceMotion])
  return reduceMotion && target !== null ? target : value
}

export function ImportBanner() {
  const { tokens, type, space } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()
  const { data } = useQuery<ImportStatus>({
    queryKey: ['import-status'],
    queryFn: getImportStatus,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.status === 'importing' ? POLL_MS : false),
  })
  const importId = data && data.status !== 'none' ? data.importId : null
  const [dismissed, setDismissed] = useDismissedRolloverBanner(`import-${importId ?? 'none'}`)
  const [leaving, setLeaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const lastContinue = useRef(0)
  const lastStatus = useRef<string | null>(null)
  const progress = useSharedValue(0)
  // Confetti only for an arrival they watched, not a done banner they come back to.
  const [arrived, setArrived] = useState(false)
  const status = data?.status ?? null
  const [seenStatus, setSeenStatus] = useState(status)
  if (status !== seenStatus) {
    setSeenStatus(status)
    if (seenStatus === 'importing' && status === 'done') setArrived(true)
  }
  const shown = useGlide(data && data.status !== 'none' ? data.done : null, POLL_MS)

  useEffect(() => {
    if (!data || data.status === 'none') return
    if (data.status === 'importing' && !data.leased && Date.now() - lastContinue.current > CONTINUE_EVERY_MS) {
      lastContinue.current = Date.now()
      void continueImport(data.importId).catch(() => {})
    }
    // Arriving at done: everything Home shows was written under it.
    if (lastStatus.current === 'importing' && data.status !== 'importing') {
      void qc.invalidateQueries()
      if (data.status === 'done') {
        const seconds = data.startedAt && data.finishedAt ? Math.round((Date.parse(data.finishedAt) - Date.parse(data.startedAt)) / 1000) : undefined
        track('import_done', { rows: data.total, failed: data.failed, ...(seconds !== undefined ? { seconds } : {}) })
      } else {
        track('import_failed', { stage: 'backfill' })
      }
    }
    lastStatus.current = data.status
  }, [data, qc])

  const total = data && data.status !== 'none' ? data.total : 0
  useEffect(() => {
    progress.value = withTiming(Math.max(MIN_FILL, total ? shown / total : 0), { duration: 200, easing: Easing.out(Easing.cubic) })
  }, [shown, total, progress])

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }))

  if (!data || data.status === 'none') return null
  // Only the done nudge is dismissable; progress and failure stay until they resolve.
  if (data.status === 'done' && dismissed !== false) return null

  const label = { fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }
  const sub = { fontSize: type.micro, fontFamily: fontFamily.bodyMedium }

  return (
    <View style={arrived && styles.above}>
      <SlideStrip
        leaving={leaving}
        gap={space.lg}
        onGone={() => {
          setDismissed(true)
          setLeaving(false)
        }}
      >
        {data.status === 'importing' && (
          <Card style={styles.card} elevated={false}>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: data.total, now: data.done }} style={styles.progress}>
              <Text style={[label, styles.count, { color: tokens.text }]}>{bannerProgress(shown, data.total)}</Text>
              <View style={[styles.track, { backgroundColor: tokens.inputBg }]}>
                <Animated.View style={[styles.bar, { backgroundColor: tokens.accent }, barStyle]} />
              </View>
              <Text style={[sub, { color: tokens.text2 }]}>{bannerSub(importEta(data.done, data.total, data.startedAt))}</Text>
            </View>
          </Card>
        )}

        {data.status === 'failed' && (
          <Card style={styles.card} elevated={false}>
            <Text accessibilityRole="alert" style={[label, styles.grow, { color: tokens.text }]}>
              Some of your history didn’t make it in. Check your connection and try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={retrying}
              hitSlop={8}
              onPress={async () => {
                setRetrying(true)
                try {
                  await continueImport(data.importId, true)
                  await qc.invalidateQueries({ queryKey: ['import-status'] })
                } catch {
                  // The banner stays as it is; the button is there to press again.
                } finally {
                  setRetrying(false)
                }
              }}
            >
              <Text style={[label, { color: tokens.accent, opacity: retrying ? 0.5 : 1 }]}>Try again</Text>
            </Pressable>
          </Card>
        )}

        {data.status === 'done' && (
          <Card style={[styles.card, { backgroundColor: tokens.pillGoodBg, borderColor: 'transparent' }]} elevated={false}>
            <View style={styles.grow}>
              <Text style={[label, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>{historyDone(data.total, data.failed)}</Text>
              <Text style={[sub, { color: tokens.text2 }]}>Want us to find your repeat payments?</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                setDismissed(true)
                router.push('/account/recurring-suggestions')
              }}
            >
              <Text style={[label, { color: tokens.mint, fontFamily: fontFamily.bodyExtraBold }]}>Find them</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={leaving} hitSlop={8} onPress={() => setLeaving(true)}>
              <Text style={[label, { color: tokens.text2 }]}>Not now</Text>
            </Pressable>
          </Card>
        )}
      </SlideStrip>
      {arrived && data.status === 'done' && (
        <View testID="import-confetti" style={styles.confetti} pointerEvents="none">
          {Array.from({ length: 18 }, (_, i) => <ConfettiPiece key={i} index={i} tokens={tokens} />)}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  progress: { flex: 1, gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  count: { fontVariant: ['tabular-nums'] },
  // Lifts the confetti over the cards below while it falls past the strip.
  above: { zIndex: 10 },
  confetti: { position: 'absolute', top: 0, left: 0, right: 0, height: 340 },
})
