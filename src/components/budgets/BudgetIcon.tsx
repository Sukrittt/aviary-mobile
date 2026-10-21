import { View } from 'react-native'
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/shared/CategoryIcon'
import { budgetIconKey } from '@/src/lib/budgetIcons'

/** A budget's icon, from the category catalog. */
export function BudgetIcon({ budget, size = 18, color }: { budget: { icon?: string | null; emoji?: string | null }; size?: number; color?: string }) {
  const key = budgetIconKey(budget)
  const Icon = CATEGORY_ICON_COMPONENTS[key]
  return (
    <View testID={`budget-icon-${key}`}>
      <Icon size={size} color={color} />
    </View>
  )
}
