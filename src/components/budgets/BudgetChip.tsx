import { useState } from 'react'
import { Pressable, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { CaretDown } from '@/src/components/shared/icons'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { tap } from '@/src/lib/haptics'
import { BudgetSwitcherSheet } from './BudgetSwitcherSheet'
import { BudgetIcon } from './BudgetIcon'

/** The home header's budget name, with 2+ budgets in place of the bird mark. Opens the switcher. */
export function BudgetChip() {
  const { tokens } = useTheme()
  const { active } = useBudgetSpaces()
  const [open, setOpen] = useState(false)
  if (!active) return null
  return (
    <>
      <Pressable
        testID="budget-chip"
        onPress={() => {
          tap()
          setOpen(true)
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${active.name} budget`}
        accessibilityHint="Switch budgets"
        style={[styles.chip, { backgroundColor: tokens.accentSoft }]}
      >
        <BudgetIcon budget={active} size={16} color={tokens.accentInk} />
        <Text numberOfLines={1} style={[styles.name, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>{active.name}</Text>
        <CaretDown size={14} color={tokens.accentInk} weight="bold" />
      </Pressable>
      <BudgetSwitcherSheet visible={open} onClose={() => setOpen(false)} />
    </>
  )
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 150 },
  name: { fontSize: 14, flexShrink: 1 },
})
