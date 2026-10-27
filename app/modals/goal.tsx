import { useEffect, useState } from 'react'
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native'
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
import { useCategories, useUpdateCategory } from '@/src/hooks/useCategories'
import { splitEmoji } from '@/src/lib/emoji'
import type { CategoryGoal } from '@/src/types'

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

/** Make an envelope a goal, change it, or turn it back into a spending category. Same numpad layout as edit-assigned-amount.tsx. */
function GoalModal() {
  const { tokens } = useTheme()
  const category = str(useLocalSearchParams().category)
  const categoriesQ = useCategories()
  if (categoriesQ.isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accentInk} />
      </View>
    )
  }
  // Mounted once the list is in, so the amount seeds from the saved goal.
  return <GoalBody category={category} goal={categoriesQ.data?.find((c) => c.name === category)?.goal} />
}

function GoalBody({ category, goal }: { category: string; goal?: CategoryGoal }) {
  const { tokens, space, radius, type } = useTheme()
  const { formatAmountInput } = useCurrency()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const update = useUpdateCategory()
  const name = splitEmoji(category).text

  const start = draftOf(goal)
  const { amount, setAmount, pushDigit, handleBackspace, shake } = useAmountEntry(start.amount)
  const [when, setWhen] = useState({ by: start.by, yearly: start.yearly })
  const draft = { amount, ...when }
  const next = goalOf(draft)
  const [pending, setPending] = useState<'save' | 'remove' | null>(null)
  const [success, setSuccess] = useState<'save' | 'remove' | null>(null)
  const [error, setError] = useState('')
  const busy = !!pending || !!success

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
      {/* Centred in the space over the numpad, a touch above true centre so it doesn't read as sinking. */}
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.lg, paddingBottom: space.xl * 2 }}>
        <View style={[styles.amountWrap, { gap: space.md }]}>
          <Text style={[styles.stepLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>TARGET</Text>
          <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }}>
            <AmountText value={Number(amount) || 0} rawText={formatAmountInput(amount)} fit size={type.hero} weight="displayBold" animate ignoreHide />
          </Animated.View>
          {/* Held still while saving, like the numpad, so what's saved is what's shown. */}
          <View pointerEvents={busy ? 'none' : 'auto'}>
            <GoalByFields compact draft={draft} onChange={(d) => setWhen({ by: d.by, yearly: d.yearly })} />
          </View>
        </View>
        {!!error && <Text style={{ color: tokens.coral, fontSize: 12, textAlign: 'center' }}>{error}</Text>}
      </View>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, gap: space.md }}>
        <Numpad extraKey="." onDigit={pushDigit} onBackspace={handleBackspace} onClear={() => setAmount('')} disabled={busy} />
        <View style={styles.actions}>
          {goal && button('remove', 'Back to spending', false, false, () => void write('remove', null))}
          {button('save', amount ? 'Save goal' : 'Add a target', true, !next, () => next && void write('save', next))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stepLabel: { letterSpacing: 0.6 },
  amountWrap: { alignItems: 'center', paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
})

export default withReadOnlyGate(GoalModal)
