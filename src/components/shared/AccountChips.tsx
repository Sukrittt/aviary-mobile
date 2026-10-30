import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import type { AccountRow } from '@/src/types'
import { splitEmoji } from '@/src/lib/emoji'
import { categoryIconKey, type CategoryIconKey } from '@/src/lib/categoryIcons'
import { CATEGORY_ICON_COMPONENTS } from './CategoryIcon'

export const ACCOUNT_TYPE_ICON: Record<string, CategoryIconKey> = { bank: 'Bank', cash: 'Money', credit_card: 'CreditCard' }

/** A legacy leading emoji in the name picks the account's icon, like categories; else its type's. Twin of Web's. */
export function accountIconKey(a: { name: string; type: string }): CategoryIconKey {
  return splitEmoji(a.name).icon ? categoryIconKey(a.name) : ACCOUNT_TYPE_ICON[a.type] ?? 'Bank'
}

export function AccountIcon({ account, size = 16, color }: { account: { name: string; type: string }; size?: number; color?: string }) {
  const Glyph = CATEGORY_ICON_COMPONENTS[accountIconKey(account)]
  return <Glyph size={size} color={color} />
}

/** The name without its leading emoji, for next to `AccountIcon`. */
export function accountLabel(a: { name: string }): string {
  return splitEmoji(a.name).text
}

/**
 * One chip per live account. Replaces the Bank / Credit card toggle once a
 * user has made accounts; with none, callers keep showing that toggle, so a
 * user who never opens Accounts sees nothing new. `allowNone` adds a leading
 * "No account" chip where the account is optional (income). Twin of Web's
 * src/components/AccountChips.tsx.
 */
export function AccountChips({
  accounts,
  value,
  onChange,
  allowNone = false,
  label = 'Paid from',
  showLabel = true,
}: {
  accounts: AccountRow[]
  value: string
  onChange: (id: string) => void
  allowNone?: boolean
  label?: string
  showLabel?: boolean
}) {
  const { tokens } = useTheme()
  const options: { id: string; label: string; account?: AccountRow }[] = [
    ...(allowNone ? [{ id: '', label: 'No account' }] : []),
    ...accounts.map((a) => ({ id: a.id, label: accountLabel(a), account: a })),
  ]
  return (
    <View style={styles.wrap}>
      {showLabel && <Text style={[styles.label, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>}
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const selected = value === o.id
          return (
            <Pressable
              key={o.id || 'none'}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={o.label}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                onChange(o.id)
              }}
              style={[styles.chip, { backgroundColor: selected ? tokens.accent : tokens.pillBg, borderColor: selected ? tokens.accent : tokens.border }]}
            >
              {o.account && <AccountIcon account={o.account} size={14} color={selected ? tokens.onAccent : tokens.text2} />}
              <Text style={[styles.chipText, { color: selected ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{o.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** The account's name for a row, without any legacy emoji, or '' for none or one that's gone. */
export function accountName(accounts: AccountRow[] | undefined, id: string | undefined): string {
  const account = id ? accounts?.find((a) => a.id === id) : undefined
  return account ? accountLabel(account) : ''
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13 },
})
