import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { ArrowLeft, CaretDown, CaretRight, Check, FileText, Plus, SealCheck } from '@/src/components/shared/icons'
import { CurrencyPicker } from '@/src/components/CurrencyPicker'
import { CurrencyScope, useCurrency } from '@/src/context/CurrencyContext'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { LoadingPhrase } from '@/src/components/shared/LoadingPhrase'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { BottomSheet } from '@/src/components/shared/Modal'
import { PopIn } from '@/src/components/shared/PopIn'
import { StepDot } from '@/src/components/onboarding/StepDot'
import { currencyInfo } from '@/src/lib/currencies'
import { track } from '@/src/lib/analytics'
import { tap } from '@/src/lib/haptics'
import { pickFile } from '@/src/lib/filePicker'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { commitImport, ImportFailure, previewImport, recomputeImport, type CommitResult, type ImportAccountType, type ImportReview } from '@/src/api/imports'
import { commitSteps, countsLine, directionCopy, importErrorCopy, ordinal, precheckFile, shortDate, skippedCopy } from './importCopy'

/**
 * "How do you want to start?": the first onboarding step, and the import that follows
 * it. Ported from Web's ImportFlow. The review is the only screen with work
 * on it; nothing is written until its button is pressed.
 */

const MAX_BYTES = 4 * 1024 * 1024
/** The server's name for spends without a category (Web's lib/import/propose.ts UNCATEGORISED). */
const UNCATEGORISED = 'Uncategorised'
/** Web's lib/accounts.ts MAX_BANK_ACCOUNTS: the balance check asks about at most five. */
const MAX_BANK_ACCOUNTS = 5
/** How long the success tick holds before the celebration, as every other success CTA. */
const SUCCESS_MS = 1100

/** `file`: what the app exports, for the hint under Choose a file. `note`: what trips people up (a paid-only
 * export, a missing platform, a file sent by email). `help`: the app's own export guide, which keeps its
 * screenshots current so we don't have to. */
type AppChoice = { id: string; name: string; by?: string; file: string; how: string[]; note?: string; help?: string }

// Checked against each app's help pages in Oct 2026. Web's APPS says the same with `›` breadcrumbs.
const APPS: AppChoice[] = [
  {
    id: 'moneymanager', name: 'Money Manager', by: 'Realbyte', file: 'xlsx',
    how: ['On the Trans. tab, switch to Total.', 'Tap Export data to Excel and send it to your email.', 'Save the file from that email and pick it here.'],
    help: 'https://help.realbyteapps.com/hc/en-us/articles/360046150874-Home-tab',
  },
  {
    id: 'monefy', name: 'Monefy', file: 'csv',
    how: ['In Monefy, open the ⋮ menu, then Settings.', 'Tap Export to file.', 'Save the csv to your phone and pick it here.'],
    help: 'https://www.monefy.com/help-center',
  },
  {
    id: 'wallet', name: 'Wallet', by: 'BudgetBakers', file: 'csv',
    how: ['In Wallet on Android, open the ≡ menu, then Others, then Export.', 'Pick CSV and the dates you want.', 'Save the file and pick it here.'],
    note: 'Exporting needs Wallet Premium. The iPhone app can’t export, so use Wallet on the web there: Records, then Export.',
    help: 'https://support.budgetbakers.com/hc/en-us/articles/7151606064018-How-to-export-transactions-from-Wallet',
  },
  {
    id: 'spendee', name: 'Spendee', file: 'csv',
    how: ['In Spendee, open More, then Export.', 'Pick all accounts and the whole period.', 'Choose CSV, save it and pick it here.'],
    note: 'On the free plan you get your last 365 days.',
    help: 'https://help.spendee.com/article/137-export-transactions',
  },
  {
    id: 'ynab', name: 'YNAB', file: 'zip',
    how: ['On app.ynab.com, tap your plan’s name at the top left.', 'Pick Export Plan.', 'Pick the zip as it is. No need to unzip it.'],
    note: 'The YNAB phone app can’t export, so use the web.',
    help: 'https://support.ynab.com/en_us/how-to-export-plan-data-Sy_CouWA9',
  },
  {
    id: 'goodbudget', name: 'Goodbudget', file: 'csv',
    how: ['Log in on goodbudget.com and open Transactions.', 'Tap Export CSV above the list.', 'Pick the csv here.'],
    note: 'Goodbudget exports your spending, not your envelope amounts. We work those out from what you spent.',
    help: 'https://goodbudget.com/help/customize-your-goodbudget/export-transactions/',
  },
  {
    id: 'axio', name: 'axio', by: 'formerly Walnut', file: 'csv',
    how: ['In axio’s Money Manager tab, tap your profile at the top right.', 'Under Expense Tracking, tap Email Statements.', 'Save the CSV from that email, not the PDF, and pick it here.'],
    note: 'It comes by email. Check Spam or Promotions if you can’t see it.',
    help: 'https://www.axio.co.in/faq',
  },
]
// The catch-all sits under the list as a text link, not as an eighth "app".
const OTHER: AppChoice = { id: 'other', name: 'Another app or a spreadsheet', file: 'csv or xlsx', how: ['Any file with a date, an amount and a description works.', 'One row per transaction.'] }

