import { useCurrency } from '@/src/context/CurrencyContext'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { BudgetConflictReview } from '@/src/features/budgets/BudgetConflictReview'
import { AmountText } from '@/src/components/ui/AmountText'
import { Numpad } from '@/src/components/ui/Numpad'
import { useAmountEntry } from '@/src/components/ui/useAmountEntry'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useBudgets,useUpdateBudget } from '@/src/hooks/useBudgets'
import { useCategories } from '@/src/hooks/useCategories'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useGroups } from '@/src/hooks/useGroups'
import { EMPTY } from '@/src/lib/constants'
import { categoryEmoji,splitEmoji } from '@/src/lib/emoji'
import { computeEnvelopeState,currentMonthKey,prevMonthKey } from '@/src/lib/envelope'
import { BudgetWriteError } from '@/src/lib/budgetConflict'
import type { BudgetRow } from '@/src/types'

import { fontFamily } from '@/src/theme/fonts'
import { useTheme } from '@/src/theme/ThemeProvider'
import type { ThemeTokens } from '@/src/theme/tokens'
import { useLocalSearchParams,useRouter } from 'expo-router'
import { X } from 'lucide-react-native'
import { useEffect,useState } from 'react'
import { ActivityIndicator,Animated,Pressable,ScrollView,StyleSheet,Text,View } from 'react-native'
import Reanimated,{ FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'

const QUICK_PICKS = [500, 1000, 2500]

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

/** Full-screen replacement for the old inline "Edit assigned amount" sheet
 * (see EnvelopeRow.tsx) — same layout as move-money.tsx's amount step. */
export default function EditAssignedAmountModal() {
  const { tokens } = useTheme()
  const params = useLocalSearchParams()
  const category = str(params.category)

  const budgetsQ = useBudgets()
  const expensesQ = useRecentExpenses()
  const categoriesQ = useCategories()
  const groupsQ = useGroups()

  const isLoading = budgetsQ.isLoading || expensesQ.isLoading || categoriesQ.isLoading || groupsQ.isLoading
  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accentInk} />
      </View>
    )
  }

  const budgets = budgetsQ.data ?? EMPTY
  const expenses = expensesQ.data ?? EMPTY
  const categories = categoriesQ.data ?? EMPTY
  const groups = groupsQ.data ?? EMPTY
  const month = currentMonthKey()
  const prevMonth = prevMonthKey(month)

  const envelopeState = computeEnvelopeState(budgets, expenses, month, categories, groups)
  const prevEnvelopeState = computeEnvelopeState(budgets, expenses, prevMonth, categories, groups)

  const envelope = envelopeState.envelopes.find((e) => e.category === category)
  const lastMonthAssigned = prevEnvelopeState.envelopes.find((e) => e.category === category)?.assigned

  // Mounted only once data has settled, so its initial amountText (below)
  // seeds correctly from the real envelope instead of a still-loading '0'.
  return (
    <EditAmountBody
      category={category}
      month={month}
      version={budgets.find((b) => b.month === month && b.category === category)?.version ?? 0}
      currentAssigned={envelope?.assigned ?? 0}
      spent={envelope?.spent ?? 0}
      isCreditCardPayment={!!envelope?.isCreditCardPayment}
      group={envelope?.group ?? ''}
      lastMonthAssigned={lastMonthAssigned}
      readyToAssign={envelopeState.readyToAssign}
    />
  )
}

