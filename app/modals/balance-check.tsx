import { useEffect, useState, type ReactNode } from 'react'
import { Animated, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { CaptureProposal } from '@/src/api/ai'
import type { BalanceResult, BalanceStatus, MoneyInReason, ResolveAnswer } from '@/src/api/balanceChecks'
import { CaptureReview } from '@/src/components/brain/CaptureReview'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { AmountText } from '@/src/components/ui/AmountText'
import { Numpad } from '@/src/components/ui/Numpad'
import { useInvalidFeedback } from '@/src/components/ui/useInvalidFeedback'
import { useCurrency } from '@/src/context/CurrencyContext'
import { GAP_ORIGIN } from '@/src/features/capture/captureRows'
import { useBalanceStatus, useResolveBalanceCheck, useSubmitBalance } from '@/src/hooks/useBalanceCheck'
import { track } from '@/src/lib/analytics'
import { pushAmountKey } from '@/src/lib/calcAmount'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/** Same beat as every other in-place success in the app (CLAUDE.md): let the check draw, then close. */
const SUCCESS_MS = 1100
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/
/** Same cap as the server's: more than this isn't someone's everyday accounts. */
const MAX_ACCOUNTS = 5

type Measured = Exclude<BalanceResult, { kind: 'baseline' }>
type GapReason = 'unlogged' | 'card_bill' | 'moved' | 'mix'
type Step =
  | { name: 'enter' }
  | { name: 'gap'; check: Measured }
  | { name: 'amounts'; check: Measured; reason: Exclude<GapReason, 'unlogged'> }
  | { name: 'surplus'; check: Measured }
  | { name: 'review'; proposal: CaptureProposal; cardShortfall: number; loggedPct: number }

const SAVE_FAILED = "Couldn't save your balance. Check your connection and try again."
const RESOLVE_FAILED = "Couldn't save that. Check your connection and try again."

const GAP_OPTIONS: { reason: GapReason; title: string; body: string }[] = [
  { reason: 'unlogged', title: "Spends I didn't log", body: "We'll split it across your usual envelopes. You can fix it before it's logged." },
  { reason: 'card_bill', title: 'Card bill', body: 'You paid a credit card bill from this account.' },
  { reason: 'moved', title: 'Moved, lent or cash', body: 'Sent to savings, lent to someone or took out cash.' },
  { reason: 'mix', title: 'A mix', body: 'Some of each. Tell us the amounts.' },
]

const MONEY_IN_OPTIONS: { reason: MoneyInReason; title: string }[] = [
  { reason: 'income', title: 'Income or salary' },
  { reason: 'refund', title: 'Refund or paid back' },
  { reason: 'moved_in', title: 'Moved in from another account' },
]

function parseAmount(text: string): number {
  const t = text.trim()
  return AMOUNT_RE.test(t) ? Number(t) : NaN
}

/**
 * The weekly balance check (docs/effortless-logging.md, phase 2). The user
 * types the balance of each account they pay from, named once and asked about
 * again every week, and the server checks the total. The balance the app
 * expects is a hint, not a prefill. A gap gets one more question with one-tap answers, and spends
 * they didn't log come back as estimates on the money brain's review card.
 * No AI anywhere: the server does arithmetic on the user's own history.
 */
export default function BalanceCheckModal() {
  const { tokens, space, radius, type } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const statusQ = useBalanceStatus({ fresh: true })
  const [step, setStep] = useState<Step>({ name: 'enter' })
  // Set on a success that ends the check: the caption to show while the check draws, then the modal closes.
  const [closing, setClosing] = useState<string | null>(null)

  useEffect(() => {
    if (closing === null) return
    const timer = setTimeout(() => router.back(), SUCCESS_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing])

  // The prefill moves with every expense logged since the last fetch, so wait for this mount's own answer.
  const ready = statusQ.isFetchedAfterMount || statusQ.isError

  let body: ReactNode
  if (!ready) {
    body = (
      <View style={styles.center}>
        <LoadingCaption />
      </View>
    )
  } else if (step.name === 'enter') {
    body = <EnterBalance status={statusQ.data ?? null} closing={closing} onClose={setClosing} onMeasured={setStep} />
  } else if (step.name === 'gap') {
    body = <GapQuestion check={step.check} closing={closing} onClose={setClosing} onNext={setStep} />
  } else if (step.name === 'amounts') {
    body = <GapAmounts check={step.check} reason={step.reason} closing={closing} onClose={setClosing} onNext={setStep} />
  } else if (step.name === 'surplus') {
    body = <SurplusQuestion check={step.check} closing={closing} onClose={setClosing} />
  } else {
    body = <Estimates {...step} onDone={() => router.back()} />
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, gap: space.md, borderBottomColor: tokens.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.headerBtn, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.full }]}
        >
          <X size={16} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }]}>
          Balance check
        </Text>
      </View>
      {body}
    </View>
  )
}

