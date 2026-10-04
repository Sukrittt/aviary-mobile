import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { Toggle } from '@/src/components/ui/Toggle'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Alert } from '@/src/components/ui/AlertHost'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useAddHolding, useHoldings, useUpdateHolding } from '@/src/hooks/useHoldings'
import { predictHoldingType } from '@/src/api/holdings'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { ConflictReview } from '@/src/components/shared/ConflictReview'
import {
  HoldingWriteError,
  holdingChanges,
  holdingDraft,
  rebaseHoldingDraft,
  type HoldingDraft,
} from '@/src/lib/holdingConflict'
import type { HoldingRow } from '@/src/types'

const TYPES = ['Equity', 'FD', 'Mutual Fund', 'Gold', 'Crypto', 'Bonds', 'Other']

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

// Route-param driven per holding-action.tsx/subscription.tsx's pattern:
// {name} → edit mode, no params → add. Edit only ever touches is_recurring/
// recurring_amount — never `value` — so a holding's base balance stays put
// and the monthly amount accrues on top of it (matches applyHoldingAction's
// additive 'contribution' case on the backend).
export default function AddHoldingModal() {
  const { currencySymbol } = useCurrency()

  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams()
  const origName = str(params.name)
  const isEdit = origName !== ''

  const addHolding = useAddHolding()
  const updateHolding = useUpdateHolding()
  const holdingsQ = useHoldings()
  const existing = holdingsQ.data?.find((h) => h.name === origName)

  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [typeTouched, setTypeTouched] = useState(false)
  const [value, setValue] = useState('')
  const [base, setBase] = useState<HoldingDraft | null>(null)
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringAmount, setRecurringAmount] = useState('')
  const [conflict, setConflict] = useState<HoldingRow | null>(null)
  const [saved, setSaved] = useState(false)

  // existing loads async on first mount (query cache may be cold) — backfill once it arrives.
  // Guarded by a ref, not just the effect running once: a background refetch can resolve
  // `existing` again (new reference) after the user has already started editing, and would
  // otherwise stomp their in-progress toggle/amount back to the stale server value.
  const backfilledRef = useRef(false)
  useEffect(() => {
    if (!existing || backfilledRef.current) return
    backfilledRef.current = true
    const loaded = holdingDraft(existing)
    setBase(loaded)
    setExpectedVersion(existing.version)
    setIsRecurring(loaded.isRecurring)
    setRecurringAmount(loaded.recurringAmount)
  }, [existing])

  // Debounced auto-suggest while typing the name, only until the user
  // manually picks a type (so we never fight a deliberate choice). Add-only:
  // edit mode never shows the type field.
  useEffect(() => {
    if (isEdit || typeTouched || name.trim().length < 3) return
    let cancelled = false
    const timer = setTimeout(() => {
      predictHoldingType(name, TYPES).then((suggested) => {
        if (cancelled || !suggested) return
        setType(suggested)
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [name, isEdit, typeTouched])

  const parsedValue = Number(value)
  const parsedRecurring = Number(recurringAmount)
  const recurringOk = !isRecurring || (recurringAmount.trim() !== '' && !Number.isNaN(parsedRecurring) && parsedRecurring >= 0)
  const draft = { isRecurring, recurringAmount }
  const recurringUpdates = base ? holdingChanges(base, draft) : {}
  const hasChanges = Object.keys(recurringUpdates).length > 0
  const canSubmit = isEdit
    ? base !== null && expectedVersion !== null && recurringOk && hasChanges
    : name.trim() !== '' && value.trim() !== '' && !Number.isNaN(parsedValue) && parsedValue >= 0 && recurringOk
  const saving = addHolding.isPending || updateHolding.isPending

  // Let the inline checkmark finish drawing before navigating back.
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => router.back(), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  function handleSubmit() {
    if (!canSubmit) return
    if (isEdit) {
      updateHolding.mutate(
        {
          name: origName,
          version: expectedVersion!,
          updates: recurringUpdates,
        },
        {
          onSuccess: () => setSaved(true),
          onError: (error) => {
            if (error instanceof HoldingWriteError && error.status === 409 && error.current) {
              setConflict(error.current)
              return
            }
            Alert.alert(
              'Could not save changes',
              error instanceof Error ? error.message : 'Check your connection and try again.',
            )
          },
        },
      )
    } else {
      addHolding.mutate(
        {
          name: name.trim(),
          type: type || 'Other',
          value: value.trim(),
          is_recurring: isRecurring,
          recurring_amount: isRecurring ? recurringAmount.trim() : undefined,
        },
        {
          onSuccess: () => setSaved(true),
          onError: () => Alert.alert('Could not add holding', 'Check your connection and try again.'),
        },
      )
    }
  }

  function reviewLatest(keepDraft: boolean) {
    if (!conflict || !base) return
    const latest = holdingDraft(conflict)
    const next = keepDraft ? rebaseHoldingDraft(base, draft, conflict) : latest
    setBase(latest)
    setExpectedVersion(conflict.version)
    setIsRecurring(next.isRecurring)
    setRecurringAmount(next.recurringAmount)
    setConflict(null)
  }

  function describeRecurring(value: HoldingDraft) {
    return value.isRecurring
      ? `${currencySymbol}${Number(value.recurringAmount || 0).toLocaleString()} monthly`
      : 'Off'
  }

  const merged = conflict && base ? rebaseHoldingDraft(base, draft, conflict) : null

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: tokens.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {conflict && merged && (
        <ConflictReview
          title="Review holding"
          heading="This holding was updated"
          description="A newer version was saved elsewhere. Your monthly contribution is still here."
          rows={[
            {
              label: 'Monthly contribution',
              saved: describeRecurring(holdingDraft(conflict)),
              next: describeRecurring(merged),
            },
          ]}
          guidance="Continue with your edit and keep the latest holding updates. You can review it before saving."
          announcement="This holding was updated elsewhere. Review the latest saved monthly contribution and your changes."
          testID="holding-conflict-scroll"
          onChoose={reviewLatest}
          onClose={() => setConflict(null)}
        />
      )}
      <View
        style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: tokens.border }]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} disabled={saved}>
          <Text style={[styles.headerAction, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
            Cancel
          </Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          {isEdit ? 'Edit monthly contribution' : 'Add Holding'}
        </Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {isEdit ? (
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Holding</Text>
            <Text style={[styles.editHoldingName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
              {origName}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Stocks"
                placeholderTextColor={tokens.text3}
                style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
                autoFocus
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Type</Text>
              <View style={styles.typeRow}>
                {TYPES.map((t) => {
                  const selected = type === t
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        setType(t)
                        setTypeTouched(true)
                      }}
                      style={[
                        styles.typePill,
                        {
                          backgroundColor: selected ? tokens.accent : tokens.pillBg,
                          borderColor: selected ? tokens.accent : tokens.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typePillText,
                          { color: selected ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold },
                        ]}
                      >
                        {t}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>

                Starting value ({currencySymbol})
              </Text>
              <View style={[styles.inputRow, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
                <Text style={[styles.currency, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{currencySymbol}</Text>
                <TextInput
                  value={value}
                  onChangeText={setValue}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={tokens.text3}
                  style={[styles.amountInput, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
                />
              </View>
            </View>
          </>
        )}

        <View style={styles.field}>
          <View style={styles.recurringRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
                Repeat monthly (SIP/PF)
              </Text>
              <Text style={[styles.recurringHint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
                {isEdit
                  ? 'Adds the amount below as a contribution on top of the current balance every month'
                  : 'Adds the amount below as a contribution on this day every month'}
              </Text>
            </View>
            <Toggle
              value={isRecurring}
              onValueChange={setIsRecurring}
            />
          </View>
        </View>

        {isRecurring && (
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>

              Monthly contribution ({currencySymbol})
            </Text>
            <View style={[styles.inputRow, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
              <Text style={[styles.currency, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{currencySymbol}</Text>
              <TextInput
                value={recurringAmount}
                onChangeText={setRecurringAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={tokens.text3}
                style={[styles.amountInput, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
              />
            </View>
          </View>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit || saving || saved}
          style={[
            styles.confirmButton,
            {
              backgroundColor: saved ? tokens.mint : tokens.accent,
              opacity: !canSubmit || saving ? 0.5 : 1,
            },
          ]}
        >
          {saved ? (
            <CheckIcon color={tokens.onAccent} />
          ) : (
            <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add Holding'}
            </Text>
          )}
        </Pressable>
      </ScrollView>
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
  body: { padding: 20, gap: 20 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  editHoldingName: { fontSize: 16 },
  recurringRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recurringHint: { fontSize: 12, marginTop: 4, textTransform: 'none', letterSpacing: 0 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  typePillText: { fontSize: 13 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, gap: 6 },
  currency: { fontSize: 18 },
  amountInput: { flex: 1, fontSize: 18, paddingVertical: 14 },
  confirmButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  confirmText: { fontSize: 16 },
})
