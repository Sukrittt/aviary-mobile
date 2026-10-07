import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import type { AccountRow } from '@/src/types'

export const ACCOUNT_TYPE_EMOJI: Record<string, string> = { bank: '🏦', cash: '💵', credit_card: '💳' }

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
  const options = [...(allowNone ? [{ id: '', label: 'No account' }] : []), ...accounts.map((a) => ({ id: a.id, label: `${ACCOUNT_TYPE_EMOJI[a.type] ?? '🏦'} ${a.name}` }))]
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
              <Text style={[styles.chipText, { color: selected ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{o.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** The account's name for a row, or '' for none or one that's gone. */
export function accountName(accounts: AccountRow[] | undefined, id: string | undefined): string {
  if (!id) return ''
  return accounts?.find((a) => a.id === id)?.name ?? ''
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13 },
})
