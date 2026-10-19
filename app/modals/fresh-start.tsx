import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CaretDown, X } from '@/src/components/shared/icons'
import { CategoryPickerSheet } from '@/src/components/shared/CategoryPickerSheet'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { Icon } from '@/src/components/shared/Icon'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useAddExpense } from '@/src/hooks/useExpenses'
import { freshStartExpense } from '@/src/features/fill-gap/gap'
import { todayLocal } from '@/src/lib/date'
import { splitEmoji } from '@/src/lib/emoji'
import { track } from '@/src/lib/analytics'
import { tap } from '@/src/lib/haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/** Same beat as every other in-place success (CLAUDE.md). */
const SUCCESS_MS = 1100

/**
 * "Start fresh" from the catch-up sheet on Home: one question. A number logs
 * a single "Untracked spending" today in the envelope you pick, so money left
 * stays honest and history stays as it was. "No idea" just closes.
 * `since` is the last expense's date, which keys the expense so it logs once.
 */
export default function FreshStartScreen() {
  const { since } = useLocalSearchParams<{ since?: string }>()
  const { tokens, space, radius, type } = useTheme()
  const { currencyPrefix } = useCurrency()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const addExpense = useAddExpense()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [picking, setPicking] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'saving' | 'success'>('idle')
  const [error, setError] = useState('')
  const today = todayLocal()
  const expense = freshStartExpense(amount, category, since || today, today)
  const busy = phase !== 'idle'

  async function save() {
    if (!expense || busy) return
    tap()
    setPhase('saving')
    setError('')
    try {
      await addExpense.mutateAsync(expense)
      track('fresh_start_logged')
      setPhase('success')
      setTimeout(() => router.back(), SUCCESS_MS)
    } catch {
      setPhase('idle')
      setError('Check your connection and try again.')
    }
  }

  return (
    <View
      style={[styles.screen, { backgroundColor: tokens.bg, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.lg, gap: space.lg }]}>
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
          A ballpark is fine. It goes in as one expense today, so what&apos;s left stays right and your history stays as it was.
        </Text>
      </View>

      <View style={[styles.amount, { backgroundColor: tokens.inputBg, borderRadius: radius.lg, paddingHorizontal: space.md, gap: space.xs }]}>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: 28 }}>{currencyPrefix}</Text>
        <TextInput
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^\d.,]/g, ''))}
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

      {error !== '' && <Text accessibilityRole="alert" style={{ color: tokens.coral, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>{error}</Text>}

      {/* Right under the fields, not pinned to the bottom: the number pad stays up while you type. */}
      <Pressable
        accessibilityRole="button"
        onPress={save}
        disabled={!expense || busy}
        style={[styles.primary, { backgroundColor: phase === 'success' ? tokens.successBg : tokens.accent, borderRadius: radius.full, opacity: phase === 'saving' || (!expense && phase === 'idle') ? 0.5 : 1 }]}
      >
        {phase === 'success' ? (
          <CheckIcon color={tokens.onSuccess} />
        ) : (
          <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{phase === 'saving' ? 'Logging…' : 'Log it'}</Text>
        )}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} disabled={busy} style={styles.secondary}>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>No idea</Text>
      </Pressable>

      <CategoryPickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        value={category}
        onSelect={(c) => {
          setCategory(c)
          setPicking(false)
        }}
        title="Category"
        noneLabel="No category"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  amount: { flexDirection: 'row', alignItems: 'center' },
  category: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  primary: { height: 52, alignItems: 'center', justifyContent: 'center' },
  secondary: { alignItems: 'center', paddingVertical: 10 },
})
