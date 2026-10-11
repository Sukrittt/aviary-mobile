import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Alert } from '@/src/components/ui/AlertHost'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useAccounts, useAddAccount, useUpdateAccount } from '@/src/hooks/useAccounts'
import { ACCOUNT_TYPES, accountErrorMessage } from '@/src/lib/accounts'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { BottomSheet } from '@/src/components/shared/Modal'
import { ACCOUNT_TYPE_EMOJI } from '@/src/components/shared/AccountChips'
import type { AccountType } from '@/src/types'

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

/** Add or edit an account label. {id} edits. Twin of Web's AccountsPage modal. */
export default function AccountModal() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams()
  const id = str(params.id)
  const existing = useAccounts().data?.find((a) => a.id === id)
  const add = useAddAccount()
  const update = useUpdateAccount()
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<AccountType>(existing?.type ?? 'bank')
  const [saved, setSaved] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!existing) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- backfilling an editable form once an async query result arrives, not derivable from render
    setName(existing.name)
    setType(existing.type)
  }, [existing])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => router.back(), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  const canSubmit = name.trim() !== '' && name.trim().length <= 30
  const busy = add.isPending || update.isPending

  function handleSubmit() {
    if (!canSubmit || busy) return
    const onError = (err: unknown) => Alert.alert("Couldn't save", accountErrorMessage(err))
    if (existing) update.mutate({ id: existing.id, updates: { name: name.trim(), type } }, { onSuccess: () => setSaved(true), onError })
    else add.mutate({ name: name.trim(), type }, { onSuccess: () => setSaved(true), onError })
  }

  function handleArchive() {
    if (!existing) return
    update.mutate(
      { id: existing.id, updates: { archived: true } },
      {
        onSuccess: () => {
          setConfirmArchive(false)
          setSaved(true)
        },
        onError: (err) => {
          setConfirmArchive(false)
          Alert.alert("Couldn't archive this", accountErrorMessage(err))
        },
      },
    )
  }

  const hint =
    type === 'credit_card'
      ? 'Spends on a card set money aside in your Credit Card envelope.'
      : type === 'cash'
        ? "Cash spends don't count in your balance check."
        : 'Your weekly balance check asks about this one.'

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: tokens.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} disabled={saved}>
          <Text style={[styles.headerAction, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{id ? 'Edit account' : 'New account'}</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. HDFC"
            placeholderTextColor={tokens.text3}
            maxLength={30}
            accessibilityLabel="Name"
            style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
            autoFocus={!id}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Type</Text>
          <View style={styles.chipRow}>
            {ACCOUNT_TYPES.map((t) => {
              const selected = type === t.value
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setType(t.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[styles.chip, { backgroundColor: selected ? tokens.accent : tokens.pillBg, borderColor: selected ? tokens.accent : tokens.border }]}
                >
                  <Text style={[styles.chipText, { color: selected ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold, textTransform: 'none' }]}>
                    {ACCOUNT_TYPE_EMOJI[t.value]} {t.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{hint}</Text>
        </View>

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
              {busy ? 'Saving…' : existing ? 'Save changes' : 'Add account'}
            </Text>
          )}
        </Pressable>

        {existing && !saved ? (
          <View style={[styles.dangerZone, { borderTopColor: tokens.border }]}>
            <Pressable onPress={() => setConfirmArchive(true)} disabled={busy} hitSlop={8} style={{ paddingVertical: 10, opacity: busy ? 0.5 : 1 }}>
              <Text style={{ color: tokens.coral, fontSize: 14, fontFamily: fontFamily.bodySemiBold, textAlign: 'center' }}>Archive</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <BottomSheet visible={confirmArchive} onClose={() => !update.isPending && setConfirmArchive(false)}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Archive account</Text>
        <Text style={[styles.sheetBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          {`Archive "${existing?.name ?? ''}"? Expenses on it keep the label.${existing?.type === 'bank' ? ' Your next balance check starts fresh.' : ''}`}
        </Text>
        <View style={styles.sheetButtonRow}>
          <Pressable onPress={() => setConfirmArchive(false)} disabled={update.isPending} style={[styles.sheetCancelButton, { backgroundColor: tokens.pillBg }]}>
            <Text style={[styles.sheetCancelText, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>Back</Text>
          </Pressable>
          <Pressable onPress={handleArchive} disabled={update.isPending} style={[styles.sheetSaveButton, { backgroundColor: tokens.coral, opacity: update.isPending ? 0.6 : 1 }]}>
            <Text style={[styles.sheetSaveText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{update.isPending ? 'Working…' : 'Archive'}</Text>
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
