import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CaretDown, Plus, X } from '@/src/components/shared/icons'
import { CategoryPickerSheet } from '@/src/components/shared/CategoryPickerSheet'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { Icon } from '@/src/components/shared/Icon'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useAddExpense } from '@/src/hooks/useExpenses'
import { freshStartExpense, freshStartSplit } from '@/src/features/fill-gap/gap'
import { todayLocal } from '@/src/lib/date'
import { splitEmoji } from '@/src/lib/emoji'
import { track } from '@/src/lib/analytics'
import { tap } from '@/src/lib/haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { withReadOnlyGate } from '@/src/components/budgets/ReadOnlyNotice'
import { BudgetReadOnlyError } from '@/src/api/client'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { READ_ONLY_TITLE, readOnlyCopy } from '@/src/lib/budgetMembership'

/** Same beat as every other in-place success (CLAUDE.md). */
const SUCCESS_MS = 1100

/**
 * "Start fresh" from the catch-up sheet on Home: one question. A number logs
 * a single "Untracked spending" today in the envelope you pick, so money left
 * stays honest and history stays as it was. "No idea" just closes.
 * `since` is the last expense's date, which keys the expense so it logs once.
 * "Split across categories" is there for whoever remembers roughly where it
 * went: a rough amount per category, one expense each.
 */