function useTextStyles() {
  const { tokens, type } = useTheme()
  return {
    label: { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, letterSpacing: 0.6 },
    title: { color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title },
    body: { color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption },
    error: { color: tokens.coral, fontFamily: fontFamily.bodyMedium, fontSize: type.caption },
  }
}

function Footer({ children }: { children: ReactNode }) {
  const { space } = useTheme()
  const insets = useSafeAreaInsets()
  return <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, gap: space.md }}>{children}</View>
}

/** The screen's one CTA, which becomes the shared success check in place. */
function Cta({ label, busyLabel, busy, success, disabled, onPress }: {
  label: string
  busyLabel: string
  busy: boolean
  success: boolean
  disabled: boolean
  onPress: () => void
}) {
  const { tokens, radius, type } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy || success }}
      style={[styles.cta, { backgroundColor: success ? tokens.mint : tokens.accent, borderRadius: radius.full, opacity: busy || disabled ? 0.5 : 1 }]}
      onPress={onPress}
      disabled={disabled || busy || success}
    >
      {success ? (
        <CheckIcon color={tokens.onAccent} size={16} />
      ) : (
        <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{busy ? busyLabel : label}</Text>
      )}
    </Pressable>
  )
}

/** What an account is called when the user hasn't named it. Distinct per row, so the server never sees two the same. */
function defaultName(i: number): string {
  return i === 0 ? 'Bank' : `Account ${i + 1}`
}

type AccountRow = { name: string; amount: string }

