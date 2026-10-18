import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { ArrowLeft, ArrowsClockwise, CaretDown, CaretRight, Check, FileText, Plus } from '@/src/components/shared/icons'
import { CurrencyPicker } from '@/src/components/CurrencyPicker'
import { CurrencyScope, useCurrency } from '@/src/context/CurrencyContext'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
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
import { countsLine, directionCopy, importErrorCopy, ordinal, skippedCopy } from './importCopy'

/**
 * "Switching apps?": the first onboarding step, and the import that follows
 * it. Ported from Web's ImportFlow. The review is the only screen with work
 * on it; nothing is written until its button is pressed.
 */

const MAX_BYTES = 4 * 1024 * 1024
/** Web's lib/accounts.ts MAX_BANK_ACCOUNTS: the balance check asks about at most five. */
const MAX_BANK_ACCOUNTS = 5
/** How long the success tick holds before the celebration, as every other success CTA. */
const SUCCESS_MS = 1100

type AppChoice = { id: string; name: string; by?: string; how: [string, string] }

const APPS: AppChoice[] = [
  { id: 'moneymanager', name: 'Money Manager', by: 'Realbyte', how: ['Open More, then Backup, then Export to Excel file.', 'Save the file to your phone and pick it here.'] },
  { id: 'monefy', name: 'Monefy', how: ['Open Settings, then Export to file.', 'Save the csv to your phone and pick it here.'] },
  { id: 'wallet', name: 'Wallet', by: 'BudgetBakers', how: ['In Wallet on the web, open Records and export them.', 'Pick csv as the format.'] },
  { id: 'spendee', name: 'Spendee', how: ['Open a wallet’s settings and tap Export to CSV.', 'It lands in your email.'] },
  { id: 'ynab', name: 'YNAB', how: ['On the web, open your plan’s menu and pick Export plan.', 'Pick the zip as it is. No need to unzip it.'] },
  { id: 'goodbudget', name: 'Goodbudget', how: ['On the website, open Account, then Export data.', 'Pick the csv of your transactions.'] },
  { id: 'axio', name: 'axio', by: 'formerly Walnut', how: ['Ask axio for your data from its settings.', 'Use the CSV from the email, not the PDF.'] },
]
// The catch-all sits under the list as a text link, not as an eighth "app".
const OTHER: AppChoice = { id: 'other', name: 'Another app or a spreadsheet', how: ['Any file with a date, an amount and a description works.', 'One row per transaction.'] }

const ACCOUNT_TYPES: { value: ImportAccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
]

const READING = ['Reading your file…', 'Sorting your categories…', 'Looking for your payday…', 'Adding up a typical month…']

type Stage = 'ask' | 'pick' | 'upload' | 'review'
const STAGES: Stage[] = ['ask', 'pick', 'upload', 'review']

export interface ImportDone {
  result: CommitResult
  currency: string
}

export function ImportFlow({ onFresh, onDone }: { onFresh: () => void; onDone: (done: ImportDone) => void }) {
  const { tokens } = useTheme()
  const [stage, setStage] = useState<Stage>('ask')
  const [app, setApp] = useState<AppChoice | null>(null)
  const [review, setReview] = useState<ImportReview | null>(null)
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
        <Animated.View key="ask" entering={FadeIn.duration(280)} style={styles.ask}>
          <PopIn play delay={60} style={[styles.askBadge, { backgroundColor: tokens.accentSoft }]}>
            <ArrowsClockwise size={30} color={tokens.accentInk} weight="bold" />
          </PopIn>
          <Title>Switching apps?</Title>
          <Blurb center>Don’t start from zero. Export one file from your old app and we’ll rebuild it all here.</Blurb>
          <View style={styles.askActions}>
            <Cta label="Bring it all over" onPress={() => setStage('pick')} />
            <Pressable accessibilityRole="button" onPress={onFresh} hitSlop={8} style={styles.textAction}>
              <Text style={[styles.textActionLabel, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}>No, start fresh</Text>
            </Pressable>
          </View>
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
          onPreview={(r) => {
            setReview(r)
            setStage('review')
          }}
        />
      )}

      {stage === 'review' && review && (
        <CurrencyScope code={review.currency}>
          <Review review={review} onReview={setReview} onDone={onDone} />
        </CurrencyScope>
      )}
    </>
  )
}

