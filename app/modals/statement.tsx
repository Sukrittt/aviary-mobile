import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { CaretDown, CaretRight, Check, CheckCircle, FileText, Images, Lock, Receipt, Sparkle, X } from '@/src/components/shared/icons'
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { CategoryPickerSheet } from '@/src/components/shared/CategoryPickerSheet'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { SelectCheck, SelectTint } from '@/src/components/shared/SelectCheck'
import { ConfettiPiece } from '@/src/components/onboarding/SetupDone'
import { SlideToConfirm } from '@/src/components/shared/SlideToConfirm'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { Icon } from '@/src/components/shared/Icon'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { LoadingPhrase } from '@/src/components/shared/LoadingPhrase'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useAddExpense } from '@/src/hooks/useExpenses'
import { invalidateExpenseCreateQueries } from '@/src/lib/expenseQueries'
import { useCategories, useCategoryTint } from '@/src/hooks/useCategories'
import { readStatement, StatementFailure, type StatementItem, type StatementProposal } from '@/src/api/statement'
import type { PickedFile } from '@/src/api/imports'
import { byDay, caughtUp, creditsLine, daySpan, statementExpense, type CaughtUp } from '@/src/features/fill-gap/gap'
import { downscaleImage } from '@/src/lib/downscaleImage'
import { canPickFiles, pickFile } from '@/src/lib/filePicker'
import { formatDateShort } from '@/src/lib/format'
import { splitEmoji } from '@/src/lib/emoji'
import { track } from '@/src/lib/analytics'
import * as Haptics from 'expo-haptics'
import { tap } from '@/src/lib/haptics'
import { useOnline } from '@/src/lib/netStatus'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { withReadOnlyGate } from '@/src/components/budgets/ReadOnlyNotice'

const MAX_SCREENSHOTS = 5
/** Five screenshots have to fit one request, so each goes smaller than a single bill scan. Same as Web. */
const SCREENSHOT_ENCODING = { maxEdge: 1600, quality: 0.6 }
const MAX_FILE_BYTES = 4 * 1024 * 1024
const STATEMENT_FILE = /\.(csv|tsv|txt|xlsx|pdf)$/i
const UNREADABLE = "Couldn't read that one. Try a CSV or Excel statement, or a screenshot of your payments."
const UNREADABLE_TITLE = 'Hard to read, that one'
const SKIP_LABEL = { logged: 'Looks logged already', before_last: 'Before your last log' } as const
/** Same beat as every other in-place success (CLAUDE.md). */
const SUCCESS_MS = 1100
/** Categories the done screen lists before folding the rest into "and N more". Same as Web. */
const DONE_CATEGORIES = 4
/** Saves in flight at once while logging. Each is a full round trip (about 2.5s), so one at a time crawled. */
const SAVE_CONCURRENCY = 4
/** Haptics as the rest of the app uses them: a selection tick for ticking rows (Activity), an error buzz when something fails (add-income). */
const select = () => Haptics.selectionAsync().catch(() => {})
const failedBuzz = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})

type RowState = { checked: boolean; category: string }

/**
 * "Add from statement or screenshot", from log-expense's More sheet and the
 * catch-up sheet on Home. The days you didn't log, read from your own UPI or
 * bank history: up to five screenshots, or a csv, xlsx or pdf, asking for a
 * locked pdf's password in place. Same
 * propose-then-confirm as chat capture. Rows that look logged already, or are
 * older than your last log, start unticked; credits are only counted. Each
 * row logs through the normal add-expense path with a hashed client_id, so
 * the same file twice adds nothing. The review reads like the Activity it's
 * about to become, and it ends on "You're caught up": what got filled in and
 * where the money went, so the last thing you see is that it worked. Twin of
 * Web's StatementModal.
 */