function EnterBalance({ status: fetched, closing, onClose, onMeasured }: {
  status: BalanceStatus | null
  closing: string | null
  onClose: (caption: string) => void
  onMeasured: (step: Step) => void
}) {
  const { tokens, space, radius, type } = useTheme()
  const text = useTextStyles()
  const { formatMoney, formatAmountInput } = useCurrency()
  const submit = useSubmitBalance()
  // Frozen at mount: saving refetches the status, which would flip the copy under the success check.
  const [status] = useState(fetched)
  const first = status !== null && !status.anchor
  const expected = status?.expected ?? null
  // Each balance is typed, never prefilled: the app can't know how the total splits, and a
  // prefill invites confirming without opening the bank app.
  const [rows, setRows] = useState<AccountRow[]>(() =>
    (status?.accounts?.length ? status.accounts : ['']).map((name) => ({ name, amount: '' })),
  )
  const [active, setActive] = useState(0)
  const { shake, triggerInvalidFeedback } = useInvalidFeedback()
  const [error, setError] = useState('')

  const amount = rows[active].amount
  const multi = rows.length > 1
  const names = rows.map((r, i) => r.name.trim() || defaultName(i))
  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const complete = rows.every((r) => r.amount !== '')

  function setAmount(next: (prev: string) => string) {
    setRows((prev) => prev.map((r, i) => (i === active ? { ...r, amount: next(r.amount) } : r)))
  }

  function onBackspace() {
    if (amount === '') triggerInvalidFeedback()
    else setAmount((prev) => prev.slice(0, -1))
  }

  function addAccount() {
    setRows((prev) => [...prev, { name: '', amount: '' }])
    setActive(rows.length)
  }

  function removeAccount(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setActive((a) => (a === index ? 0 : a > index ? a - 1 : a))
  }

  const caption =
    closing ??
    (first
      ? "This is your starting point. Next week we'll compare."
      : expected === null
        ? 'Type the balance your bank shows.'
        : `We expect about ${formatMoney(expected)}${multi ? ' in total' : ''}.`)

  async function onSubmit() {
    if (!complete) return
    if (new Set(names.map((n) => n.toLowerCase())).size < names.length) {
      setError('Give each account its own name.')
      return
    }
    setError('')
    try {
      const result = await submit.mutateAsync(rows.map((r, i) => ({ name: names[i], balance: Number(r.amount) })))
      track('balance_checked', { kind: result.kind, accounts: rows.length })
      if (result.kind === 'baseline') {
        onClose(result.reason === 'accounts_changed' ? "New starting point saved. We'll compare next week." : 'Starting point saved. See you next week.')
      } else if (result.kind === 'square') onClose("All square. You've logged everything.")
      else if (result.kind === 'unlogged') onMeasured({ name: 'gap', check: result })
      else onMeasured({ name: 'surplus', check: result })
    } catch {
      setError(SAVE_FAILED)
    }
  }

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <Text style={text.label}>WHERE YOU PAY FROM</Text>
        <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, padding: space.md, gap: space.md }]}>
          <View style={[styles.cardIcon, { backgroundColor: tokens.accentSoft, borderRadius: radius.md }]}>
            <Text style={{ fontSize: type.title }}>🏦</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>
              {first ? 'Your starting balance' : status?.open ? "Let's finish your last check" : "What's your balance now?"}
            </Text>
            <Text style={text.body}>
              {first
                ? 'Add each account you pay from with UPI. Check them in GPay, PhonePe or your bank app.'
                : 'Check it in GPay, PhonePe or your bank app.'}
            </Text>
          </View>
        </View>

        <View style={[styles.amountWrap, { gap: space.sm }]}>
          {multi && <Text style={text.label}>{names[active].toUpperCase()}</Text>}
          <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }}>
            <AmountText value={Number(amount) || 0} rawText={formatAmountInput(amount)} size={type.hero} weight="displayBold" animate ignoreHide />
          </Animated.View>
          <Text style={[text.body, { textAlign: 'center' }]}>{caption}</Text>
        </View>

        {multi && (
          <View style={{ gap: space.sm }}>
            {rows.map((r, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${names[i]} balance`}
                accessibilityState={{ selected: i === active }}
                onPress={() => {
                  // The numpad sits under the keyboard, so picking a balance to type puts the keyboard away.
                  Keyboard.dismiss()
                  setActive(i)
                }}
                style={[
                  styles.accountRow,
                  {
                    backgroundColor: tokens.card,
                    borderColor: i === active ? tokens.accent : tokens.border,
                    borderRadius: radius.md,
                    paddingHorizontal: space.md,
                    gap: space.sm,
                  },
                ]}
              >
                <TextInput
                  accessibilityLabel={`Account ${i + 1} name`}
                  value={r.name}
                  onChangeText={(name) => setRows((prev) => prev.map((row, j) => (j === i ? { ...row, name } : row)))}
                  onFocus={() => setActive(i)}
                  placeholder={defaultName(i)}
                  returnKeyType="done"
                  placeholderTextColor={tokens.text3}
                  maxLength={30}
                  style={[styles.accountName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }]}
                />
                <Text style={{ color: r.amount === '' ? tokens.text3 : tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>
                  {r.amount === '' ? '—' : formatMoney(Number(r.amount))}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${names[i]}`} hitSlop={10} onPress={() => removeAccount(i)}>
                  <X size={14} color={tokens.text3} />
                </Pressable>
              </Pressable>
            ))}
            <Text style={[text.body, { textAlign: 'right', color: tokens.text }]}>{`Total ${formatMoney(total)}`}</Text>
          </View>
        )}

        {rows.length < MAX_ACCOUNTS && (
          <Pressable accessibilityRole="button" onPress={addAccount} hitSlop={8} style={{ alignSelf: 'center' }}>
            <Text style={{ color: tokens.accent, fontFamily: fontFamily.bodyBold, fontSize: type.caption }}>+ Add another account</Text>
          </Pressable>
        )}
        {error !== '' && <Text style={text.error}>{error}</Text>}
      </ScrollView>
      <Footer>
        <Numpad
          extraKey="."
          onDigit={(d) => setAmount((prev) => pushAmountKey(prev, d))}
          onBackspace={onBackspace}
          onClear={() => setAmount(() => '')}
          disabled={submit.isPending || closing !== null}
        />
        <Cta
          label={first ? 'Save' : 'Check'}
          busyLabel="Checking…"
          busy={submit.isPending}
          success={closing !== null}
          disabled={!complete}
          onPress={onSubmit}
        />
      </Footer>
    </>
  )
}

