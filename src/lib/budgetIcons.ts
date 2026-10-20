import { categoryIconKey, type CategoryIconKey } from './categoryIcons'

/** The new-budget picker, in order. Keys from the category icon catalog. */
export const BUDGET_ICONS: CategoryIconKey[] = ['House', 'Airplane', 'UsersThree', 'Briefcase', 'GraduationCap', 'PawPrint', 'Car', 'Confetti', 'Heart', 'Island', 'Wrench', 'PiggyBank']

/** A budget's icon: the one it has, else its emoji's (budgets from before icons, and older servers). */
export function budgetIconKey(b: { icon?: string | null; emoji?: string | null }): CategoryIconKey {
  return categoryIconKey(b.emoji ?? '', b.icon ?? undefined)
}
