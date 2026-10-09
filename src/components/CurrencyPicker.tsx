import { useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Check, ChevronRight, X } from 'lucide-react-native'
import { currencyInfo, searchCurrencies } from '@/src/lib/currencies'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useUpdateUser } from '@/src/hooks/useUser'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { BottomSheet } from '@/src/components/shared/Modal'

export function CurrencyPicker({
  value,
  onChange,
  disabled = false,
  fillAvailableSpace = false,
}: {
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  /** Lets an embedded picker consume its parent’s remaining vertical space. */
  fillAvailableSpace?: boolean
}) {
  const { tokens, scheme } = useTheme()
  const [search, setSearch] = useState('')
  const selected = currencyInfo(value)
  const matches = searchCurrencies(search)
  return <View style={[styles.picker, fillAvailableSpace && styles.pickerFill]}>
    <View
      accessible
      accessibilityLabel={`Selected currency, ${selected.name}, ${selected.code}`}
      style={[styles.selectedCard, { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }]}
    >
      <View style={styles.selectedCopy}>
        <Text style={[styles.selectedEyebrow, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}>SELECTED CURRENCY</Text>
        <Text style={[styles.selectedName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{selected.name}</Text>
      </View>
      {/* Plain text, not a pill: a bordered chip here read as a tappable button. */}
      <Text style={[styles.selectedCodeText, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}>
        {selected.code}{selected.symbol !== selected.code ? ` · ${selected.symbol}` : ''}
      </Text>
    </View>
    <TextInput
      accessibilityLabel="Search currencies"
      placeholder="Search currency, country or code"
      placeholderTextColor={tokens.text3}
      value={search}
      onChangeText={setSearch}
      autoCorrect={false}
      style={[
        styles.search,
        {
          backgroundColor: scheme === 'dark' ? tokens.cardSolid : tokens.inputBg,
          color: tokens.text,
          fontFamily: fontFamily.bodyMedium,
        },
      ]}
    />
    <ScrollView
      testID="currency-list"
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      style={[styles.currencyList, fillAvailableSpace && styles.currencyListFill]}
    >
      {matches.map(c => <Pressable key={c.code} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: value === c.code, disabled }} accessibilityLabel={`${c.name}, ${c.code}, ${c.symbol}`} onPress={() => onChange(c.code)} style={({ pressed }) => [styles.currencyOption, { backgroundColor: value === c.code ? tokens.accentSoft : 'transparent' }, pressed && styles.currencyOptionPressed]}>
        <View style={{ flex: 1 }}><Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold }}>{c.name}</Text><Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium }}>{c.code}{c.symbol !== c.code ? ` · ${c.symbol}` : ''}</Text></View>
        {value === c.code && <View testID="selected-currency-icon" accessible={false}><Check size={20} color={tokens.accentInk} strokeWidth={2.5} /></View>}
      </Pressable>)}
      {!matches.length && <Text style={[styles.emptyState, { color: tokens.text3 }]}>No currencies found.</Text>}
    </ScrollView>
  </View>
}

export function CurrencySetting() {
  const { tokens } = useTheme()
  const { currencyCode } = useCurrency()
  const update = useUpdateUser()
  const [open, setOpen] = useState(false)
  const current = currencyInfo(currencyCode)
  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Currency, ${current.name}`}
      accessibilityHint="Opens currency picker"
      onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.settingRow, pressed && styles.settingRowPressed]}
    >
      <Text style={[styles.settingLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Currency</Text>
      <View style={[styles.valueChip, { backgroundColor: tokens.chipActiveBg, borderColor: tokens.borderStrong }]}>
        <Text style={[styles.valueText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
          {current.code}{current.symbol !== current.code ? ` · ${current.symbol}` : ''}
        </Text>
        <ChevronRight size={14} color={tokens.text3} strokeWidth={2.25} />
      </View>
    </Pressable>
    <BottomSheet visible={open} onClose={() => setOpen(false)}>
      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Currency</Text>
        <Pressable
          testID="currency-sheet-close"
          accessibilityRole="button"
          accessibilityLabel="Close currency picker"
          hitSlop={8}
          onPress={() => setOpen(false)}
          style={({ pressed }) => [styles.closeButton, { backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong }, pressed && styles.closeButtonPressed]}
        >
          <X size={20} color={tokens.text2} strokeWidth={2.25} />
        </Pressable>
      </View>
      <Text style={[styles.sheetDescription, { color: tokens.text2 }]}>Changing currency updates how amounts are displayed. Amounts aren’t converted.</Text>
      <CurrencyPicker
        value={currencyCode}
        disabled={update.isPending}
        onChange={(code) => {
          setOpen(false)
          update.mutate({ currencyCode: code })
        }}
      />
    </BottomSheet>
  </>
}

const styles = StyleSheet.create({
  picker: { flexShrink: 1, width: '100%' },
  pickerFill: { flex: 1, minHeight: 0 },
  selectedCard: {
    minHeight: 72,
    marginBottom: 14,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectedCopy: { flex: 1, gap: 3 },
  selectedEyebrow: { fontSize: 10, letterSpacing: 0.7 },
  selectedName: { fontSize: 15 },
  selectedCodeText: { fontSize: 14, flexShrink: 0 },
  search: {
    marginBottom: 12,
    borderRadius: 100,
    paddingHorizontal: 18,
    paddingVertical: 13,
    fontSize: 14,
  },
  currencyList: { maxHeight: 320 },
  currencyListFill: { flex: 1, maxHeight: undefined },
  currencyOption: {
    minHeight: 56,
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyOptionPressed: { opacity: 0.72 },
  emptyState: { paddingHorizontal: 12, paddingVertical: 28, textAlign: 'center' },
  sheetHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  sheetTitle: { flex: 1, fontSize: 24 },
  sheetDescription: { marginTop: 8, marginBottom: 16, lineHeight: 20 },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonPressed: { opacity: 0.65 },
  settingRow: {
    minHeight: 56,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingRowPressed: { opacity: 0.72 },
  settingLabel: { flex: 1, fontSize: 14 },
  valueChip: {
    minHeight: 32,
    paddingLeft: 11,
    paddingRight: 8,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  valueText: { fontSize: 12 },
})
