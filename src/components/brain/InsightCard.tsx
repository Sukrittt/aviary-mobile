import { useCurrency } from '@/src/context/CurrencyContext'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import type { ThemeTokens } from '@/src/theme/tokens'
import { fontFamily } from '@/src/theme/fonts'
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/shared/CategoryIcon'
import { categoryIconKey, DEFAULT_CATEGORY_ICON, type CategoryIconKey } from '@/src/lib/categoryIcons'


type Tone = 'mint' | 'violet' | 'coral' | 'warn'

interface Props {
  icon: string
  title: string
  subtitle: string
  valueLabel: string
  amount: number
  tone: Tone
  hideAmounts: boolean
}

const TONE_KEYS: Record<Tone, { solid: keyof ThemeTokens; soft: keyof ThemeTokens }> = {
  mint: { solid: 'mint', soft: 'mintSoft' },
  violet: { solid: 'violet', soft: 'violetSoft' },
  coral: { solid: 'coral', soft: 'coralSoft' },
  warn: { solid: 'warn', soft: 'warnSoft' },
}

const DEFAULT_ICON: Record<Tone, CategoryIconKey> = {
  mint: 'Coins',
  violet: 'TrendUp',
  coral: 'ShoppingBag',
  warn: 'Lightning',
}

/** The model sends an emoji (or sometimes a word like "wallet"). Draw its Phosphor match, else the tone's icon. */
function iconKey(icon: string, tone: Tone): CategoryIconKey {
  const key = categoryIconKey(icon ?? '')
  return key === DEFAULT_CATEGORY_ICON ? DEFAULT_ICON[tone] : key
}

export function InsightCard({ icon, title, subtitle, valueLabel, amount, tone, hideAmounts }: Props) {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const { solid: solidKey, soft: softKey } = TONE_KEYS[tone]
  const soft = tokens[softKey]
  const solid = tokens[solidKey]
  const Glyph = CATEGORY_ICON_COMPONENTS[iconKey(icon, tone)]

  return (
    <View style={styles.row}>
      <View style={[styles.iconTile, { backgroundColor: soft }]}>
        <Glyph size={20} color={tone === 'warn' ? tokens.warnInk : solid} />
      </View>
      <View style={styles.main}>
        <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.valueWrap}>
        <Text style={[styles.value, { color: solid, fontFamily: fontFamily.bodyBold }]} numberOfLines={1}>
          {formatCurrency(amount, hideAmounts)}
        </Text>
        <Text style={[styles.valueLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>
          {valueLabel}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 2 },
  title: { fontSize: 14 },
  subtitle: { fontSize: 12 },
  valueWrap: { alignItems: 'flex-end', gap: 2, maxWidth: 110 },
  value: { fontSize: 14 },
  valueLabel: { fontSize: 12 },
})
