import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import Reanimated, { LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Alert } from '@/src/components/ui/AlertHost'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import {
  useAddRecurringIncome,
  useDeleteRecurringIncome,
  useRecurringIncomes,
  useUpdateRecurringIncome,
} from '@/src/hooks/useIncomes'
import { liveAccounts, useAccounts } from '@/src/hooks/useAccounts'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { DatePicker } from '@/src/components/shared/DatePicker'
import { BottomSheet } from '@/src/components/shared/Modal'
import { AccountChips } from '@/src/components/shared/AccountChips'
import { todayLocal } from '@/src/lib/date'

// House spring, same as recurring-expense.tsx.
const FIELD_TRANSITION = LinearTransition.springify().damping(64).stiffness(700)

const FREQUENCIES = ['weekly', 'monthly', 'yearly', 'daily']

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

/**
 * A salary, a weekly gig, a yearly bonus. Route-param driven like
 * recurring-expense.tsx: {id} edits, no params adds; {label, amount,
 * frequency} prefill a new one (Home's Change income). Ready to Assign math
 * is the server's (Web/lib/income.ts). Twin of Web's RecurringIncomeModal.
 */
export default function RecurringIncomeModal() {
  const { currencySymbol } = useCurrency()
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams()
  const id = str(params.id)
  const isEdit = id !== ''

  const recurringQ = useRecurringIncomes()
  const accounts = liveAccounts(useAccounts().data)
  const add = useAddRecurringIncome()
  const update = useUpdateRecurringIncome()
  const remove = useDeleteRecurringIncome()
  const existing = recurringQ.data?.find((r) => r.id === id)
  const isActive = existing ? existing.status === 'active' : true

  const [label, setLabel] = useState(existing?.label ?? str(params.label))
  const [amount, setAmount] = useState(existing?.amount ?? str(params.amount))
  const [frequency, setFrequency] = useState(existing?.frequency || str(params.frequency) || 'monthly')
  const [payday, setPayday] = useState(existing?.start_date || todayLocal())
  const [endDate, setEndDate] = useState(existing?.end_date ?? '')
  const [accountId, setAccountId] = useState(existing?.account_id ?? '')
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // existing loads async on a cold cache: backfill once it arrives.
  useEffect(() => {
    if (!existing) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- backfilling an editable form once an async query result arrives, not derivable from render
    setLabel(existing.label)
    setAmount(existing.amount)
    setFrequency(existing.frequency || 'monthly')
    setPayday(existing.start_date || todayLocal())
    setEndDate(existing.end_date ?? '')
    setAccountId(existing.account_id ?? '')
  }, [existing])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => router.back(), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  const parsed = Number(amount)
  const endsBeforePayday = endDate !== '' && endDate < payday
  const canSubmit = label.trim() !== '' && !Number.isNaN(parsed) && parsed > 0 && payday !== '' && !endsBeforePayday
  const saving = add.isPending || update.isPending
  const busy = saving || remove.isPending

  function handleSubmit() {
    if (!canSubmit || busy) return
    // The account goes only when it changed: an archived one the schedule
    // still names would make every other edit fail.
    const fields = { label: label.trim(), amount: String(parsed), frequency, start_date: payday, end_date: endDate, ...(accountId !== (existing?.account_id ?? '') ? { account_id: accountId } : {}) }
    const onSuccess = () => setSaved(true)
    if (isEdit) {
      update.mutate({ id, updates: fields }, { onSuccess, onError: () => Alert.alert("Couldn't save", 'Check your connection and try again.') })
    } else {
      add.mutate(fields, { onSuccess, onError: () => Alert.alert("Couldn't add this", 'Check your connection and try again.') })
    }
  }

  function handleTogglePause() {
    update.mutate(
      { id, updates: { status: isActive ? 'paused' : 'active' } },
      { onSuccess: () => setSaved(true), onError: () => Alert.alert("Couldn't update this", 'Check your connection and try again.') },
    )
  }

  function handleDelete() {
    remove.mutate(id, {
      onSuccess: () => {
        setConfirmDelete(false)
        setSaved(true)
      },
      onError: () => {
        setConfirmDelete(false)
        Alert.alert("Couldn't delete this", 'Check your connection and try again.')
      },
    })
  }

  const hint =
    frequency === 'monthly'
      ? "Counts toward Ready to Assign from the 1st of every month. We'll record it on payday."
      : 'Lands in Ready to Assign on every payday.'

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: tokens.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} disabled={saved}>
          <Text style={[styles.headerAction, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{isEdit ? 'Edit income' : 'New income'}</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>What is it</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Salary"
            placeholderTextColor={tokens.text3}
            maxLength={200}
            style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
            autoFocus={!isEdit && !str(params.label)}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Amount ({currencySymbol})</Text>
          <View style={[styles.inputRow, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
            <Text style={[styles.currency, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{currencySymbol}</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={tokens.text3}
              accessibilityLabel="Amount"
              style={[styles.amountInput, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>How often</Text>
          <View style={styles.chipRow}>
            {FREQUENCIES.map((f) => {
              const selected = frequency === f
              return (
                <Pressable
                  key={f}
                  onPress={() => setFrequency(f)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[styles.chip, { backgroundColor: selected ? tokens.accent : tokens.pillBg, borderColor: selected ? tokens.accent : tokens.border }]}
                >
                  <Text style={[styles.chipText, { color: selected ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{f}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{isEdit ? 'Payday' : 'Next payday'}</Text>
          <DatePicker mode="single" value={payday} onChange={setPayday} disableFuture={false} />
        </View>

        <Reanimated.View layout={FIELD_TRANSITION} style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Ends (optional)</Text>
          <DatePicker mode="single" value={endDate} onChange={setEndDate} disableFuture={false} />
          {endsBeforePayday ? (
            <Text style={[styles.errorHint, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>The end date can&apos;t be before payday.</Text>
          ) : null}
        </Reanimated.View>

        {accounts.length > 0 && (
          <Reanimated.View layout={FIELD_TRANSITION}>
            <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} allowNone label="Paid into" />
          </Reanimated.View>
        )}

        <Reanimated.View layout={FIELD_TRANSITION}>
          <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{hint}</Text>
        </Reanimated.View>

        <Reanimated.View layout={FIELD_TRANSITION}>
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit || busy || saved}
            accessibilityRole="button"
            style={[styles.confirmButton, { backgroundColor: saved ? tokens.mint : tokens.accent, opacity: !canSubmit || busy ? 0.5 : 1 }]}
          >
            {saved ? (
              <CheckIcon color={tokens.onAccent} />
            ) : (
              <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add income'}
              </Text>
            )}
          </Pressable>
        </Reanimated.View>

        {isEdit && existing && !saved ? (
          <Reanimated.View layout={FIELD_TRANSITION} style={[styles.dangerZone, { borderTopColor: tokens.border }]}>
            <Pressable onPress={handleTogglePause} disabled={busy} hitSlop={8} style={{ paddingVertical: 10, opacity: busy ? 0.5 : 1 }}>
              <Text style={{ color: isActive ? tokens.coral : tokens.mint, fontSize: 14, fontFamily: fontFamily.bodySemiBold, textAlign: 'center' }}>
                {update.isPending ? 'Working…' : isActive ? 'Pause this' : 'Resume this'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setConfirmDelete(true)} disabled={busy} hitSlop={8} style={{ marginTop: 8, paddingVertical: 10, opacity: busy ? 0.5 : 1 }}>
              <Text style={{ color: tokens.text3, fontSize: 13, fontFamily: fontFamily.bodySemiBold, textAlign: 'center' }}>Delete</Text>
            </Pressable>
          </Reanimated.View>
        ) : null}
      </ScrollView>

      <BottomSheet visible={confirmDelete} onClose={() => !remove.isPending && setConfirmDelete(false)}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Delete income</Text>
        <Text style={[styles.sheetBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          {`Remove "${existing?.label ?? ''}"? Paydays already recorded stay put.`}
        </Text>
        <View style={styles.sheetButtonRow}>
          <Pressable onPress={() => setConfirmDelete(false)} disabled={remove.isPending} style={[styles.sheetCancelButton, { backgroundColor: tokens.pillBg, opacity: remove.isPending ? 0.5 : 1 }]}>
            <Text style={[styles.sheetCancelText, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>Back</Text>
          </Pressable>
          <Pressable onPress={handleDelete} disabled={remove.isPending} style={[styles.sheetSaveButton, { backgroundColor: tokens.coral, opacity: remove.isPending ? 0.6 : 1 }]}>
            <Text style={[styles.sheetSaveText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{remove.isPending ? 'Working…' : 'Delete'}</Text>
          </Pressable>
        </View>
      </BottomSheet>
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
  body: { padding: 20, gap: 16 },
  reviewBanner: { borderRadius: 14, padding: 12 },
  reviewBannerText: { fontSize: 12.5, lineHeight: 17 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, gap: 6 },
  currency: { fontSize: 18 },
  amountInput: { flex: 1, fontSize: 18, paddingVertical: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, textTransform: 'capitalize' },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  errorHint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  confirmButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  confirmText: { fontSize: 16 },
  dangerZone: { marginTop: 24, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth },
  sheetTitle: { fontSize: 18, marginBottom: 12 },
  sheetBody: { fontSize: 13, lineHeight: 18 },
  sheetButtonRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  sheetCancelButton: { flex: 1, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  sheetCancelText: { fontSize: 14 },
  sheetSaveButton: { flex: 1, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  sheetSaveText: { fontSize: 14 },
})
