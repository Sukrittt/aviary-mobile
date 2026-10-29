import { useEffect, useState } from 'react'
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useCurrency } from '@/src/context/CurrencyContext'
import { ScreenHeader } from '@/src/components/shared/ScreenHeader'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { AmountText } from '@/src/components/ui/AmountText'
import { Numpad } from '@/src/components/ui/Numpad'
import { useAmountEntry } from '@/src/components/ui/useAmountEntry'
import { withReadOnlyGate } from '@/src/components/budgets/ReadOnlyNotice'
import { GoalByFields, draftOf, goalOf, GOAL_SAVE_FAILED } from '@/src/components/envelope/GoalFields'
import { useCategories, useCategoryTint, useUpdateCategory } from '@/src/hooks/useCategories'
import { useBudgets, useCarry } from '@/src/hooks/useBudgets'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useGroups } from '@/src/hooks/useGroups'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { CarryFailed } from '@/src/components/shared/CarryFailed'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { computeEnvelopeState, currentMonthKey } from '@/src/lib/envelope'
import { goalProgress, shortMonth } from '@/src/lib/goal'
import { EMPTY } from '@/src/lib/constants'
import { splitEmoji } from '@/src/lib/emoji'
import type { CategoryGoal } from '@/src/types'

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

/** Make an envelope a goal, change it, or turn it back into a spending category. Laid out like Pull money (move-money.tsx). */
function GoalModal() {
  const { tokens } = useTheme()
  const category = str(useLocalSearchParams().category)
  const month = currentMonthKey()
  const budgetsQ = useBudgets()
  const carryQ = useCarry(month)
  const expensesQ = useRecentExpenses()
  const categoriesQ = useCategories()
  const groupsQ = useGroups()
  if (budgetsQ.isLoading || carryQ.isLoading || expensesQ.isLoading || categoriesQ.isLoading || groupsQ.isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accentInk} />
      </View>
    )
  }
  if (carryQ.isError && carryQ.data === undefined) return <CarryFailed />
  const categories = categoriesQ.data ?? EMPTY
  const row = categories.find((c) => c.name === category)
  const envelope = computeEnvelopeState(budgetsQ.data ?? EMPTY, expensesQ.data ?? EMPTY, month, categories, groupsQ.data ?? EMPTY, undefined, carryQ.data)
    .envelopes.find((e) => e.category === category)
  // Mounted once everything's in, so the amount seeds from the saved goal and the math from the real envelope.
  return (
    <GoalBody
      category={category}
      icon={row?.icon}
      goal={row?.goal}
      month={month}
      available={envelope?.available ?? 0}
      assigned={envelope?.assigned ?? 0}
      spent={envelope?.spent ?? 0}
    />
  )
}

