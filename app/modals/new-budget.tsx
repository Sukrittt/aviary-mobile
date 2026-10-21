import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
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
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/shared/CategoryIcon'
import { iconLabel } from '@/src/components/shared/CategoryIconPicker'
import { BUDGET_ICONS } from '@/src/lib/budgetIcons'

const tick = () => Haptics.selectionAsync().catch(() => {})
const buzzError = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})

const STARTS = [
  { id: 'fresh', title: 'Start fresh', detail: 'Name it, pick a currency and you’re in.' },
  { id: 'import', title: 'Bring in history from another app', detail: 'Your categories and past spends, from YNAB, Wallet and more.' },
] as const

/**
 * A short setup for a second (or fifth) budget: name and icon, currency,
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
  const [icon, setIcon] = useState(BUDGET_ICONS[0])
  const [currency, setCurrency] = useState<string>(currencyCode)
  const [copy, setCopy] = useState(true)
  const [pickingCurrency, setPickingCurrency] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [start, setStart] = useState<'fresh' | 'import'>('fresh')
  const [importing, setImporting] = useState(false)
  const importMode = start === 'import'
  const Icon = CATEGORY_ICON_COMPONENTS[icon]

  const create = useMutation({
    // An import budget starts empty and un-set-up: the import fills it and sets its currency.
    mutationFn: () => createBudget({ name: name.trim(), icon, currencyCode: currency, copyCategories: !importMode && copy, ...(importMode && { import: true }) }),
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
          <View style={styles.titleRow}>
            <Icon size={20} color={tokens.text} />
            <Text numberOfLines={1} style={[styles.headerTitle, { flexShrink: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{name.trim()}</Text>
          </View>
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
                  <Icon size={22} color={tokens.text} />
                </View>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={currency === 'INR' ? 'Home, Goa trip, Studio…' : 'Home, Beach trip, Studio…'}
                  placeholderTextColor={tokens.text3}
                  maxLength={40}
                  accessibilityLabel="Budget name"
                  autoFocus
                  style={[styles.input, { flex: 1, backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
                />
              </View>
              <View style={styles.iconRow}>
                {BUDGET_ICONS.map((key) => (
                  <IconCell
                    key={key}
                    iconKey={key}
                    selected={key === icon}
                    onPick={() => {
                      if (key !== icon) tick()
                      setIcon(key)
                    }}
                  />
                ))}
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
                    <View testID={`start-dot-${c.id}`} style={[styles.radio, { borderColor: on ? tokens.accent : tokens.text3 }]}>
                      {on ? <View style={[styles.radioDot, { backgroundColor: tokens.accent }]} /> : null}
                    </View>
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

/** One icon in the picker: squishes on press, and a pick gets a little bounce. */
function IconCell({ iconKey, selected, onPick }: { iconKey: (typeof BUDGET_ICONS)[number]; selected: boolean; onPick: () => void }) {
  const { tokens } = useTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const Cell = CATEGORY_ICON_COMPONENTS[iconKey]
  return (
    <Animated.View style={style}>
      <Pressable
        onPressIn={() => {
          if (!reduceMotion) scale.value = withTiming(0.95, { duration: 90 })
        }}
        onPressOut={() => {
          if (!reduceMotion) scale.value = withSpring(1, { mass: 0.6, damping: 12, stiffness: 260 })
        }}
        onPress={() => {
          if (!selected && !reduceMotion) scale.value = withSequence(withTiming(1.12, { duration: 110 }), withSpring(1, { mass: 0.6, damping: 7, stiffness: 240 }))
          onPick()
        }}
        accessibilityRole="radio"
        accessibilityLabel={iconLabel(iconKey)}
        accessibilityState={{ checked: selected }}
        style={[styles.iconCell, { backgroundColor: selected ? tokens.accentSoft : tokens.pillBg, borderColor: selected ? tokens.accent : 'transparent' }]}
      >
        <Cell size={22} color={selected ? tokens.accentInk : tokens.text2} />
      </Pressable>
    </Animated.View>
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
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  iconCell: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 },
  rowText: { fontSize: 15, flex: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  hint: { fontSize: 12, lineHeight: 16 },
  confirmButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  confirmText: { fontSize: 16 },
  sheetTitle: { fontSize: 18, marginBottom: 12 },
  importBody: { flex: 1, paddingHorizontal: 22, paddingTop: 16 },
})
