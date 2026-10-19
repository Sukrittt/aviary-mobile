import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { Alert } from '@/src/components/ui/AlertHost'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { BottomSheet } from '@/src/components/shared/Modal'
import { CurrencyPicker } from '@/src/components/CurrencyPicker'
import { Toggle } from '@/src/components/ui/Toggle'
import { CaretRight } from '@/src/components/shared/icons'
import { useCurrency } from '@/src/context/CurrencyContext'
import { currencyInfo } from '@/src/lib/currencies'
import { BudgetLimitError, createBudget } from '@/src/api/spaces'
import { budgetsKey, useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { currentUserId } from '@/src/api/accessMode'
import { BudgetLimitNote } from '@/src/components/budgets/BudgetLimitNote'
import { ImportFlow } from '@/src/components/onboarding/ImportFlow'

const tick = () => Haptics.selectionAsync().catch(() => {})
const buzzError = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})

const STARTS = [
  { id: 'fresh', title: 'Start fresh', detail: 'Name it, pick a currency and you’re in.' },
  { id: 'import', title: 'Bring in history from another app', detail: 'Your categories and past spends, from YNAB, Wallet and more.' },
] as const

export const BUDGET_EMOJI = ['🏠', '💑', '👪', '✈️', '🏖️', '🎉', '🚗', '🐾', '🎓', '💼', '🛒', '🎁']

/**
 * A short setup for a second (or fifth) budget: name and emoji, currency,
 * and whether to start from the current budget's categories. Not the full
 * onboarding: a person making their second budget already knows the ropes.
 */
export default function NewBudgetModal() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { currencyCode } = useCurrency()
  const { active, atLimit, count, limit } = useBudgetSpaces()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(BUDGET_EMOJI[0])
  const [currency, setCurrency] = useState<string>(currencyCode)
  const [copy, setCopy] = useState(true)
  const [pickingCurrency, setPickingCurrency] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [start, setStart] = useState<'fresh' | 'import'>('fresh')
  const [importing, setImporting] = useState(false)
  const importMode = start === 'import'

  const create = useMutation({
    // An import budget starts empty and un-set-up: the import fills it and sets its currency.
    mutationFn: () => createBudget({ name: name.trim(), emoji, currencyCode: currency, copyCategories: !importMode && copy, ...(importMode && { import: true }) }),
    onSuccess: (budget) => {
      void queryClient.invalidateQueries({ queryKey: budgetsKey })
      setSaved(budget.id)
    },
    onError: (err) => {
      buzzError()
      if (err instanceof BudgetLimitError) Alert.alert("You're at your budget limit", `That's ${limit} of ${limit}. Need more? Contact us and we'll sort it.`)
      else Alert.alert("Couldn't make that budget", 'Check your connection and try again.')
    },
  })

  // The shared success beat, then straight into the new budget (or its import, once it's the open one).
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(async () => {
      const uid = currentUserId()
      if (importMode) {
        if (uid) await switchBudget(queryClient, uid, saved)
        setImporting(true)
        return
      }
      if (uid) void switchBudget(queryClient, uid, saved)
      router.back()
    }, 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  const canSubmit = name.trim() !== '' && name.trim().length <= 40 && !atLimit
  const busy = create.isPending
  const info = currencyInfo(currency)
  // Done, already set up, or "Start fresh instead": the new budget is open, so Home is where it lives.
  const home = () => {
    void queryClient.invalidateQueries()
    router.dismissTo('/(tabs)')
  }

  if (importing) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: tokens.border }]}>
          <Text numberOfLines={1} style={[styles.headerTitle, { flex: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{`${emoji} ${name.trim()}`}</Text>
          <Pressable onPress={home} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.headerAction, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold, width: undefined }]}>Start fresh instead</Text>
          </Pressable>
        </View>
        <View style={[styles.importBody, { paddingBottom: insets.bottom + 20 }]}>
          <ImportFlow skipAsk onFresh={home} onDone={home} onAlreadySetUp={home} />
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: tokens.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} disabled={!!saved}>
          <Text style={[styles.headerAction, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>New budget</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        {atLimit ? (
          <BudgetLimitNote count={count} limit={limit} />
        ) : (
          <>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Name</Text>
              <View style={styles.nameRow}>
                <View style={[styles.swatch, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
                  <Text style={styles.swatchEmoji}>{emoji}</Text>
                </View>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Home, or Goa trip"
                  placeholderTextColor={tokens.text3}
                  maxLength={40}
                  accessibilityLabel="Budget name"
                  autoFocus
                  style={[styles.input, { flex: 1, backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
                />
              </View>
              <View style={styles.emojiRow}>
                {BUDGET_EMOJI.map((e) => {
                  const selected = e === emoji
                  return (
                    <Pressable
                      key={e}
                      onPress={() => {
                        if (!selected) tick()
                        setEmoji(e)
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={e}
                      accessibilityState={{ checked: selected }}
                      style={[styles.emojiCell, { backgroundColor: selected ? tokens.accentSoft : tokens.pillBg, borderColor: selected ? tokens.accent : 'transparent' }]}
                    >
                      <Text style={styles.emoji}>{e}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.field} accessibilityRole="radiogroup">
              <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>How it starts</Text>
              {STARTS.map((c) => {
                const on = start === c.id
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      if (!on) tick()
                      setStart(c.id)
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={c.title}
                    style={[styles.row, { backgroundColor: on ? tokens.accentSoft : tokens.inputBg, borderColor: on ? tokens.accent : tokens.border }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.rowText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{c.title}</Text>
                      <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{c.detail}</Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>

            {importMode ? null : (
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Currency</Text>
                <Pressable
                  onPress={() => setPickingCurrency(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Currency, ${info.name}`}
                  style={[styles.row, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}
                >
                  <Text style={[styles.rowText, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>{`${info.name} · ${info.code}`}</Text>
                  <CaretRight size={16} color={tokens.text3} />
                </Pressable>
              </View>
            )}

            {active && !importMode ? (
              <View style={[styles.row, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.rowText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{`Copy categories from ${active.name}`}</Text>
                  <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>Just the names and groups. No money comes along.</Text>
                </View>
                <Toggle value={copy} onValueChange={setCopy} accessibilityLabel={`Copy categories from ${active.name}`} />
              </View>
            ) : null}

            <Pressable
              onPress={() => canSubmit && !busy && create.mutate()}
              disabled={!canSubmit || busy || !!saved}
              accessibilityRole="button"
              style={[styles.confirmButton, { backgroundColor: saved ? tokens.successBg : tokens.accent, opacity: !canSubmit || busy ? 0.5 : 1 }]}
            >
              {saved ? (
                <CheckIcon color={tokens.onSuccess} />
              ) : (
                <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{busy ? 'Making it…' : 'Create budget'}</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>

      <BottomSheet visible={pickingCurrency} onClose={() => setPickingCurrency(false)}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Currency</Text>
        <CurrencyPicker
          value={currency}
          onChange={(code) => {
            setCurrency(code)
            setPickingCurrency(false)
          }}
        />
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
  body: { padding: 20, gap: 18 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  nameRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  swatch: { width: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatchEmoji: { fontSize: 22 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  emojiCell: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 },
  rowText: { fontSize: 15, flex: 1 },
  hint: { fontSize: 12, lineHeight: 16 },
  confirmButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  confirmText: { fontSize: 16 },
  sheetTitle: { fontSize: 18, marginBottom: 12 },
  importBody: { flex: 1, paddingHorizontal: 22, paddingTop: 16 },
})