function StatementScreen() {
  const { tokens, space, radius, type } = useTheme()
  const { formatMoney } = useCurrency()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const addExpense = useAddExpense()
  const qc = useQueryClient()
  const [phase, setPhase] = useState<'pick' | 'reading' | 'password' | 'review' | 'error' | 'done'>('pick')
  // A locked pdf waiting on its password. The file stays so a wrong guess isn't a re-pick; the password lives only in the field.
  const [locked, setLocked] = useState<{ file: PickedFile; wrong: boolean; error: string } | null>(null)
  const [proposal, setProposal] = useState<StatementProposal | null>(null)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [error, setError] = useState('')
  const [failure, setFailure] = useState({ title: '', message: '' })
  const [saving, setSaving] = useState<'idle' | 'saving' | 'success'>('idle')
  const [pickingFor, setPickingFor] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState<CaughtUp | null>(null)
  const logged = useRef(new Map<string, string | null>())
  const online = useOnline()

  // The tick holds, then the caught-up screen. Cleared on unmount, so a screen already closed can't flip.
  useEffect(() => {
    if (saving !== 'success') return
    const timer = setTimeout(() => setPhase('done'), SUCCESS_MS)
    return () => clearTimeout(timer)
  }, [saving])

  async function read(input: Parameters<typeof readStatement>[0], kind: 'screenshots' | 'file') {
    setError('')
    setPhase('reading')
    try {
      const result = await readStatement(input)
      if (result.items.length === 0) {
        throw result.credits
          ? new StatementFailure("Only money coming in there, so there's nothing to add.", 'Nothing going out')
          : new StatementFailure(UNREADABLE, UNREADABLE_TITLE)
      }
      setProposal(result)
      setRows(Object.fromEntries(result.items.map((i) => [i.id, { checked: !i.suggestSkip, category: i.category }])))
      setPhase('review')
      track('statement_read', { kind, rows: result.items.length, credits: result.credits })
    } catch (err) {
      if ('file' in input && err instanceof StatementFailure && (err.code === 'pdf_locked' || err.code === 'pdf_password_wrong')) {
        if (err.code === 'pdf_password_wrong') failedBuzz()
        setLocked({ file: input.file, wrong: err.code === 'pdf_password_wrong', error: '' })
        setPhase('password')
        return
      }
      if ('file' in input && input.password && err instanceof StatementFailure && (err.code === 'rate_limited' || err.code === 'offline')) {
        // Worth another go with the same file, so stay on the password, not the error screen whose Try again starts over.
        failedBuzz()
        setLocked({ file: input.file, wrong: false, error: err.message })
        setPhase('password')
        return
      }
      // The mascot, a title and a way back, like Web: a failed read is the whole screen's news, not a line under the buttons.
      failedBuzz()
      setFailure(err instanceof StatementFailure ? { title: err.title, message: err.message } : { title: UNREADABLE_TITLE, message: UNREADABLE })
      setPhase('error')
    }
  }

  async function pickScreenshots() {
    if (!online) return
    tap()
    try {
      await chooseScreenshots()
    } catch {
      setError("Couldn't open that. Try again.")
    }
  }

  async function chooseScreenshots() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo access is off. You can turn it on in Settings.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_SCREENSHOTS,
      quality: 0.5,
      base64: true,
    })
    if (result.canceled || !result.assets?.length) return
    if (result.assets.length > MAX_SCREENSHOTS) {
      setError(`Up to ${MAX_SCREENSHOTS} screenshots at a time. Pick the ones that cover the days you missed.`)
      return
    }
    const images = []
    for (const asset of result.assets) {
      if (!asset.base64) continue
      const small = await downscaleImage(asset, SCREENSHOT_ENCODING)
      images.push(small ? { data: small.base64, mimeType: small.mimeType } : { data: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' })
    }
    if (images.length === 0) return setError("Couldn't read those screenshots. Try others.")
    void read({ images }, 'screenshots')
  }

  async function pickStatement() {
    if (!online) return
    tap()
    let file
    try {
      file = await pickFile()
    } catch {
      return setError("Couldn't open that. Try again.")
    }
    if (!file) return
    if (!STATEMENT_FILE.test(file.name)) return setError('Pick a CSV, Excel or PDF statement.')
    if ((file.size ?? 0) > MAX_FILE_BYTES) return setError("That's too big to upload. Try a shorter date range.")
    void read({ file }, 'file')
  }

  async function log() {
    if (!proposal) return
    const toLog = proposal.items.filter((i) => rows[i.id].checked)
    tap()
    setSaving('saving')
    setError('')
    let failed = 0
    let finished = 0
    let synced = false
    setProgress(0)
    // A few at a time, each day in its own lane: a day's rows save one after another, oldest
    // first, so Activity keeps the statement's order within the day (the timestamp is minted
    // when each save starts). Different days never share a spot in Activity, so they can overlap.
    // ponytail: one busy day still saves serially; stagger timestamps if that's ever the bottleneck.
    const lanes = new Map<string, StatementItem[]>()
    for (const item of toLog) lanes.set(item.date, [...(lanes.get(item.date) ?? []), item])
    const queue = [...lanes.values()]
    async function save(item: StatementItem) {
      if (!logged.current.has(item.id)) {
        try {
          // Refetched once at the end, not after every row.
          const saved = await addExpense.mutateAsync({ ...statementExpense(item, rows[item.id].category), deferRefresh: true })
          // null: the server already had it, so it's handled but not new.
          logged.current.set(item.id, saved?.duplicate ? null : rows[item.id].category)
          if (!saved?.pending) synced = true
        } catch {
          failed++
        }
      }
      setProgress(++finished)
    }
    await Promise.all(Array.from({ length: SAVE_CONCURRENCY }, async () => {
      for (let lane = queue.shift(); lane; lane = queue.shift()) for (const item of lane) await save(item)
    }))
    // Queued (offline) saves are already in the cache and not on the server yet, so they need no refetch.
    if (synced) void invalidateExpenseCreateQueries(qc)
    if (failed > 0) {
      failedBuzz()
      setSaving('idle')
      setError(`Couldn't log ${failed === toLog.length ? 'these' : failed}. Check your connection and try again.`)
      return
    }
    track('statement_logged', { rows: toLog.length, unchecked: proposal.items.length - toLog.length })
    // Everything newly saved here, with the category it was saved under, including rows an earlier failed try saved and you've since unticked.
    setDone(caughtUp(proposal.items.filter((i) => logged.current.get(i.id) != null).map((i) => ({ amount: i.amount, date: i.date, category: logged.current.get(i.id) ?? '' }))))
    setSaving('success')
  }

  const busy = saving !== 'idle'
  const items = proposal?.items ?? []
  const checked = items.filter((i) => rows[i.id]?.checked)
  const missing = checked.some((i) => !rows[i.id].category)
  const total = checked.reduce((sum, i) => sum + i.amount, 0)
  const credits = proposal ? creditsLine(proposal.credits) : null
  const picking = items.find((i) => i.id === pickingFor)
  const days = useMemo(() => byDay(proposal?.items ?? []), [proposal])
  const dates = items.map((i) => i.date).sort()
  const allOn = items.length > 0 && checked.length === items.length
  const setChecked = (ids: string[], on: boolean) =>
    setRows((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, { ...prev[id], checked: on }])) }))
  const caption = { color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }
  // Onboarding's saving button: it greys out and fills left to right as rows land.
  const saveFill = useSharedValue(0)
  const saveFillStyle = useAnimatedStyle(() => ({ width: `${saveFill.value * 100}%` }))
  useEffect(() => {
    saveFill.value = saving === 'saving' && checked.length ? withTiming(progress / checked.length, { duration: 350 }) : 0
  }, [saving, progress, checked.length, saveFill])

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
      {phase !== 'done' && <View style={[styles.header, { paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, gap: space.md, borderBottomColor: tokens.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          disabled={busy}
          hitSlop={12}
          style={[styles.headerBtn, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.full }]}
        >
          <X size={16} color={tokens.text} />
        </Pressable>
        <Text style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>
          {phase === 'review' ? 'Check these, then log' : 'Add from statement or screenshot'}
        </Text>
      </View>}

      {phase === 'pick' && (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
            <Animated.Text accessibilityRole="header" entering={reveal(0)} style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title }}>
              Fill in the days you missed
            </Animated.Text>
            <Animated.Text entering={reveal(1)} style={caption}>Your UPI or bank app already has them. Bring them here and pick what to add.</Animated.Text>
            <Animated.View entering={reveal(2)} style={[styles.steps, { marginTop: space.sm, backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg }]}>
              {STEPS.map((step, i) => (
                <Animated.View
                  key={step.label}
                  entering={reveal(3 + i)}
                  style={[styles.step, { gap: space.md, padding: space.md, borderTopColor: tokens.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0 }]}
                >
                  <View style={[styles.tile, { backgroundColor: i ? tokens.inputBg : tokens.accentSoft }]}>
                    <Icon icon={step.icon} size={18} color={i ? tokens.text2 : tokens.accentInk} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{step.label}</Text>
                    <Text style={caption}>{step.hint}</Text>
                  </View>
                </Animated.View>
              ))}
            </Animated.View>
          </ScrollView>
          {/* The thumb zone: both ways in sit at the bottom, big enough to hit one-handed. */}
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.md, gap: space.sm }}>
            {!online && <Text style={{ ...caption, color: tokens.warnInk }}>You&apos;re offline. Uploads need a connection.</Text>}
            {error !== '' && <Text accessibilityRole="alert" style={{ ...caption, color: tokens.coral }}>{error}</Text>}
            <Animated.View entering={reveal(6)}>
              <PickButton primary icon={Images} label="Choose screenshots" hint="Up to 5 from your UPI or bank app" onPress={pickScreenshots} disabled={!online} />
            </Animated.View>
            {canPickFiles && (
              <Animated.View entering={reveal(7)}>
                <PickButton icon={FileText} label="Choose a statement" hint="CSV, Excel or PDF from net banking" onPress={pickStatement} disabled={!online} />
              </Animated.View>
            )}
          </View>
        </View>
      )}

      {phase === 'error' && (
        <View accessibilityRole="alert" style={[styles.center, { padding: space.lg, paddingBottom: insets.bottom + space.lg }]}>
          <EmptyState mood="searching" title={failure.title} description={failure.message} action={{ label: 'Try again', onPress: () => setPhase('pick') }} />
        </View>
      )}

      {phase === 'password' && locked && (
        <StatementPassword
          name={locked.file.name}
          wrong={locked.wrong}
          error={locked.error}
          bottomInset={insets.bottom}
          onSubmit={(password) => void read({ file: locked.file, password }, 'file')}
          onPickAnother={() => setPhase('pick')}
        />
      )}

      {phase === 'reading' && (
        <View style={styles.center}>
          <LoadingCaption phrases={['Reading your payments…', 'Matching payees to categories…', 'Checking what you already logged…', 'Almost done…']} />
        </View>
      )}

      {phase === 'review' && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
            <View style={[styles.summary, { paddingVertical: space.md }]}>
              <Text style={{ ...caption, fontFamily: fontFamily.bodySemiBold }}>
                {items.length} {items.length === 1 ? 'payment' : 'payments'} · {daySpan(dates[0], dates[dates.length - 1])}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => {
                select()
                setChecked(items.map((i) => i.id), !allOn)
              }} disabled={busy} hitSlop={10}>
                <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>{allOn ? 'Untick all' : 'Tick all'}</Text>
              </Pressable>
            </View>
            {days.map((day) => (
              <View key={day.date} style={{ marginBottom: space.md, gap: 6 }}>
                <View style={[styles.dayHead, { borderBottomColor: tokens.borderStrong, paddingHorizontal: space.xs }]}>
                  <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: 14 }}>{formatDateShort(day.date)}</Text>
                  <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: 13 }}>{formatMoney(day.rows.reduce((sum, i) => sum + i.amount, 0))}</Text>
                </View>
                {day.rows.map((item) => (
                  <ReviewRow
                    key={item.id}
                    item={item}
                    row={rows[item.id]}
                    busy={busy}
                    onToggle={() => setChecked([item.id], !rows[item.id].checked)}
                    onPickCategory={() => setPickingFor(item.id)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
          <View style={[styles.footer, { padding: space.lg, paddingBottom: insets.bottom + space.md, gap: space.sm, borderTopColor: tokens.border }]}>
            {credits && <Text style={caption}>{credits}</Text>}
            {missing && <Text style={{ ...caption, color: tokens.warnInk }}>Pick a category for the ticked rows to log them.</Text>}
            {error !== '' && <Text accessibilityRole="alert" style={{ ...caption, color: tokens.coral }}>{error}</Text>}
            {saving === 'idle' && checked.length > 0 ? (
              <SlideToConfirm icon={Receipt} label={`Slide to log ${checked.length} · ${formatMoney(total)}`} onConfirm={log} disabled={missing} />
            ) : (
            <Pressable
              accessibilityRole="button"
              onPress={log}
              disabled={busy || checked.length === 0 || missing}
              accessibilityState={{ disabled: busy || checked.length === 0 || missing, busy: saving === 'saving' }}
              style={[
                styles.primary,
                {
                  backgroundColor: saving === 'success' ? tokens.successBg : saving === 'saving' ? tokens.inputBg : tokens.accent,
                  borderRadius: radius.full,
                  opacity: saving === 'idle' && (checked.length === 0 || missing) ? 0.5 : 1,
                },
              ]}
            >
              {saving === 'success' ? (
                <CheckIcon color={tokens.onSuccess} />
              ) : saving === 'saving' ? (
                <>
                  <Animated.View pointerEvents="none" style={[styles.saveFill, saveFillStyle]} />
                  <LoadingPhrase
                    phrases={[checked.length > 1 ? `Logging ${progress} of ${checked.length}…` : 'Logging…']}
                    color={tokens.text3}
                    style={{ fontFamily: fontFamily.bodyBold, fontSize: type.body, textAlign: 'center' }}
                  />
                </>
              ) : (
                <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>
                  Tick what to add
                </Text>
              )}
            </Pressable>
            )}
          </View>
        </>
      )}

      {phase === 'done' && done && (
        <StatementDone done={done} onDone={() => router.back()} onActivity={() => router.dismissTo('/(tabs)/activity')} />
      )}

      <CategoryPickerSheet
        visible={picking !== undefined}
        onClose={() => setPickingFor(null)}
        value={picking ? rows[picking.id].category : ''}
        onSelect={(category) => {
          // Choosing a category for a row means you want it: tick it too.
          if (picking) setRows((prev) => ({ ...prev, [picking.id]: { ...prev[picking.id], category, checked: category ? true : prev[picking.id].checked } }))
          setPickingFor(null)
        }}
        title="Category"
        noneLabel="No category"
      />
    </View>
  )
}

