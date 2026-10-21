import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Alert } from '@/src/components/ui/AlertHost'
import { useTheme } from '@/src/theme/ThemeProvider'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { fontFamily } from '@/src/theme/fonts'

import { useHoldings, usePerformHoldingAction } from '@/src/hooks/useHoldings'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { withReadOnlyGate } from '@/src/components/budgets/ReadOnlyNotice'

type ActionType = 'market_update' | 'contribution' | 'withdrawal'

const TITLES: Record<ActionType, string> = {
  market_update: 'Update market value',
  contribution: 'Add contribution',
  withdrawal: 'Withdraw',
}
const DESCRIPTIONS: Record<ActionType, string> = {
  market_update: 'Set the new current value.',
  contribution: 'Amount being invested. Tracked here only. Budget it separately if you want it reflected in Ready to Assign.',
  withdrawal: 'Amount to withdraw. Tracked here only. Budget it separately if you want it reflected in Ready to Assign.',
}
const isActionType = (v: unknown): v is ActionType =>
  v === 'market_update' || v === 'contribution' || v === 'withdrawal'

// Route-param driven per the plan's primary approach: investments.tsx passes
// {name, action} when a row's action sheet option is tapped. (Not the
// pick-inside-the-modal alternative — the sheet already picks the action.)
function HoldingActionModal() {
  const { formatCurrency, currencySymbol } = useCurrency()

  const { tokens } = useTheme()
  const { hideAmounts } = usePrivacy()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const rawParams = useLocalSearchParams()
  const name = typeof rawParams.name === 'string' ? rawParams.name : ''
  const action: ActionType = isActionType(rawParams.action) ? rawParams.action : 'market_update'

  const holdingsQuery = useHoldings()
  const performAction = usePerformHoldingAction()
  const holding = holdingsQuery.data?.find((h) => h.name === name)
  const currentValue = Number(holding?.value) || 0

  const [amount, setAmount] = useState(action === 'market_update' && holding ? String(currentValue) : '')
  const [confirmSuccess, setConfirmSuccess] = useState(false)

  const parsed = Number(amount)
  const canSubmit = amount.trim() !== '' && !Number.isNaN(parsed) && parsed >= 0

  // Let the inline checkmark finish drawing before navigating back.
  useEffect(() => {
    if (!confirmSuccess) return
    const timer = setTimeout(() => router.back(), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmSuccess])

  function handleConfirm() {
    if (!canSubmit) return
    performAction.mutate(
      { name, action, amount: parsed },
      {
        onSuccess: () => setConfirmSuccess(true),
        onError: () => {
          Alert.alert("Couldn't save this holding", 'Check your connection and try again.')
        },
      },
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: tokens.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.headerAction, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
            Cancel
          </Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          {TITLES[action]}
        </Text>
        <View style={{ width: 52 }} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.holdingName, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}>{name}</Text>
        {holding && (
          <Text style={[styles.currentValue, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            Current value: {formatCurrency(currentValue, hideAmounts)}
          </Text>
        )}
        <Text style={[styles.description, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          {DESCRIPTIONS[action]}
        </Text>

        <View style={[styles.inputRow, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
          <Text style={[styles.currency, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{currencySymbol}</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={tokens.text3}
            style={[styles.input, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
            autoFocus
          />
        </View>

        <Pressable
          onPress={handleConfirm}
          disabled={!canSubmit || performAction.isPending || confirmSuccess}
          style={[
            styles.confirmButton,
            {
              backgroundColor: confirmSuccess ? tokens.successBg : tokens.accent,
              opacity: !canSubmit || performAction.isPending ? 0.5 : 1,
            },
          ]}
        >
          {confirmSuccess ? (
            <CheckIcon color={tokens.onSuccess} />
          ) : (
            <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>
              {performAction.isPending ? 'Saving…' : 'Confirm'}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAction: { fontSize: 14, width: 52 },
  headerTitle: { fontSize: 16 },
  body: { padding: 20, gap: 8 },
  holdingName: { fontSize: 18 },
  currentValue: { fontSize: 13, marginBottom: 4 },
  description: { fontSize: 13, marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, gap: 6 },
  currency: { fontSize: 20 },
  input: { flex: 1, fontSize: 20, paddingVertical: 14 },
  confirmButton: { marginTop: 20, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: 16 },
})

export default withReadOnlyGate(HoldingActionModal)