function Upload({ app, onPreview }: { app: AppChoice; onPreview: (review: ImportReview) => void }) {
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
    if ((file.size ?? 0) > MAX_BYTES) {
      setError(importErrorCopy('too_big'))
      track('import_failed', { stage: 'preview', reason: 'too_big' })
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
      onPreview(review)
    } catch (err) {
      if (!live.current) return
      const code = err instanceof ImportFailure ? err.code : 'network'
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setError(importErrorCopy(code))
      track('import_failed', { stage: 'preview', reason: code })
    } finally {
      if (live.current) setBusy(false)
    }
  }

  return (
    <Animated.View key="upload" entering={FadeIn.duration(220)} style={styles.fill}>
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
            <Text style={[styles.dropHint, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>csv, xlsx or the YNAB zip · up to 4 MB</Text>
          </>
        )}
      </Press>
      {error !== '' && (
        <Animated.Text entering={FadeIn.duration(180)} accessibilityRole="alert" style={[styles.error, { color: tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>
          {error}
        </Animated.Text>
      )}
    </Animated.View>
  )
}

type CategoryEdit = ImportReview['categories'][number]
type AccountEdit = ImportReview['accounts'][number]

function Review({ review, onReview, onDone }: { review: ImportReview; onReview: (r: ImportReview) => void; onDone: (done: ImportDone) => void }) {
  const { tokens } = useTheme()
  const { formatMoney } = useCurrency()
  const [groups, setGroups] = useState(review.groups)
  const [newGroup, setNewGroup] = useState('')
  const [cats, setCats] = useState<CategoryEdit[]>(review.categories)
  const [accounts, setAccounts] = useState<AccountEdit[]>(review.accounts)
  const [salary, setSalary] = useState(review.salary ? String(review.salary.amount) : '')
  const [day, setDay] = useState(String(review.salary?.day ?? 1))
  const [currencyOpen, setCurrencyOpen] = useState(false)
  // The envelope whose group is being picked, by source.
  const [groupFor, setGroupFor] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'saving' | 'success'>('idle')
  const [error, setError] = useState('')
  const seen = useRef(`${review.importId}:${review.direction}:${review.currency}`)
  const salaryEdited = useRef(false)
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
      setDay(String(review.salary?.day ?? 1))
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
        salary: hasSalary ? { amount: salaryAmount, day: Math.min(31, Math.max(1, Math.round(Number(day)) || 1)) } : null,
      })
      track('import_committed', { app: review.app, categories: cats.length, accounts: accounts.length, has_salary: hasSalary, rows: result.total })
      setPhase('success')
      setTimeout(() => onDone({ result, currency: review.currency }), SUCCESS_MS)
    } catch (err) {
      setPhase('idle')
      const code = err instanceof ImportFailure ? err.code : 'network'
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setError(importErrorCopy(code))
      track('import_failed', { stage: 'commit', reason: code })
    }
  }

  const text = { color: tokens.text2, fontFamily: fontFamily.bodyMedium }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View entering={FadeIn.duration(220)}>
        <Title>Here’s what we found</Title>
        <Blurb>{countsLine(review.counts)}</Blurb>
      </Animated.View>
      <ScrollView
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
              <Text style={[styles.sampleDate, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{s.date}</Text>
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
              onChangeText={(v) => {
                salaryEdited.current = true
                setSalary(v.replace(/[^0-9.]/g, ''))
              }}
              style={[styles.field, styles.fill, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
            />
            <View style={styles.dayField}>
              <Text style={[styles.dayLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>Payday</Text>
              <TextInput
                value={day}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Payday, day of the month"
                onChangeText={(v) => {
                  salaryEdited.current = true
                  setDay(v.replace(/\D/g, ''))
                }}
                style={[styles.field, styles.dayInput, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
              />
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
        accessibilityLabel={phase === 'success' ? 'You’re set up' : undefined}
        accessibilityState={{ disabled: busy || tooManyBanks, busy: phase === 'saving' }}
        style={[styles.cta, { backgroundColor: phase === 'success' ? tokens.successBg : tooManyBanks ? tokens.inputBg : tokens.accent, opacity: phase === 'saving' || recomputing ? 0.6 : 1 }]}
      >
        {phase === 'success' ? (
          <CheckIcon color={tokens.onSuccess} />
        ) : (
          <Text style={[styles.ctaText, { color: tooManyBanks ? tokens.text3 : tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>
            {phase === 'saving' ? 'Setting you up…' : 'Looks right, set me up'}
          </Text>
        )}
      </Pressable>

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

function Cta({ label, onPress }: { label: string; onPress: () => void }) {
  const { tokens } = useTheme()
  return (
    <Press
      onPress={() => {
        tap()
        onPress()
      }}
      style={[styles.cta, { backgroundColor: tokens.accent }]}
    >
      <Text style={[styles.ctaText, { color: tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>{label}</Text>
    </Press>
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
}: {
  onPress: () => void
  disabled?: boolean
  style: StyleProp<ViewStyle>
  children: React.ReactNode
  accessibilityLabel?: string
  accessibilityState?: { busy?: boolean; disabled?: boolean }
}) {
  const { motion } = useTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <AnimatedPressable
      accessibilityRole="button"
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
  ask: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 },
  askBadge: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  askActions: { alignSelf: 'stretch', marginTop: 28, gap: 6 },
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
  sampleDate: { fontSize: 12, width: 78 },
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
  dayInput: { width: 72, textAlign: 'center' },
  cta: { marginTop: 12, minHeight: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ctaText: { fontSize: 15 },
  sheet: { gap: 10 },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 100, marginBottom: 4 },
  sheetTitle: { fontSize: 17, marginBottom: 4 },
  groupOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  groupOptionText: { fontSize: 14 },
  addGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1, borderStyle: 'dashed' },
})