function OptionRow({ title, body, onPress, busy, success, disabled }: {
  title: string
  body?: string
  onPress: () => void
  busy?: boolean
  success?: boolean
  disabled?: boolean
}) {
  const { tokens, space, radius, type } = useTheme()
  const text = useTextStyles()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.option,
        {
          backgroundColor: success ? tokens.mint : tokens.card,
          borderColor: success ? tokens.mint : tokens.border,
          borderRadius: radius.lg,
          padding: space.md,
          gap: 2,
          opacity: disabled && !success ? 0.5 : 1,
        },
      ]}
    >
      {success ? (
        <View style={styles.optionCheck}>
          <CheckIcon color={tokens.onAccent} size={20} />
        </View>
      ) : (
        <>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{busy ? 'One sec…' : title}</Text>
          {body ? <Text style={text.body}>{body}</Text> : null}
        </>
      )}
    </Pressable>
  )
}

function GapQuestion({ check, closing, onClose, onNext }: {
  check: Measured
  closing: string | null
  onClose: (caption: string) => void
  onNext: (step: Step) => void
}) {
  const { space } = useTheme()
  const text = useTextStyles()
  const { formatMoney } = useCurrency()
  const resolve = useResolveBalanceCheck()
  const [error, setError] = useState('')

  async function pick(reason: GapReason) {
    if (reason !== 'unlogged') {
      onNext({ name: 'amounts', check, reason })
      return
    }
    setError('')
    try {
      const result = await resolve.mutateAsync({ id: check.id, answer: {} })
      track('balance_resolved', { reason })
      if (result.proposal) onNext({ name: 'review', proposal: result.proposal, cardShortfall: result.cardShortfall, loggedPct: result.loggedPct })
      else onClose('Got it. Nothing to log.')
    } catch {
      setError(RESOLVE_FAILED)
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <Text style={text.title}>{`${formatMoney(check.gap)} left your account that you haven't logged.`}</Text>
      <Text style={text.body}>{closing ?? 'What was it?'}</Text>
      {GAP_OPTIONS.map((o) => (
        <OptionRow
          key={o.reason}
          title={o.title}
          body={o.body}
          busy={o.reason === 'unlogged' && resolve.isPending}
          success={o.reason === 'unlogged' && closing !== null}
          disabled={resolve.isPending || closing !== null}
          onPress={() => pick(o.reason)}
        />
      ))}
      {error !== '' && <Text style={text.error}>{error}</Text>}
    </ScrollView>
  )
}

function AmountField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { tokens, space, radius, type } = useTheme()
  const text = useTextStyles()
  const { currencyPrefix } = useCurrency()
  return (
    <View style={{ gap: space.xs }}>
      <Text style={text.label}>{label.toUpperCase()}</Text>
      <View style={[styles.field, { backgroundColor: tokens.inputBg, borderColor: tokens.border, borderRadius: radius.md, paddingHorizontal: space.md }]}>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.bodyLg }}>{currencyPrefix}</Text>
        <TextInput
          accessibilityLabel={`${label} amount`}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={tokens.text3}
          style={[styles.fieldInput, { color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.bodyLg }]}
        />
      </View>
    </View>
  )
}