/** Staggered rise for the picker, one beat per step. Reanimated drops it under the system's reduce-motion setting. */
const reveal = (step: number) => FadeInDown.delay(step * 25).duration(220)

const STEPS = [
  { icon: Images, label: 'Screenshot or download', hint: 'Your UPI app history, or a statement from net banking.' },
  { icon: Sparkle, label: 'We read the payments', hint: "Money going out only. Anything you've logged starts unticked." },
  { icon: CheckCircle, label: 'You pick what to add', hint: "Nothing's logged until you say so." },
] as const

/** A locked pdf's password, asked for in place. Sent once with the file, never kept. */
function StatementPassword({ name, wrong, error, bottomInset, onSubmit, onPickAnother }: {
  name: string
  wrong: boolean
  error: string
  bottomInset: number
  onSubmit: (password: string) => void
  onPickAnother: () => void
}) {
  const { tokens, space, radius, type } = useTheme()
  const [password, setPassword] = useState('')
  // Once per showing: a double tap, or Go plus the button, lands before the reading screen does. A wrong guess remounts this.
  const sent = useRef(false)
  const caption = { color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }
  const submit = () => {
    if (!password || sent.current) return
    sent.current = true
    onSubmit(password)
  }
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, paddingBottom: bottomInset + space.lg, gap: space.sm }}>
      <View style={[styles.tile, styles.pickTile, { alignSelf: 'center', backgroundColor: tokens.accentSoft }]}>
        <Icon icon={Lock} size={22} color={tokens.accentInk} />
      </View>
      <Text accessibilityRole="header" style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title, textAlign: 'center' }}>
        {name} has a password
      </Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        returnKeyType="go"
        onSubmitEditing={submit}
        accessibilityLabel="Password"
        accessibilityHint="Usually your date of birth, customer ID, or the format your bank's email mentions"
        placeholder="Password"
        placeholderTextColor={tokens.text3}
        style={{
          marginTop: space.sm,
          backgroundColor: tokens.inputBg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: wrong ? tokens.coral : tokens.border,
          paddingHorizontal: 14,
          paddingVertical: 14,
          color: tokens.text,
          fontFamily: fontFamily.bodyMedium,
          fontSize: type.body,
        }}
      />
      {(wrong || error !== '') && (
        <Text accessibilityRole="alert" style={{ ...caption, color: tokens.coral }}>{wrong ? "That didn't open it, try again." : error}</Text>
      )}
      <Text style={caption}>Usually your date of birth (DDMMYYYY), customer ID, or the format your bank&apos;s email mentions.</Text>
      <Text style={caption}>Used once to open the file. Never saved.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={submit}
        disabled={!password}
        accessibilityState={{ disabled: !password }}
        style={[styles.primary, { marginTop: space.sm, backgroundColor: tokens.accent, borderRadius: radius.full, opacity: password ? 1 : 0.5 }]}
      >
        <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>Open it</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onPickAnother} hitSlop={8} style={{ alignSelf: 'center', padding: space.sm }}>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>Pick another file</Text>
      </Pressable>
    </ScrollView>
  )
}

