import { View, Text, StyleSheet } from 'react-native'
import { Check } from 'lucide-react-native'
import { PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases'
import { Icon } from '@/src/components/shared/Icon'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import type { BillingStatus } from '@/src/api/billing'
import { daysUntilLabel, formatDate, isWebPlan, planPeriod } from '@/src/lib/billingStatus'
import { BENEFITS } from './PlanPicker'

/**
 * What a paying user has: plan, price, where it's at, and when it next
 * charges. Price comes from the store's own package for the same period,
 * so it's the localized amount Play actually bills. A plan bought on the
 * website was charged by Razorpay, not Play, so it shows no Play price.
 */
export function CurrentPlan({ status, packages }: { status: BillingStatus; packages: PurchasesPackage[] }) {
  const { tokens } = useTheme()
  const period = planPeriod(status)
  const web = isWebPlan(status)
  const pkg = web ? undefined : packages.find((p) => p.packageType === (period === 'yearly' ? PACKAGE_TYPE.ANNUAL : PACKAGE_TYPE.MONTHLY))
  const cancelled = !status.autoRenew || status.renewalState === 'cancelled'
  const grace = status.renewalState === 'grace'

  const rows: { label: string; value: string; tone?: string }[] = [
    { label: 'Plan', value: `${period === 'yearly' ? 'Yearly' : 'Monthly'}${pkg ? ` · ${pkg.product.priceString}` : ''}` },
    {
      label: 'Status',
      value: grace ? 'Payment issue' : cancelled ? 'Cancelled' : 'Active',
      tone: grace ? tokens.coral : cancelled ? tokens.text2 : tokens.mint,
    },
    {
      label: cancelled ? 'Access until' : 'Next renewal',
      value: `${formatDate(status.paidExpiresAt)} · ${daysUntilLabel(status.paidExpiresAt)}`,
    },
  ]

  return (
    <View style={[styles.card, { backgroundColor: tokens.cardSolid, borderColor: tokens.accentSoft }]}>
      <View style={{ gap: 4 }}>
        <Text style={[styles.eyebrow, { color: tokens.accentInk, fontFamily: fontFamily.bodyExtraBold }]}>AVIARY PRO</Text>
        <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          {cancelled ? 'Your plan is ending' : "You're on Aviary Pro"}
        </Text>
        <Text style={[styles.sub, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          {grace
            ? web
              ? "Your last renewal didn't go through. We're retrying it, and you keep everything meanwhile."
              : "Your last payment didn't go through. Update it in Google Play to keep your plan."
            : cancelled
              ? web
                ? "You've still got everything until then. Pick a plan again anytime."
                : "You've still got everything until then. Resubscribe anytime from Google Play."
              : 'Thanks for backing Aviary.'}
        </Text>
      </View>

      <View style={[styles.table, { borderColor: tokens.border }]}>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.tableRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }]}>
            <Text style={[styles.rowLabel, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{r.label}</Text>
            <Text style={[styles.rowValue, { color: r.tone ?? tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{r.value}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <Text style={[styles.section, { color: tokens.text3, fontFamily: fontFamily.bodyExtraBold }]}>WHAT YOU&apos;VE GOT</Text>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.benefit}>
            <View style={[styles.tick, { backgroundColor: tokens.mintSoft }]}>
              <Icon icon={Check} size={12} color={tokens.mint} strokeWidth={3} />
            </View>
            <Text style={[styles.benefitText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{b}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 18 },
  eyebrow: { fontSize: 11, letterSpacing: 1.2 },
  title: { fontSize: 22 },
  sub: { fontSize: 13, lineHeight: 19 },
  table: { borderWidth: 1, borderRadius: 16 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 13, flexShrink: 1, textAlign: 'right' },
  section: { fontSize: 11, letterSpacing: 1 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tick: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  benefitText: { flex: 1, fontSize: 13, lineHeight: 19 },
})
