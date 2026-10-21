import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View, StyleSheet } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { BottomSheet } from '@/src/components/shared/Modal'
import { Check } from '@/src/components/shared/icons'
import { Alert } from '@/src/components/ui/AlertHost'
import { HttpError } from '@/src/api/client'
import { getBudgetCategories, moveExpense, type Budget } from '@/src/api/spaces'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { tap } from '@/src/lib/haptics'
import type { ExpenseRow } from '@/src/types'
import { BudgetIcon } from './BudgetIcon'

/**
 * "Move to another budget", for an expense logged in the wrong one. Pick the
 * budget, then one of its categories (the same name is picked for you when it
 * has one), then move. The expense keeps everything else.
 */
export function MoveExpenseSheet({ expense, onClose, onMoved }: { expense: ExpenseRow | null; onClose: () => void; onMoved?: () => void }) {
  const { tokens } = useTheme()
  const queryClient = useQueryClient()
  const { budgets, active } = useBudgetSpaces()
  const others = budgets.filter((b) => b.id !== active?.id)
  const [target, setTarget] = useState<Budget | null>(null)
  const [category, setCategory] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh pick for each expense the sheet opens on
    setTarget(null)
    setCategory(null)
  }, [expense])

  const categoriesQ = useQuery({
    queryKey: ['move-categories', target?.id],
    queryFn: () => getBudgetCategories(target!.id),
    enabled: !!target,
    staleTime: 30_000,
  })
  useEffect(() => {
    if (!categoriesQ.data || category) return
    const same = categoriesQ.data.find((c) => c.name === expense?.category)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preselect once the target's categories arrive
    if (same) setCategory(same.name)
  }, [categoriesQ.data, category, expense?.category])

  const move = useMutation({
    mutationFn: () => moveExpense({ id: expense!.id!, version: expense!.version ?? 0, to: target!.id, category: category! }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] })
      void queryClient.invalidateQueries({ queryKey: ['budgets'] })
      onMoved?.()
      onClose()
    },
    onError: (err) => {
      if (err instanceof HttpError && (err.status === 409 || err.status === 404)) {
        Alert.alert('This expense just changed', 'Someone edited it. Pull to refresh, then try again.')
      } else {
        Alert.alert("Couldn't move it", 'Check your connection and try again.')
      }
    },
  })

  return (
    <BottomSheet visible={expense !== null} onClose={() => !move.isPending && onClose()}>
      <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Move to another budget</Text>
      <Text numberOfLines={1} style={[styles.sub, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{expense?.item}</Text>

      <Text style={[styles.label, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>Budget</Text>
      <View style={styles.list}>
        {others.map((b) => {
          const selected = b.id === target?.id
          return (
            <Pressable
              key={b.id}
              testID={`move-budget-${b.id}`}
              onPress={() => {
                tap()
                setTarget(b)
                setCategory(null)
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={[styles.row, { backgroundColor: selected ? tokens.accentSoft : tokens.pillBg, borderColor: selected ? tokens.accent : 'transparent' }]}
            >
              <BudgetIcon budget={b} size={22} color={tokens.text} />
              <Text style={[styles.name, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{b.name}</Text>
              {selected ? <Check size={18} color={tokens.accentInk} weight="bold" /> : null}
            </Pressable>
          )
        })}
      </View>

      {target ? (
        <>
          <Text style={[styles.label, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{`Category in ${target.name}`}</Text>
          {categoriesQ.isLoading ? (
            <ActivityIndicator color={tokens.accent} style={{ marginVertical: 12 }} />
          ) : categoriesQ.data?.length ? (
            <View style={styles.chips}>
              {categoriesQ.data.map((c) => {
                const selected = c.name === category
                return (
                  <Pressable
                    key={c.name}
                    onPress={() => setCategory(c.name)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    style={[styles.chip, { backgroundColor: selected ? tokens.accent : tokens.pillBg }]}
                  >
                    <Text style={{ color: selected ? tokens.onAccent : tokens.text2, fontSize: 13, fontFamily: fontFamily.bodySemiBold }}>{c.name}</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : (
            <Text style={[styles.sub, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
              {categoriesQ.isError ? "Couldn't load its categories. Check your connection." : `${target.name} has no categories yet. Add one there first.`}
            </Text>
          )}
        </>
      ) : null}

      <Pressable
        testID="move-confirm"
        onPress={() => target && category && move.mutate()}
        disabled={!target || !category || move.isPending}
        accessibilityRole="button"
        style={[styles.confirm, { backgroundColor: tokens.accent, opacity: !target || !category || move.isPending ? 0.5 : 1 }]}
      >
        <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>
          {move.isPending ? 'Moving…' : target ? `Move to ${target.name}` : 'Move'}
        </Text>
      </Pressable>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18 },
  sub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12 },
  name: { fontSize: 15, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  confirm: { borderRadius: 25, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  confirmText: { fontSize: 15 },
})