function PickButton({ icon, label, hint, onPress, disabled, primary }: { icon: typeof Images; label: string; hint: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  const { tokens, space, radius, type } = useTheme()
  const ink = primary ? tokens.onAccent : tokens.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pick,
        {
          gap: space.md,
          paddingHorizontal: space.md,
          backgroundColor: primary ? tokens.accent : tokens.card,
          borderColor: primary ? tokens.accent : tokens.borderStrong,
          borderRadius: radius.lg,
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.tile, styles.pickTile, { backgroundColor: primary ? 'rgba(255, 255, 255, 0.2)' : tokens.accentSoft }]}>
        <Icon icon={icon} size={22} color={primary ? tokens.onAccent : tokens.accentInk} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: ink, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{label}</Text>
        <Text style={{ color: ink, opacity: primary ? 0.85 : 0.7, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{hint}</Text>
      </View>
      <CaretRight size={18} color={ink} />
    </Pressable>
  )
}

/** Reads like the Activity row it's about to become: Activity's select tick and wash, the category's tinted icon, name, amount. */
function ReviewRow({ item, row, busy, onToggle, onPickCategory }: {
  item: StatementItem
  row: RowState
  busy: boolean
  onToggle: () => void
  onPickCategory: () => void
}) {
  const { tokens, space, radius, type } = useTheme()
  const { formatMoney } = useCurrency()
  const tintOf = useCategoryTint()
  const categories = useCategories().data ?? []
  const category = categories.find((c) => c.name === row.category)
  const tint = row.category ? tintOf(row.category) : { bg: tokens.inputBg, ink: tokens.text3 }
  const dim = !row.checked
  const missing = row.checked && !row.category
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: row.checked, disabled: busy }}
      accessibilityLabel={`Add ${item.item}, ${formatMoney(item.amount)}`}
      onPress={() => {
        select()
        onToggle()
      }}
      disabled={busy}
      style={[styles.row, { gap: space.md, paddingHorizontal: space.md, borderRadius: radius.lg }]}
    >
      <SelectTint selected={row.checked} style={{ borderRadius: radius.lg }} />
      <SelectCheck selecting selected={row.checked} gap={space.md} />
      <View style={[styles.avatar, { backgroundColor: tint.bg, opacity: dim ? 0.55 : 1 }]}>
        <CategoryIcon name={row.category} icon={category?.icon} group={category?.group} size={16} color={tint.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text numberOfLines={1} style={{ color: dim ? tokens.text3 : tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>{item.item}</Text>
        <View style={styles.meta}>
          <Pressable
            onPress={() => {
              tap()
              onPickCategory()
            }}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={row.category ? `Category for ${item.item}: ${splitEmoji(row.category).text}. Change it` : `Pick a category for ${item.item}`}
            style={[
              styles.chip,
              {
                backgroundColor: missing ? tokens.warnSoft : tokens.inputBg,
                borderColor: missing ? tokens.warnInk : tokens.borderStrong,
                borderRadius: radius.full,
              },
            ]}
          >
            <Text numberOfLines={1} style={{ flexShrink: 1, color: missing ? tokens.warnInk : tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
              {row.category ? splitEmoji(row.category).text : 'Pick a category'}
            </Text>
            <Icon icon={CaretDown} size={11} color={missing ? tokens.warnInk : tokens.text3} />
          </Pressable>
          {item.suggestSkip ? (
            <Text numberOfLines={1} style={{ flexShrink: 1, color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.micro }}>
              {SKIP_LABEL[item.suggestSkip]}
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={{ color: dim ? tokens.text3 : tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>{formatMoney(item.amount)}</Text>
    </Pressable>
  )
}

/** The end of the flow: what got filled in and where it went. SetupDone's celebration, calmer. */
function StatementDone({ done, onDone, onActivity }: { done: CaughtUp; onDone: () => void; onActivity: () => void }) {
  const { tokens, space, radius } = useTheme()
  const { formatMoney } = useCurrency()
  const insets = useSafeAreaInsets()
  const tintOf = useCategoryTint()
  const categories = useCategories().data ?? []
  const confetti = useMemo(() => Array.from({ length: 18 }, (_, i) => i), [])
  // "and 1 more" would take the room the row itself needs, so fold only when it saves two or more.
  const shown = done.categories.length > DONE_CATEGORIES + 1 ? done.categories.slice(0, DONE_CATEGORIES) : done.categories
  const more = done.categories.length - shown.length

  return (
    <View style={{ flex: 1, paddingTop: insets.top + space.xl, paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.md }}>
      <View style={styles.confetti} pointerEvents="none">
        {confetti.map((i) => (
          <ConfettiPiece key={i} index={i} tokens={tokens} />
        ))}
      </View>
      <Animated.View entering={FadeIn.duration(350)} style={[styles.badge, { backgroundColor: tokens.mintSoft }]}>
        <Check size={30} color={tokens.mint} weight="bold" />
      </Animated.View>
      <Animated.Text accessibilityRole="header" entering={FadeIn.delay(80).duration(350)} style={[styles.doneTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
        You&apos;re caught up.
      </Animated.Text>
      <Animated.Text entering={FadeIn.delay(140).duration(350)} style={[styles.doneCopy, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
        {done.count > 0
          ? `${daySpan(done.from, done.to)} is filled in. Your categories now match what you actually spent.`
          : 'Those were already in your budget, so nothing doubled up.'}
      </Animated.Text>

      {done.count > 0 && (
        <>

      <Animated.View
        entering={FadeIn.delay(200).duration(350)}
        style={[styles.doneCard, { marginTop: space.lg, padding: space.md, backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg }]}
      >
        <View style={[styles.doneTotal, { borderBottomColor: tokens.border, paddingBottom: space.md }]}>
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: 13 }}>
            {done.count} {done.count === 1 ? 'payment' : 'payments'} added
          </Text>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: 22 }}>{formatMoney(done.total)}</Text>
        </View>
        {shown.map((c) => {
          const row = categories.find((r) => r.name === c.name)
          const tint = tintOf(c.name)
          return (
            <View key={c.name} style={[styles.doneRow, { gap: space.md, marginTop: space.md }]}>
              <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
                <CategoryIcon name={c.name} icon={row?.icon} group={row?.group} size={16} color={tint.ink} />
              </View>
              <Text numberOfLines={1} style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.bodyMedium, fontSize: 15 }}>{splitEmoji(c.name).text}</Text>
              <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>{formatMoney(c.total)}</Text>
            </View>
          )
        })}
        {more > 0 && (
          <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: 12, marginTop: space.md, marginLeft: 44 }}>
            and {more} more {more === 1 ? 'category' : 'categories'}
          </Text>
        )}
      </Animated.View>
      <Animated.Text entering={FadeIn.delay(240).duration(350)} style={{ color: tokens.text3, fontFamily: fontFamily.bodyMedium, fontSize: 12, marginTop: space.md }}>
        Upload the same file again and nothing doubles up.
      </Animated.Text>
        </>
      )}

      <View style={{ flex: 1 }} />
      <Animated.View entering={FadeIn.delay(260).duration(350)} style={{ gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            tap()
            onDone()
          }}
          style={[styles.primary, { backgroundColor: tokens.accent, borderRadius: radius.full }]}
        >
          <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: 15 }}>Done</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            tap()
            onActivity()
          }}
          style={[styles.primary, { borderRadius: radius.full }]}>
          <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold, fontSize: 15 }}>See them in Activity</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pick: { flexDirection: 'row', alignItems: 'center', minHeight: 76, borderWidth: 1 },
  pickTile: { width: 44, height: 44, borderRadius: 14 },
  tile: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  steps: { borderWidth: 1, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, overflow: 'hidden' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, maxWidth: '70%', paddingLeft: 9, paddingRight: 7, paddingVertical: 3, borderWidth: 1 },
  confetti: { position: 'absolute', top: 0, left: 0, right: 0, height: 340, overflow: 'hidden' },
  badge: { width: 60, height: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 30, lineHeight: 36, marginTop: 14, letterSpacing: -0.3 },
  doneCopy: { fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 320 },
  doneCard: { borderWidth: 1 },
  doneTotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  doneRow: { flexDirection: 'row', alignItems: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
  primary: { height: 48, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  saveFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.22)' },
})

export default withReadOnlyGate(StatementScreen)