/** The app a file came from, by the id the server detected. Null for a spreadsheet or an app without a preset. Web's appName. */
function appName(id: string): string | null {
  return APPS.find((a) => a.id === id)?.name ?? null
}

const ACCOUNT_TYPES: { value: ImportAccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
]

const READING = ['Reading your file…', 'Sorting your categories…', 'Looking for your payday…', 'Adding up a typical month…']

type StartChoice = 'fresh' | 'switch'
const START_CHOICES: { id: StartChoice; title: string; detail: string }[] = [
  { id: 'fresh', title: 'I’m starting fresh', detail: 'We’ll guide you through it in about a minute.' },
  { id: 'switch', title: 'I’m switching apps', detail: 'Bring your envelopes and history from YNAB, Wallet and more.' },
]

type Stage = 'ask' | 'pick' | 'upload' | 'review'
const STAGES: Stage[] = ['ask', 'pick', 'upload', 'review']

export interface ImportDone {
  result: CommitResult
  currency: string
}

// onAlreadySetUp: the server refused because setup was finished on another
// device. There's nothing to fix here, so the screen hands the user on.
export function ImportFlow({ onFresh, onDone, onAlreadySetUp }: { onFresh: () => void; onDone: (done: ImportDone) => void; onAlreadySetUp: () => void }) {
  const { tokens } = useTheme()
  const [stage, setStage] = useState<Stage>('ask')
  const [app, setApp] = useState<AppChoice | null>(null)
  const [review, setReview] = useState<ImportReview | null>(null)
  const [start, setStart] = useState<StartChoice>('fresh')
  const at = STAGES.indexOf(stage)

  const back = () => setStage((s) => (s === 'review' ? 'upload' : s === 'upload' ? 'pick' : 'ask'))

  const pick = (a: AppChoice) => {
    Haptics.selectionAsync().catch(() => {})
    setApp(a)
    track('import_started', { app: a.id })
    setStage('upload')
  }

  return (
    <>
      <View style={styles.topRow}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={back}
          disabled={stage === 'ask'}
          style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border, opacity: stage === 'ask' ? 0.35 : 1 }]}
        >
          <ArrowLeft size={16} color={tokens.text} />
        </Pressable>
        <View style={styles.dots} accessibilityLabel={`Step ${at + 1} of ${STAGES.length}`}>
          {STAGES.map((s, i) => (
            <StepDot key={s} active={i <= at} activeColor={tokens.accent} inactiveColor={tokens.borderStrong} onPress={() => {}} />
          ))}
        </View>
      </View>

      {stage === 'ask' && (
        // Two equal ways in, as radio cards: starting fresh is as good a start as
        // switching. Fresh is picked to begin with, since most people won't have an export.
        <Animated.View key="ask" entering={FadeIn.duration(280)} style={styles.ask}>
          <Title>How do you want to start?</Title>
          <Blurb>Both get you a budget in a few minutes.</Blurb>
          <View style={styles.choices} accessibilityRole="radiogroup">
            {START_CHOICES.map((c, i) => (
              <Choice key={c.id} delay={60 + i * 60} title={c.title} detail={c.detail} on={start === c.id} onPress={() => setStart(c.id)} />
            ))}
          </View>
          <Continue onPress={() => (start === 'fresh' ? onFresh() : setStage('pick'))} />
        </Animated.View>
      )}

      {stage === 'pick' && (
        <Animated.View key="pick" entering={FadeIn.duration(220)} style={styles.fill}>
          <Title>Where are you coming from?</Title>
          <Blurb>Pick your app and we’ll tell you how to export from it.</Blurb>
          <ScrollView style={styles.fill} contentContainerStyle={styles.appList} showsVerticalScrollIndicator={false}>
            {APPS.map((a, i) => (
              <PopIn key={a.id} play delay={40 + i * 35}>
                <Press
                  accessibilityLabel={a.by ? `${a.name}, ${a.by}` : a.name}
                  onPress={() => pick(a)}
                  style={[styles.appRow, { backgroundColor: tokens.card, borderColor: tokens.border }]}
                >
                  <View style={styles.fill}>
                    <Text style={[styles.appName, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>{a.name}</Text>
                    {a.by && <Text style={[styles.appBy, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{a.by}</Text>}
                  </View>
                  <CaretRight size={16} color={tokens.text3} />
                </Press>
              </PopIn>
            ))}
            <Pressable accessibilityRole="button" onPress={() => pick(OTHER)} hitSlop={8} style={styles.textAction}>
              <Text style={[styles.textActionLabel, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}>Using something else? Pick any csv or xlsx</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      )}

      {stage === 'upload' && app && (
        <Upload
          app={app}
          onAlreadySetUp={onAlreadySetUp}
          onPreview={(r) => {
            setReview(r)
            setStage('review')
          }}
        />
      )}

      {stage === 'review' && review && (
        <CurrencyScope code={review.currency}>
          <Review review={review} picked={app} onReview={(r) => setReview((prev) => ({ ...r, filename: prev?.filename ?? r.filename }))} onDone={onDone} onAlreadySetUp={onAlreadySetUp} />
        </CurrencyScope>
      )}
    </>
  )
}

function Upload({ app, onPreview, onAlreadySetUp }: { app: AppChoice; onPreview: (review: ImportReview) => void; onAlreadySetUp: () => void }) {
  const { tokens } = useTheme()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Back during a slow preview unmounts this step; a late answer mustn't pull the user back to review.
  const live = useRef(true)
  useEffect(() => () => {
    live.current = false
  }, [])

  const choose = async () => {
    if (busy) return
    tap()
    setError('')
    let file: Awaited<ReturnType<typeof pickFile>>
    try {
      file = await pickFile()
    } catch {
      setError('We couldn’t open your files. Try again.')
      return
    }
    if (!file) return
    // An empty file, a PDF, a photo or an old .xls: say so now, not after an upload.
    const bad = precheckFile(file, MAX_BYTES)
    if (bad) {
      setError(importErrorCopy(bad))
      track('import_failed', { stage: bad === 'too_big' ? 'preview' : 'precheck', reason: bad })
      return
    }
    setBusy(true)
    try {
      const review = await previewImport(file)
      if (!live.current) return
      track('import_previewed', {
        picked: app.id,
        detected: review.app,
        spends: review.counts.expense,
        paydays: review.counts.income,
        categories: review.categories.length,
        accounts: review.accounts.length,
        ...Object.fromEntries(Object.entries(review.skipped).map(([reason, count]) => [`skipped_${reason}`, count ?? 0])),
      })
      // The upload goes from the picker's cache copy, so the server only ever sees a random name.
      onPreview({ ...review, filename: file.name })
    } catch (err) {
      if (!live.current) return
      const code = err instanceof ImportFailure ? err.code : 'network'
      if (code === 'already_onboarded') return onAlreadySetUp()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setError(importErrorCopy(code))
      track('import_failed', { stage: 'preview', reason: code, detail: err instanceof ImportFailure ? err.detail ?? '' : 'unknown' })
    } finally {
      if (live.current) setBusy(false)
    }
  }

  return (
    <Animated.View key="upload" entering={FadeIn.duration(220)} style={styles.fill}>
      {/* Steps, note and drop box scroll on short phones so the button below stays in reach. */}
      <ScrollView style={styles.fill} contentContainerStyle={styles.uploadBody} showsVerticalScrollIndicator={false}>
        <Title>Pick your export</Title>
        <Blurb>{app.id === 'other' ? app.name : `From ${app.name}`}</Blurb>
        <View style={styles.steps}>
          {app.how.map((line, i) => (
            <Animated.View key={line} entering={FadeInDown.delay(80 + i * 70).duration(260)} style={styles.stepRow}>
              <View style={[styles.stepNum, { backgroundColor: tokens.accentSoft }]}>
                <Text style={[styles.stepNumText, { color: tokens.accentInk, fontFamily: fontFamily.bodyExtraBold }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{line}</Text>
            </Animated.View>
          ))}
        </View>
        {(app.note || app.help) && (
          <Animated.View entering={FadeInDown.delay(80 + app.how.length * 70).duration(260)} style={styles.howExtra}>
            {app.note && <Text style={[styles.howNote, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{app.note}</Text>}
            {app.help && (
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(app.help!)} hitSlop={8}>
                <Text style={[styles.howHelp, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>{`Still stuck? See ${app.name}’s own guide`}</Text>
              </Pressable>
            )}
          </Animated.View>
        )}
        {/* The box rises in after the steps, as the next thing to read. */}
        <Animated.View entering={FadeInDown.delay(80 + app.how.length * 70).duration(260)}>
          <Press
            accessibilityLabel="Choose your export file"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={choose}
            style={[styles.drop, { borderColor: busy ? tokens.accent : tokens.borderStrong, backgroundColor: busy ? tokens.accentSoft : tokens.inputBg }]}
          >
            {busy ? (
              <LoadingCaption phrases={READING} ordered />
            ) : (
              <>
                <View style={[styles.dropIcon, { backgroundColor: tokens.accentSoft }]}>
                  <FileText size={22} color={tokens.accentInk} weight="bold" />
                </View>
                <Text style={[styles.dropTitle, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>Choose a file</Text>
                <Text style={[styles.dropHint, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{app.file} · up to 4 MB</Text>
              </>
            )}
          </Press>
        </Animated.View>
        {error !== '' && (
          <Animated.Text entering={FadeIn.duration(180)} accessibilityRole="alert" style={[styles.error, { color: tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>
            {error}
          </Animated.Text>
        )}
      </ScrollView>
      {/* The same action within the thumb's reach, where every other step keeps its button. */}
      <Animated.View entering={FadeInDown.delay(160 + app.how.length * 70).duration(260)}>
        <Press
          disabled={busy}
          accessibilityState={{ busy, disabled: busy }}
          onPress={choose}
          style={[styles.cta, { backgroundColor: busy ? tokens.inputBg : tokens.accent }]}
        >
          <Text style={[styles.ctaText, { color: busy ? tokens.text3 : tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>
            {busy ? 'Reading your file…' : error ? 'Try another file' : 'Choose your file'}
          </Text>
        </Press>
      </Animated.View>
    </Animated.View>
  )
}

type CategoryEdit = ImportReview['categories'][number]
type AccountEdit = ImportReview['accounts'][number]

function Review({ review, picked, onReview, onDone, onAlreadySetUp }: { review: ImportReview; picked: AppChoice | null; onReview: (r: ImportReview) => void; onDone: (done: ImportDone) => void; onAlreadySetUp: () => void }) {
  const { tokens } = useTheme()
  const { formatMoney } = useCurrency()
  const from = appName(review.app) ?? (picked && picked.id !== 'other' ? picked.name : null)
  const [groups, setGroups] = useState(review.groups)
  const [newGroup, setNewGroup] = useState('')
  const [cats, setCats] = useState<CategoryEdit[]>(review.categories)
  const [accounts, setAccounts] = useState<AccountEdit[]>(review.accounts)
  const [salary, setSalary] = useState(review.salary ? String(review.salary.amount) : '')
  const [day, setDay] = useState(review.salary?.day ?? 1)
  const [dayOpen, setDayOpen] = useState(false)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  // The envelope whose group is being picked, by source.
  const [groupFor, setGroupFor] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'saving' | 'success'>('idle')
  // The same save state as the wizard's Finish setup: a fill that grows under a
  // caption naming the step, so a slow commit visibly moves.
  const saveProgress = useCreep(phase === 'saving')
  const saveFill = useSharedValue(0)
  useEffect(() => {
    saveFill.value = withTiming(phase === 'idle' ? 0 : phase === 'success' ? 1 : saveProgress, { duration: phase === 'idle' ? 0 : 250 })
  }, [phase, saveProgress, saveFill])
  const saveFillStyle = useAnimatedStyle(() => ({ width: `${saveFill.value * 100}%` }))
  const [error, setError] = useState('')
  const seen = useRef(`${review.importId}:${review.direction}:${review.currency}`)
  const salaryEdited = useRef(false)
  const scroll = useRef<ScrollView>(null)
  // The income fields sit at the bottom; Android won't scroll a focused input clear of the keyboard itself.
  const revealIncome = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 250)
  // Every edit, by source, for the whole review: a flip can drop an envelope
  // and the flip back bring it again, so the last list alone would lose it.
  const catEdits = useRef<Record<string, Partial<CategoryEdit>>>({})
  const accountEdits = useRef<Record<string, Partial<AccountEdit>>>({})
  const editCat = (source: string, patch: Partial<CategoryEdit>) => {
    catEdits.current[source] = { ...catEdits.current[source], ...patch }
    setCats((all) => all.map((c) => (c.source === source ? { ...c, ...patch } : c)))
  }
  const editAccount = (source: string, patch: Partial<AccountEdit>) => {
    accountEdits.current[source] = { ...accountEdits.current[source], ...patch }
    setAccounts((all) => all.map((a) => (a.source === source ? { ...a, ...patch } : a)))
  }

  // A flip or a currency change brings a new review: keep what the user edited, by source.
  useEffect(() => {
    const key = `${review.importId}:${review.direction}:${review.currency}`
    if (seen.current === key) return
    seen.current = key
    setCats(review.categories.map((c) => ({ ...c, ...catEdits.current[c.source] })))
    setAccounts(review.accounts.map((a) => ({ ...a, ...accountEdits.current[a.source] })))
    // A flip can find a salary the first read missed, or lose one it found.
    if (!salaryEdited.current) {
      setSalary(review.salary ? String(review.salary.amount) : '')
      setDay(review.salary?.day ?? 1)
    }
  }, [review])

  const recompute = async (change: { direction?: string; currency?: string }) => {
    setRecomputing(true)
    setError('')
    try {
      onReview(await recomputeImport(review.importId, change))
    } catch (err) {
      setError(importErrorCopy(err instanceof ImportFailure ? err.code : 'network'))
    } finally {
      setRecomputing(false)
    }
  }

  const flip = () => {
    Haptics.selectionAsync().catch(() => {})
    const to = review.direction === 'negative_spend' ? 'positive_spend' : 'negative_spend'
    track('import_direction_flipped', { to })
    void recompute({ direction: to })
  }

  const addGroup = () => {
    const name = newGroup.trim().slice(0, 60)
    if (!name || groups.some((g) => g.toLowerCase() === name.toLowerCase())) return
    Haptics.selectionAsync().catch(() => {})
    setGroups((g) => [...g, name])
    setNewGroup('')
    // Adding from an envelope's picker files that envelope under it too.
    if (groupFor) editCat(groupFor, { group: name })
  }

  const salaryAmount = Math.round(Number(salary) * 100) / 100
  const hasSalary = salaryAmount > 0
  const budgetTotal = cats.reduce((sum, c) => sum + c.monthly, 0)
  const tooManyBanks = accounts.filter((a) => a.type === 'bank').length > MAX_BANK_ACCOUNTS
  const busy = phase !== 'idle' || recomputing
  const picking = cats.find((c) => c.source === groupFor)
  const steps = commitSteps(cats.length, accounts.length, hasSalary)
  const saveStep = steps[Math.min(steps.length - 1, Math.floor((saveProgress / CREEP_MAX) * steps.length))]

  const commit = async () => {
    if (busy || tooManyBanks) return
    tap()
    setPhase('saving')
    setError('')
    try {
      const result = await commitImport(review.importId, {
        currency: review.currency,
        direction: review.direction,
        groups,
        categories: cats.map((c) => ({ source: c.source, name: c.name.trim() || c.source, group: c.group })),
        accounts: accounts.map((a) => ({ ...a, name: a.name.trim() || a.source })),
        salary: hasSalary ? { amount: salaryAmount, day } : null,
      })
      track('import_committed', { app: review.app, categories: cats.length, accounts: accounts.length, has_salary: hasSalary, rows: result.total })
      setPhase('success')
      setTimeout(() => onDone({ result, currency: review.currency }), SUCCESS_MS)
    } catch (err) {
      setPhase('idle')
      const code = err instanceof ImportFailure ? err.code : 'network'
      if (code === 'already_onboarded') return onAlreadySetUp()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setError(importErrorCopy(code))
      track('import_failed', { stage: 'commit', reason: code })
    }
  }

  const text = { color: tokens.text2, fontFamily: fontFamily.bodyMedium }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Animated.View entering={FadeIn.duration(220)}>
        {/* The app the file came from, as the server read it: picking Wallet and
            uploading a Money Manager file still says Money Manager. */}
        <PopIn play delay={60} style={[styles.found, { backgroundColor: tokens.mintSoft }]}>
          <SealCheck size={14} color={tokens.mint} weight="fill" />
          <Text numberOfLines={1} style={[styles.foundText, { color: tokens.mint, fontFamily: fontFamily.bodyBold }]}>
            {from ? `${from} export` : review.filename}
          </Text>
        </PopIn>
        <Title>Here’s what we found</Title>
        <Blurb>{countsLine(review.counts)}</Blurb>
      </Animated.View>
      <ScrollView
        ref={scroll}
        style={[styles.fill, { opacity: recomputing ? 0.5 : 1 }]}
        contentContainerStyle={styles.reviewBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        accessibilityState={{ busy: recomputing }}
      >
        {skippedCopy(review).map((line) => (
          <Text key={line} style={[styles.note, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{line}</Text>
        ))}

        <Section delay={40}>
          <View style={styles.line}>
            <Text style={[styles.lineText, text]}>{directionCopy(review)}</Text>
            {review.directionSource === 'sign' && <Action label="That’s backwards" onPress={flip} disabled={busy} />}
          </View>
          {review.samples.map((s, i) => (
            <View key={`${s.date}-${i}`} style={styles.sample}>
              <Text style={[styles.sampleDate, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{shortDate(s.date)}</Text>
              <Text numberOfLines={1} style={[styles.sampleItem, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{s.item}</Text>
              <Text style={[styles.sampleAmount, { color: s.kind === 'expense' ? tokens.text : tokens.mint, fontFamily: fontFamily.displaySemiBold }]}>
                {s.kind === 'expense' ? '−' : '+'}{formatMoney(s.amount)}
              </Text>
            </View>
          ))}
        </Section>

        <Section delay={80}>
          <View style={styles.line}>
            <Text style={[styles.lineText, text]}>Your money’s in {currencyInfo(review.currency).name} · {review.currency}</Text>
            <Action label="Change" onPress={() => setCurrencyOpen(true)} disabled={busy} />
          </View>
        </Section>

        <Section delay={120} heading="Your envelopes">
          {cats.map((c) => (
            <View key={c.source} style={[styles.editRow, { borderColor: tokens.border }]}>
              <TextInput
                value={c.name}
                maxLength={60}
                accessibilityLabel={`Name for ${c.source}`}
                onChangeText={(name) => editCat(c.source, { name })}
                style={[styles.input, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
              />
              <Text style={[styles.rowAmount, { color: tokens.text2, fontFamily: fontFamily.displaySemiBold }]}>{formatMoney(c.monthly)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Group for ${c.source}, ${c.group}`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {})
                  setGroupFor(c.source)
                }}
                hitSlop={4}
                style={[styles.groupPill, { backgroundColor: tokens.pillBg, borderColor: tokens.border }]}
              >
                <Text numberOfLines={1} style={[styles.groupPillText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{c.group}</Text>
                <CaretDown size={12} color={tokens.text3} weight="bold" />
              </Pressable>
            </View>
          ))}
          {cats.length === 1 && cats[0].source === UNCATEGORISED && review.counts.expense > 0 && (
            <Text style={[styles.note, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
              Your file doesn’t have categories, so every spend starts in this one envelope. Rename it here, or split it up later from Categories.
            </Text>
          )}
        </Section>

        {accounts.length > 0 && (
          <Section delay={160} heading="Your accounts">
            {accounts.map((a) => (
              <View key={a.source} style={[styles.editRow, { borderColor: tokens.border }]}>
                <TextInput
                  value={a.name}
                  maxLength={30}
                  accessibilityLabel={`Name for ${a.source}`}
                  onChangeText={(name) => editAccount(a.source, { name })}
                  style={[styles.input, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
                />
                <View style={styles.typeRow}>
                  {ACCOUNT_TYPES.map((t) => {
                    const on = a.type === t.value
                    return (
                      <Pressable
                        key={t.value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${a.source}, ${t.label}`}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {})
                          editAccount(a.source, { type: t.value })
                        }}
                        style={[styles.typeChip, { backgroundColor: on ? tokens.accent : tokens.pillBg, borderColor: on ? tokens.accent : tokens.border }]}
                      >
                        <Text style={[styles.typeChipText, { color: on ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{t.label}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ))}
            {tooManyBanks && (
              <Text accessibilityRole="alert" style={[styles.note, { color: tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>
                {`You can have up to ${MAX_BANK_ACCOUNTS} bank accounts. Make one of these cash or a credit card.`}
              </Text>
            )}
            {review.droppedAccounts.length > 0 && (
              <Text style={[styles.note, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
                {`We kept your ${accounts.length} busiest accounts. Rows from ${review.droppedAccounts.slice(0, 5).join(', ')}${review.droppedAccounts.length > 5 ? ' and the rest' : ''} come in without one.`}
              </Text>
            )}
          </Section>
        )}

        <Section delay={200} heading="Your income">
          <Text style={[styles.lineText, text]}>
            {review.salary
              ? `We think your salary is ${formatMoney(review.salary.amount)} on about the ${ordinal(review.salary.day)}.`
              : 'We didn’t spot a regular payday. Add your monthly income if you like, or leave it for later.'}
          </Text>
          <View style={styles.salaryRow}>
            <TextInput
              value={salary}
              keyboardType="decimal-pad"
              placeholder="Monthly income"
              placeholderTextColor={tokens.text3}
              accessibilityLabel="Monthly income"
              onFocus={revealIncome}
              onChangeText={(v) => {
                salaryEdited.current = true
                setSalary(v.replace(/[^0-9.]/g, ''))
              }}
              style={[styles.field, styles.fill, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
            />
            <View style={styles.dayField}>
              <Text style={[styles.dayLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>Payday</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Payday, the ${ordinal(day)} of the month`}
                onPress={() => {
                  tap()
                  setDayOpen(true)
                }}
                style={[styles.field, styles.dayButton, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}
              >
                <Text style={[styles.dayText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{ordinal(day)}</Text>
                <CaretDown size={12} color={tokens.text3} weight="bold" />
              </Pressable>
            </View>
          </View>
        </Section>

        <Section delay={240}>
          <Text style={[styles.lineText, text]}>We’ll set each envelope to what you spent on it in a typical month. Change any of them later.</Text>
          {hasSalary && (
            <Text style={[styles.lineText, { color: budgetTotal <= salaryAmount ? tokens.mint : tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>
              {budgetTotal <= salaryAmount
                ? `That’s ${formatMoney(budgetTotal)} a month, inside your ${formatMoney(salaryAmount)}.`
                : `That’s ${formatMoney(budgetTotal)} a month, ${formatMoney(budgetTotal - salaryAmount)} more than comes in.`}
            </Text>
          )}
        </Section>
      </ScrollView>

      {error !== '' && (
        <Animated.Text entering={FadeIn.duration(180)} accessibilityRole="alert" style={[styles.error, { color: tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>
          {error}
        </Animated.Text>
      )}

      <Pressable
        onPress={commit}
        disabled={busy || tooManyBanks}
        accessibilityRole="button"
        accessibilityLabel={phase === 'success' ? 'You’re set up' : phase === 'saving' ? saveStep : undefined}
        accessibilityState={{ disabled: busy || tooManyBanks, busy: phase === 'saving' }}
        style={[
          styles.cta,
          {
            backgroundColor: phase === 'success' ? tokens.successBg : phase === 'saving' || tooManyBanks ? tokens.inputBg : tokens.accent,
            opacity: recomputing ? 0.6 : 1,
          },
        ]}
      >
        {phase === 'success' ? (
          <CheckIcon color={tokens.onSuccess} />
        ) : phase === 'saving' ? (
          <>
            <Animated.View pointerEvents="none" style={[styles.ctaFill, saveFillStyle]} />
            <LoadingPhrase phrases={[saveStep]} color={tokens.text3} style={[styles.ctaText, styles.ctaPhrase, { fontFamily: fontFamily.displaySemiBold }]} />
          </>
        ) : (
          <Text style={[styles.ctaText, { color: tooManyBanks ? tokens.text3 : tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>
            Looks right, set me up
          </Text>
        )}
      </Pressable>

      <BottomSheet visible={dayOpen} onClose={() => setDayOpen(false)}>
        <View style={styles.sheet}>
          <View style={[styles.grabber, { backgroundColor: tokens.borderStrong }]} />
          <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>When does your pay land?</Text>
          <Text style={[styles.note, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>Pick the day of the month. In a shorter month, we’ll use its last day.</Text>
          <View style={styles.dayGrid}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
              const on = d === day
              return (
                <View key={d} style={styles.dayCellWrap}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`The ${ordinal(d)}`}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {})
                      salaryEdited.current = true
                      setDay(d)
                      setDayOpen(false)
                    }}
                    style={[styles.dayCell, on && { backgroundColor: tokens.accent }]}
                  >
                    <Text style={[styles.dayCellText, { color: on ? tokens.onAccent : tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{d}</Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
        </View>
      </BottomSheet>

      <BottomSheet visible={currencyOpen} onClose={() => setCurrencyOpen(false)}>
        <View style={styles.sheet}>
          <View style={[styles.grabber, { backgroundColor: tokens.borderStrong }]} />
          <CurrencyPicker
            value={review.currency}
            disabled={busy}
            onChange={(code) => {
              setCurrencyOpen(false)
              if (code !== review.currency) void recompute({ currency: code })
            }}
          />
        </View>
      </BottomSheet>

      <BottomSheet visible={!!picking} onClose={() => setGroupFor(null)}>
        {picking && (
          <View style={styles.sheet}>
            <View style={[styles.grabber, { backgroundColor: tokens.borderStrong }]} />
            <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{`Which group is ${picking.name.trim() || picking.source} in?`}</Text>
            {groups.map((g) => {
              const on = g === picking.group
              return (
                <Pressable
                  key={g}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {})
                    editCat(picking.source, { group: g })
                    setGroupFor(null)
                  }}
                  style={[styles.groupOption, { backgroundColor: on ? tokens.accentSoft : tokens.card, borderColor: on ? tokens.accent : tokens.border }]}
                >
                  <Text style={[styles.fill, styles.groupOptionText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{g}</Text>
                  {on && <Check size={16} color={tokens.accent} weight="bold" />}
                </Pressable>
              )
            })}
            <View style={styles.salaryRow}>
              <TextInput
                value={newGroup}
                maxLength={60}
                placeholder="Add a group"
                placeholderTextColor={tokens.text3}
                accessibilityLabel="New group name"
                returnKeyType="done"
                onChangeText={setNewGroup}
                onSubmitEditing={addGroup}
                style={[styles.field, styles.fill, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add group"
                onPress={addGroup}
                disabled={!newGroup.trim()}
                style={[styles.addGroup, { borderColor: tokens.borderStrong, opacity: newGroup.trim() ? 1 : 0.4 }]}
              >
                <Plus size={14} color={tokens.text2} weight="bold" />
                <Text style={[styles.typeChipText, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        )}
      </BottomSheet>
    </KeyboardAvoidingView>
  )
}

function Choice({ title, detail, on, delay, onPress }: { title: string; detail: string; on: boolean; delay: number; onPress: () => void }) {
  const { tokens, motion } = useTheme()
  const reduceMotion = useReducedMotion()
  // The dot fills with a small pop, like a check landing.
  const dot = useSharedValue(on ? 1 : 0)
  useEffect(() => {
    dot.value = reduceMotion ? (on ? 1 : 0) : withSpring(on ? 1 : 0, motion.springTight)
  }, [on, dot, reduceMotion, motion.springTight])
  const dotStyle = useAnimatedStyle(() => ({ opacity: dot.value, transform: [{ scale: 0.4 + dot.value * 0.6 }] }))
  return (
    <PopIn play delay={delay}>
      <Press
        accessibilityRole="radio"
        accessibilityLabel={`${title}. ${detail}`}
        accessibilityState={{ checked: on }}
        onPress={() => {
          if (!on) Haptics.selectionAsync().catch(() => {})
          onPress()
        }}
        style={[styles.choice, { backgroundColor: on ? tokens.accentSoft : tokens.card, borderColor: on ? tokens.accent : tokens.border }]}
      >
        <View style={[styles.radio, { borderColor: on ? tokens.accent : tokens.borderStrong }]}>
          <Animated.View style={[styles.radioDot, { backgroundColor: tokens.accent }, dotStyle]} />
        </View>
        <View style={styles.fill}>
          <Text style={[styles.choiceTitle, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>{title}</Text>
          <Text style={[styles.choiceDetail, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{detail}</Text>
        </View>
      </Press>
    </PopIn>
  )
}

/** The ask step's Continue, the same pill as the review's set-me-up button. */
function Continue({ onPress }: { onPress: () => void }) {
  const { tokens } = useTheme()
  return (
    <Press
      onPress={() => {
        tap()
        onPress()
      }}
      style={[styles.cta, styles.askCta, { backgroundColor: tokens.accent }]}
    >
      <Text style={[styles.ctaText, { color: tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>Continue</Text>
    </Press>
  )
}

// The fill climbs toward this while the commit runs; the success tick takes it the rest of the way.
const CREEP_MAX = 0.92

/** 0 while idle; while `active`, climbs fast then slows, never quite arriving. Web's useCreep. */
function useCreep(active: boolean): number {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = Date.now()
    const id = setInterval(() => setProgress(CREEP_MAX * (1 - Math.exp(-(Date.now() - start) / 5000))), 250)
    return () => {
      clearInterval(id)
      setProgress(0)
    }
  }, [active])
  return progress
}

function Title({ children }: { children: string }) {
  const { tokens } = useTheme()
  return <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{children}</Text>
}

function Blurb({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  const { tokens } = useTheme()
  return <Text style={[styles.blurb, center && styles.center, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{children}</Text>
}

function Section({ heading, delay, children }: { heading?: string; delay: number; children: React.ReactNode }) {
  const { tokens } = useTheme()
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(280)} style={[styles.section, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
      {heading && <Text style={[styles.heading, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>{heading.toUpperCase()}</Text>}
      {children}
    </Animated.View>
  )
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { tokens } = useTheme()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={8} style={[styles.action, { backgroundColor: tokens.accentSoft, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[styles.actionText, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}>{label}</Text>
    </Pressable>
  )
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** A pressable that sinks a little under the finger, as SetupWizard's split buttons do. */
function Press({
  onPress,
  disabled,
  style,
  children,
  accessibilityLabel,
  accessibilityState,
  accessibilityRole = 'button',
}: {
  onPress: () => void
  disabled?: boolean
  style: StyleProp<ViewStyle>
  children: React.ReactNode
  accessibilityLabel?: string
  accessibilityState?: { busy?: boolean; disabled?: boolean; checked?: boolean }
  accessibilityRole?: 'button' | 'radio'
}) {
  const { motion } = useTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withSpring(0.97, motion.springTight)
      }}
      onPressOut={() => {
        scale.value = reduceMotion ? 1 : withSpring(1, motion.springTight)
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center', alignSelf: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  title: { fontSize: 27, lineHeight: 31, marginTop: 16, letterSpacing: -0.2 },
  blurb: { fontSize: 14, lineHeight: 21, marginTop: 7, maxWidth: 310 },
  ask: { flex: 1, justifyContent: 'center', paddingBottom: 40 },
  choices: { gap: 12, marginTop: 28 },
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  askCta: { marginTop: 20 },
  choiceTitle: { fontSize: 16 },
  choiceDetail: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  textAction: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 8 },
  textActionLabel: { fontSize: 14, textAlign: 'center' },
  appList: { gap: 8, paddingTop: 16, paddingBottom: 12 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1 },
  appName: { fontSize: 15 },
  appBy: { fontSize: 12, marginTop: 2 },
  steps: { gap: 12, marginTop: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 12 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 21, paddingTop: 1 },
  // Indented under the step text, past the number column.
  howExtra: { gap: 8, marginTop: 12, paddingLeft: 36 },
  uploadBody: { paddingBottom: 16 },
  howNote: { fontSize: 13, lineHeight: 19 },
  howHelp: { fontSize: 13, lineHeight: 19, textDecorationLine: 'underline' },
  found: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100, maxWidth: '100%' },
  foundText: { fontSize: 12, flexShrink: 1 },
  drop: { marginTop: 24, minHeight: 168, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 },
  dropIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dropTitle: { fontSize: 15 },
  dropHint: { fontSize: 12 },
  error: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  reviewBody: { gap: 12, paddingTop: 16, paddingBottom: 16 },
  note: { fontSize: 13, lineHeight: 18 },
  section: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 10 },
  heading: { fontSize: 12, letterSpacing: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineText: { flex: 1, fontSize: 14, lineHeight: 20 },
  action: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 100 },
  actionText: { fontSize: 12 },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sampleDate: { fontSize: 12, width: 84 },
  sampleItem: { flex: 1, fontSize: 13 },
  sampleAmount: { fontSize: 14 },
  editRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minWidth: 120, fontSize: 14, paddingVertical: 6 },
  rowAmount: { fontSize: 14 },
  groupPill: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 100, borderWidth: 1 },
  groupPillText: { fontSize: 12, flexShrink: 1 },
  typeRow: { flexDirection: 'row', gap: 6 },
  typeChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 100, borderWidth: 1 },
  typeChipText: { fontSize: 12 },
  salaryRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  field: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  dayField: { gap: 4 },
  dayLabel: { fontSize: 12 },
  dayButton: { width: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dayText: { fontSize: 15 },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCellWrap: { width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center' },
  dayCell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dayCellText: { fontSize: 13 },
  cta: { marginTop: 12, minHeight: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ctaText: { fontSize: 15 },
  ctaFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.22)' },
  ctaPhrase: { textAlign: 'center' },
  sheet: { gap: 10 },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 100, marginBottom: 4 },
  sheetTitle: { fontSize: 17, marginBottom: 4 },
  groupOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  groupOptionText: { fontSize: 14 },
  addGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1, borderStyle: 'dashed' },
})