function EditAmountBody({
  category,
  month,
  version,
  currentAssigned,
  spent,
  isCreditCardPayment,
  group,
  lastMonthAssigned,
  readyToAssign,
}: {
  category: string
  month: string
  version: number
  currentAssigned: number
  spent: number
  isCreditCardPayment: boolean
  group: string
  lastMonthAssigned: number | undefined
  readyToAssign: number
}) {
  const { formatCurrency, formatAmountInput, formatMoney } = useCurrency()

  const { tokens, space, radius, type } = useTheme()
  const { hideAmounts } = usePrivacy()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const updateBudget = useUpdateBudget()

  const name = isCreditCardPayment ? 'Credit Card Payment' : splitEmoji(category).text
  const emoji = isCreditCardPayment ? '💳' : categoryEmoji(category, group)

  const { amount: amountText, setAmount: setAmountText, pushDigit, handleBackspace, shake } = useAmountEntry(String(currentAssigned))
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [baseAssigned, setBaseAssigned] = useState(currentAssigned)
  const [baseReadyToAssign, setBaseReadyToAssign] = useState(readyToAssign)
  const [expectedVersion, setExpectedVersion] = useState(version)
  const [conflict, setConflict] = useState<BudgetRow | null>(null)

  const value = Number(amountText) || 0
  const delta = value - baseAssigned
  const projectedRTA = baseReadyToAssign - delta
  const impactText =
    value === 0
      ? `${formatCurrency(baseReadyToAssign, hideAmounts)} left in Ready to Assign`
      : delta === 0
        ? `${formatCurrency(baseAssigned, hideAmounts)} already assigned this month`
        : delta > 0
          ? `Pulls ${formatCurrency(delta, hideAmounts)} from Ready to Assign`
          : `Frees ${formatCurrency(-delta, hideAmounts)} back to Ready to Assign`

  async function submitEdit() {
    setSaving(true)
    setError('')
    try {
      // A missing row is conceptual version 0. PUT creates it conditionally,
      // so simultaneous first assignments cannot overwrite one another.
      await updateBudget.mutateAsync({ month, category, version: expectedVersion, updates: { assigned: String(value) } })
      setSuccess(true)
    } catch (err) {
      if (err instanceof BudgetWriteError && err.status === 409 && err.current) {
        setConflict(err.current)
      } else {
        setError('Could not save. Check your connection and try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  function reviewLatest(keepDraft: boolean) {
    if (!conflict) return
    const latest = Number(conflict.assigned) || 0
    setBaseReadyToAssign(baseReadyToAssign - (latest - baseAssigned))
    setBaseAssigned(latest)
    setExpectedVersion(conflict.version)
    if (!keepDraft) setAmountText(String(latest))
    setConflict(null)
    setError('')
  }

  // Let the inline checkmark finish drawing before navigating back.
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => router.back(), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success])

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      {conflict && (
        <BudgetConflictReview
          title="Edit amount"
          heading="This assignment was updated"
          label="Assigned amount"
          latestAmount={Number(conflict.assigned) || 0}
          draftAmount={value}
          onChoose={reviewLatest}
          onClose={() => {
            setConflict(null)
            setError('')
          }}
        />
      )}
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
          Edit amount
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.stepLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>
          ASSIGNED AMOUNT
        </Text>
        <EnvelopeCard
          name={name}
          emoji={emoji}
          spent={spent}
          currentAssigned={baseAssigned}
          hideAmounts={hideAmounts}
          tokens={tokens}
          space={space}
          radius={radius}
          type={type}
        />

        <View style={[styles.amountWrap, { gap: space.sm }]}>
          <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }}>
            <AmountText
              value={value}
              rawText={formatAmountInput(amountText)}
              size={type.hero}
              weight="displayBold"
              animate
              ignoreHide
            />
          </Animated.View>
          <Reanimated.Text
            key={impactText}
            entering={FadeIn.duration(150)}
            style={{
              color: (value === 0 ? baseReadyToAssign : projectedRTA) < 0 ? tokens.coral : tokens.text2,
              fontSize: type.caption,
              fontFamily: fontFamily.bodyMedium,
            }}
          >
            {impactText}
            {value > 0 && projectedRTA < 0 ? ` · ${formatCurrency(-projectedRTA, hideAmounts)} over` : ''}
          </Reanimated.Text>
        </View>

        <View style={styles.quickRow}>
          {QUICK_PICKS.map((v) => (
            <QuickChip
              key={v}
              label={formatMoney(v)}
              active={value === v}
              onPress={() => setAmountText(String(v))}
              tokens={tokens}
              radius={radius}
            />
          ))}
        </View>
        {!isCreditCardPayment && !!lastMonthAssigned && (
          <View style={styles.quickRow}>
            <QuickChip
              label={`Last month · ${formatCurrency(lastMonthAssigned, hideAmounts)}`}
              active={value === lastMonthAssigned}
              onPress={() => setAmountText(String(Math.round(lastMonthAssigned)))}
              tokens={tokens}
              radius={radius}
            />
          </View>
        )}

        {error !== '' && <Text style={{ color: tokens.coral, fontSize: 12 }}>{error}</Text>}
      </ScrollView>

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, gap: space.md }}>
        <Numpad
          extraKey="."
          onDigit={pushDigit}
          onBackspace={handleBackspace}
          onClear={() => setAmountText('')}
          disabled={saving || success}
        />
        <Pressable
          style={[
            styles.confirmButton,
            { backgroundColor: success ? tokens.mint : tokens.accent, borderRadius: radius.full, opacity: saving ? 0.5 : 1 },
          ]}
          onPress={submitEdit}
          disabled={saving || success}
        >
          {success ? (
            <CheckIcon color={tokens.onAccent} size={16} />
          ) : (
            <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

/** Mirrors move-money.tsx's DestinationCard, minus the overspend framing (not relevant to editing an assignment). */
function EnvelopeCard({
  name,
  emoji,
  spent,
  currentAssigned,
  hideAmounts,
  tokens,
  space,
  radius,
  type,
}: {
  name: string
  emoji: string
  spent: number
  currentAssigned: number
  hideAmounts: boolean
  tokens: ThemeTokens
  space: Record<string, number>
  radius: Record<string, number>
  type: Record<string, number>
}) {
  const { formatCurrency } = useCurrency()

  return (
    <View style={[styles.destCard, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, padding: space.md, gap: space.md }]}>
      <View style={[styles.destIcon, { backgroundColor: tokens.accentSoft, borderRadius: radius.md }]}>
        <Text style={{ fontSize: type.title }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.destLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>EDITING</Text>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>{name}</Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>
          {formatCurrency(spent, hideAmounts)} spent · {formatCurrency(currentAssigned, hideAmounts)} assigned
        </Text>
      </View>
    </View>
  )
}

/** Reused only here and in move-money.tsx's amount step — kept local rather than extracted. */
function QuickChip({
  label,
  active,
  onPress,
  tokens,
  radius,
}: {
  label: string
  active: boolean
  onPress: () => void
  tokens: ThemeTokens
  radius: Record<string, number>
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        onPress()
      }}
      style={[
        styles.quickChip,
        {
          borderRadius: radius.full,
          borderColor: active ? tokens.accent : tokens.borderStrong,
          backgroundColor: active ? tokens.accentSoft : tokens.inputBg,
        },
      ]}
    >
      <Text style={{ color: active ? tokens.accentInk : tokens.text2, fontSize: 12, fontFamily: fontFamily.bodyBold }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'right' },
  body: {},
  stepLabel: { letterSpacing: 0.6 },
  destCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  destIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  destLabel: { letterSpacing: 0.6 },
  amountWrap: { alignItems: 'center', paddingVertical: 8 },
  quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  quickChip: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1 },
  confirmButton: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
})