function GapAmounts({ check, reason, closing, onClose, onNext }: {
  check: Measured
  reason: Exclude<GapReason, 'unlogged'>
  closing: string | null
  onClose: (caption: string) => void
  onNext: (step: Step) => void
}) {
  const { space } = useTheme()
  const text = useTextStyles()
  const { formatMoney } = useCurrency()
  const resolve = useResolveBalanceCheck()
  const [card, setCard] = useState('')
  const [moved, setMoved] = useState('')
  const [error, setError] = useState('')

  const askCard = reason === 'card_bill' || reason === 'mix'
  const askMoved = reason === 'moved' || reason === 'mix'
  const cardValue = askCard ? parseAmount(card) : 0
  const movedValue = askMoved ? parseAmount(moved) : 0
  const valid = !Number.isNaN(cardValue) && !Number.isNaN(movedValue) && cardValue + movedValue > 0
  const rest = Math.round(check.gap - (cardValue || 0) - (movedValue || 0))
  const restLine = rest > check.tolerance ? `The other ${formatMoney(rest)} counts as spends you didn't log.` : 'That covers it.'

  async function onSubmit() {
    if (!valid) return
    setError('')
    const answer: ResolveAnswer = { ...(askCard ? { cardBill: cardValue } : {}), ...(askMoved ? { movedOut: movedValue } : {}) }
    try {
      const result = await resolve.mutateAsync({ id: check.id, answer })
      track('balance_resolved', { reason })
      if (result.proposal) onNext({ name: 'review', proposal: result.proposal, cardShortfall: result.cardShortfall, loggedPct: result.loggedPct })
      else onClose('Got it. Nothing to log.')
    } catch {
      setError(RESOLVE_FAILED)
    }
  }

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
        <Text style={text.title}>{`${formatMoney(check.gap)} left your account.`}</Text>
        <Text style={text.body}>{reason === 'mix' ? 'How much of it was each?' : 'How much was it?'}</Text>
        {askCard && <AmountField label="Card bill" value={card} onChange={setCard} />}
        {askMoved && <AmountField label="Moved, lent or cash" value={moved} onChange={setMoved} />}
        {valid && <Text style={text.body}>{closing ?? restLine}</Text>}
        {error !== '' && <Text style={text.error}>{error}</Text>}
      </ScrollView>
      <Footer>
        <Cta label="Continue" busyLabel="Saving…" busy={resolve.isPending} success={closing !== null} disabled={!valid} onPress={onSubmit} />
      </Footer>
    </>
  )
}

function SurplusQuestion({ check, closing, onClose }: { check: Measured; closing: string | null; onClose: (caption: string) => void }) {
  const { space } = useTheme()
  const text = useTextStyles()
  const { formatMoney } = useCurrency()
  const resolve = useResolveBalanceCheck()
  const [picked, setPicked] = useState<MoneyInReason | null>(null)
  const [error, setError] = useState('')

  async function pick(reason: MoneyInReason) {
    setPicked(reason)
    setError('')
    try {
      await resolve.mutateAsync({ id: check.id, answer: { moneyIn: reason } })
      track('balance_resolved', { reason })
      onClose('Got it. Nothing to log.')
    } catch {
      setPicked(null)
      setError(RESOLVE_FAILED)
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <Text style={text.title}>{`You've got ${formatMoney(-check.gap)} more than we expected.`}</Text>
      <Text style={text.body}>{closing ?? 'Where did it come from? Nothing gets logged.'}</Text>
      {MONEY_IN_OPTIONS.map((o) => (
        <OptionRow
          key={o.reason}
          title={o.title}
          busy={picked === o.reason && resolve.isPending}
          success={picked === o.reason && closing !== null}
          disabled={resolve.isPending || closing !== null}
          onPress={() => pick(o.reason)}
        />
      ))}
      {error !== '' && <Text style={text.error}>{error}</Text>}
    </ScrollView>
  )
}

function Estimates({ proposal, cardShortfall, loggedPct, onDone }: {
  proposal: CaptureProposal
  cardShortfall: number
  loggedPct: number
  onDone: () => void
}) {
  const { tokens, space, radius, type } = useTheme()
  const text = useTextStyles()
  const { formatMoney } = useCurrency()
  const [settled, setSettled] = useState(false)

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
      <Text style={text.title}>{"Here's our best guess"}</Text>
      <Text style={text.body}>
        {"Split across the envelopes you usually spend from, and marked as estimates. Fix anything that's off, then log."}
      </Text>
      {cardShortfall > 0 && (
        <Text style={text.body}>
          {`Your card bill was ${formatMoney(cardShortfall)} more than the card spends you logged, so those are in here too.`}
        </Text>
      )}
      <CaptureReview proposal={proposal} origin={GAP_ORIGIN} onSettled={() => setSettled(true)} />
      {settled && (
        <>
          <Text style={text.body}>{`You'd logged ${loggedPct}% of what left your account yourself.`}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onDone}
            style={[styles.cta, { backgroundColor: tokens.accent, borderRadius: radius.full }]}
          >
            <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>Done</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'right' },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  cardIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  amountWrap: { alignItems: 'center', paddingVertical: 8 },
  cta: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  option: { borderWidth: 1 },
  optionCheck: { alignItems: 'center', paddingVertical: 8 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, gap: 6 },
  fieldInput: { flex: 1, paddingVertical: 12 },
  accountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  accountName: { flex: 1, paddingVertical: 10 },
})