function FreshStartScreen() {
  const { since } = useLocalSearchParams<{ since?: string }>()
  const { tokens, space, radius, type } = useTheme()
  const { currencyPrefix } = useCurrency()
  const insets = useSafeAreaInsets()
  const { active } = useBudgetSpaces()
  const router = useRouter()
  const addExpense = useAddExpense()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [picking, setPicking] = useState(false)
  // null: one total. Otherwise the split's rows, in the order their categories were picked.
  const [split, setSplit] = useState<{ amount: string; category: string }[] | null>(null)
  const [phase, setPhase] = useState<'idle' | 'saving' | 'success'>('idle')
  const [error, setError] = useState('')
  const today = todayLocal()
  const single = freshStartExpense(amount, category, since || today, today)
  const expenses = split ? freshStartSplit(split, since || today, today) : single && [single]
  const busy = phase !== 'idle'
  const cleanAmount = (t: string) => t.replace(/[^\d.,]/g, '')

  // Cleared on unmount, so a screen already dismissed during the tick can't pop the one underneath.
  useEffect(() => {
    if (phase !== 'success') return
    const timer = setTimeout(() => router.back(), SUCCESS_MS)
    return () => clearTimeout(timer)
  }, [phase, router])

  async function save() {
    if (!expenses || busy) return
    tap()
    setPhase('saving')
    setError('')
    try {
      // One after another; each is keyed by the gap (and category), so a retry after a partial failure only adds what's missing.
      for (const expense of expenses) await addExpense.mutateAsync(expense)
      track('fresh_start_logged', { categories: expenses.length })
      setPhase('success')
    } catch (err) {
      setPhase('idle')
      setError(err instanceof BudgetReadOnlyError ? `${READ_ONLY_TITLE}. ${readOnlyCopy(active)}` : 'Check your connection and try again.')
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: tokens.bg }]}
      contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.lg, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
        disabled={busy}
        hitSlop={12}
        style={[styles.close, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.full }]}
      >
        <X size={16} color={tokens.text} />
      </Pressable>

      <View style={{ gap: space.xs }}>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.title }}>Roughly how much did you spend while away?</Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>
          {split
            ? "A ballpark per category is fine. Each goes in as one expense today, so every category's money left stays right."
            : "A ballpark is fine. It goes in as one expense today, so what's left stays right and your history stays as it was."}
        </Text>
      </View>

      {split ? (
        <View style={{ gap: space.sm }}>
          {split.map((row, i) => (
            <View key={row.category} style={[styles.splitRow, { backgroundColor: tokens.inputBg, borderRadius: radius.lg, paddingLeft: space.md, paddingRight: space.xs, gap: space.sm }]}>
              <Text numberOfLines={1} style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{splitEmoji(row.category).text}</Text>
              <View style={[styles.splitAmount, { backgroundColor: tokens.card, borderRadius: radius.md, paddingHorizontal: space.sm }]}>
                <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{currencyPrefix}</Text>
                <TextInput
                  value={row.amount}
                  onChangeText={(t) => setSplit(split.map((r, j) => (j === i ? { ...r, amount: cleanAmount(t) } : r)))}
                  keyboardType="decimal-pad"
                  autoFocus={i === split.length - 1}
                  placeholder="0"
                  placeholderTextColor={tokens.text3}
                  editable={!busy}
                  maxLength={11}
                  accessibilityLabel={`Rough amount for ${splitEmoji(row.category).text}`}
                  style={{ flex: 1, textAlign: 'right', color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body, paddingVertical: space.sm }}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${splitEmoji(row.category).text}`}
                onPress={() => setSplit(split.filter((_, j) => j !== i))}
                disabled={busy}
                hitSlop={8}
                style={styles.remove}
              >
                <X size={14} color={tokens.text3} />
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setPicking(true)}
            disabled={busy}
            style={[styles.category, { borderStyle: 'dashed', borderColor: tokens.borderStrong, borderRadius: radius.lg, padding: space.md, gap: space.sm }]}
          >
            <Icon icon={Plus} size={14} color={tokens.text2} />
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{split.length ? 'Add another category' : 'Add a category'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setSplit(null)} disabled={busy} hitSlop={8}>
            <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>Use one total instead</Text>
          </Pressable>
        </View>
      ) : (
      <>

      <View style={[styles.amount, { backgroundColor: tokens.inputBg, borderRadius: radius.lg, paddingHorizontal: space.md, gap: space.xs }]}>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: 28 }}>{currencyPrefix}</Text>
        <TextInput
          value={amount}
          onChangeText={(t) => setAmount(cleanAmount(t))}
          keyboardType="decimal-pad"
          autoFocus
          placeholder="0"
          placeholderTextColor={tokens.text3}
          editable={!busy}
          maxLength={11}
          accessibilityLabel="Rough total"
          style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: 28, paddingVertical: space.md }}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={category ? `Category: ${category}. Change it` : 'Pick a category'}
        onPress={() => setPicking(true)}
        disabled={busy}
        style={[styles.category, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, padding: space.md }]}
      >
        <Text style={{ flex: 1, color: category ? tokens.text : tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>
          {category ? splitEmoji(category).text : 'Which category should it come out of?'}
        </Text>
        <Icon icon={CaretDown} size={14} color={tokens.text3} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setSplit(category ? [{ amount, category }] : [])} disabled={busy} hitSlop={8} style={{ marginTop: -space.sm }}>
        <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>Split across categories</Text>
      </Pressable>
      </>
      )}

      {error !== '' && <Text accessibilityRole="alert" style={{ color: tokens.coral, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{error}</Text>}

      {/* Right under the fields, not pinned to the bottom: the number pad stays up while you type. */}
      <Pressable
        accessibilityRole="button"
        onPress={save}
        disabled={!expenses || busy}
        style={[styles.primary, { backgroundColor: phase === 'success' ? tokens.successBg : tokens.accent, borderRadius: radius.full, opacity: phase === 'saving' || (!expenses && phase === 'idle') ? 0.5 : 1 }]}
      >
        {phase === 'success' ? (
          <CheckIcon color={tokens.onSuccess} />
        ) : (
          <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{phase === 'saving' ? 'Logging…' : expenses && expenses.length > 1 ? `Log ${expenses.length} expenses` : 'Log it'}</Text>
        )}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} disabled={busy} style={styles.secondary}>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>No idea</Text>
      </Pressable>

      <CategoryPickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        value={split ? '' : category}
        onSelect={(c) => {
          if (!split) setCategory(c)
          else if (c && !split.some((r) => r.category === c)) setSplit([...split, { amount: '', category: c }])
          setPicking(false)
        }}
        title="Category"
        noneLabel="No category"
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  amount: { flexDirection: 'row', alignItems: 'center' },
  category: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  primary: { height: 52, alignItems: 'center', justifyContent: 'center' },
  secondary: { alignItems: 'center', paddingVertical: 10 },
  splitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  splitAmount: { flexDirection: 'row', alignItems: 'center', width: 120 },
  remove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
})

export default withReadOnlyGate(FreshStartScreen)