function GoalBody({ category, icon, goal, month, available, assigned, spent }: {
  category: string
  icon: string | undefined
  goal?: CategoryGoal
  month: string
  available: number
  assigned: number
  spent: number
}) {
  const { tokens, space, radius, type } = useTheme()
  const { formatAmountInput, formatCurrency } = useCurrency()
  const { hideAmounts } = usePrivacy()
  const tint = useCategoryTint()(category)
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const update = useUpdateCategory()
  const name = splitEmoji(category).text
  const money = (n: number) => formatCurrency(n, hideAmounts)

  const start = draftOf(goal)
  const { amount, setAmount, pushDigit, handleBackspace, shake } = useAmountEntry(start.amount)
  const [when, setWhen] = useState({ by: start.by, yearly: start.yearly })
  const draft = { amount, ...when }
  const next = goalOf(draft)
  const [pending, setPending] = useState<'save' | 'remove' | null>(null)
  const [success, setSuccess] = useState<'save' | 'remove' | null>(null)
  const [error, setError] = useState('')
  const busy = !!pending || !!success

  // What the draft means, in the row's own math: the line under the amount, like Pull money's.
  const progress = next ? goalProgress({ goal: next, month, available, assigned, spent }) : null
  const caption = !(Number(amount) > 0)
    ? 'Type a target to get started'
    : !progress
      ? ''
      : progress.status === 'funded'
        ? "You've already saved that much"
        : progress.monthlyNeed !== undefined && progress.by
          ? `${money(progress.monthlyNeed)}/mo gets you there by ${shortMonth(progress.by)}`
          : progress.paceMonth
            ? `At this pace, you're there by ${shortMonth(progress.paceMonth)}`
            : 'Pick a month to see what it takes each month'

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))
  // Let the inline checkmark finish drawing before navigating back.
  useEffect(() => {
    if (!success) return
    const t = setTimeout(close, 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success])

  async function write(key: 'save' | 'remove', value: CategoryGoal | null) {
    if (busy) return
    setPending(key)
    setError('')
    try {
      await update.mutateAsync({ name: category, updates: { goal: value } })
      setSuccess(key)
    } catch {
      setError(GOAL_SAVE_FAILED)
    } finally {
      setPending(null)
    }
  }

  const button = (key: 'save' | 'remove', label: string, primary: boolean, disabled: boolean, onPress: () => void) => {
    const live = primary && !disabled
    return (
      <Pressable
        key={key}
        style={[styles.button, { borderRadius: radius.full, backgroundColor: success === key ? tokens.successBg : live ? tokens.accent : tokens.inputBg, opacity: pending === key ? 0.5 : 1 }]}
        disabled={disabled || busy}
        onPress={onPress}
        accessibilityRole="button"
      >
        {success === key ? <CheckIcon color={tokens.onSuccess} size={16} /> : (
          <Text style={{ color: live ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{pending === key ? 'Saving…' : label}</Text>
        )}
      </Pressable>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScreenHeader title={goal ? `Goal for ${name}` : `Make ${name} a goal`} onBack={close} close backDisabled={busy} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg }}>
        {/* What it's for and what's in it now, like Pull money's Moving to card. */}
        <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, padding: space.md, gap: space.md }]}>
          <View style={[styles.cardIcon, { backgroundColor: tint.bg, borderRadius: radius.md }]}>
            <CategoryIcon name={category} icon={icon} size={type.title} color={tint.ink} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.label, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>SAVING FOR</Text>
            <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>{name}</Text>
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{money(Math.max(0, available))} saved so far</Text>
          </View>
        </View>
        <View style={[styles.amountWrap, { gap: space.sm }]}>
          <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }}>
            <AmountText value={Number(amount) || 0} rawText={formatAmountInput(amount)} fit size={type.hero} weight="displayBold" animate ignoreHide />
          </Animated.View>
          {!!caption && <Text style={{ color: tokens.text2, fontSize: type.caption, fontFamily: fontFamily.bodyMedium, textAlign: 'center' }}>{caption}</Text>}
        </View>
        {/* Where Pull money keeps its quick amounts. Held still while saving, so what's saved is what's shown. */}
        <View pointerEvents={busy ? 'none' : 'auto'}>
          <GoalByFields compact draft={draft} onChange={(d) => setWhen({ by: d.by, yearly: d.yearly })} />
        </View>
        {!!error && <Text style={{ color: tokens.coral, fontSize: 12, textAlign: 'center' }}>{error}</Text>}
      </ScrollView>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, gap: space.md }}>
        <Numpad extraKey="." onDigit={pushDigit} onBackspace={handleBackspace} onClear={() => setAmount('')} disabled={busy} />
        <View style={styles.actions}>
          {goal && button('remove', 'Remove goal', false, false, () => void write('remove', null))}
          {button('save', amount ? 'Save goal' : 'Add a target', true, !next, () => next && void write('save', next))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { letterSpacing: 0.6 },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  cardIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  amountWrap: { alignItems: 'center', paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
})

export default withReadOnlyGate(GoalModal)
