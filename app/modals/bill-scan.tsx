import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'
import { Eye, X } from '@/src/components/shared/icons'
import { Modal, View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { formatDate } from '@/src/lib/format'
import { splitEmoji } from '@/src/lib/emoji'
import { useCategoryIcons, useCategoryTint } from '@/src/hooks/useCategories'
import { CATEGORY_ICON_COMPONENTS, CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { useBillScan } from '@/src/hooks/useBillScans'
import { LoadingPhrase } from '@/src/components/shared/LoadingPhrase'
import { PopIn } from '@/src/components/shared/PopIn'
import { groupByDivisor, isFeeLine, feeDiff, round2 } from '@/src/lib/split'
import type { BillScanItem } from '@/src/api/bills'

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

const LOADING_PHRASES = ['Pulling up this scan…', 'Almost there…']

const MOUNT_DELAY = 100
const ITEM_STAGGER = 45
const STAGGER_CAP = 6

export default function BillScanModal() {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const tintOf = useCategoryTint()
  const { hideAmounts } = usePrivacy()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const id = str(useLocalSearchParams().id)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewAspectRatio, setPreviewAspectRatio] = useState(1)
  const scanQ = useBillScan(id)
  const scan = scanQ.data
  const category = splitEmoji(scan?.category ?? '')
  const categoryIcons = useCategoryIcons()
  const tint = tintOf(scan?.category ?? '')
  const shareGroups = groupByDivisor((scan?.items ?? []).filter(item => !isFeeLine(item.name)))
  const fees = scan ? round2(scan.items.filter(item => isFeeLine(item.name)).reduce((sum, item) => sum + item.price, 0) + feeDiff(scan.total, scan.items)) : 0
  const feesShare = scan ? round2(fees / scan.people_count) : 0

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.headerAction, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Close</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]} numberOfLines={1}>
          {scan?.merchant || 'Scan detail'}
        </Text>
        <View style={{ width: 52 }} />
      </View>

      {scanQ.isLoading ? (
        <View style={styles.centered}>
          <LoadingPhrase phrases={LOADING_PHRASES} color={tokens.text2} style={{ fontFamily: fontFamily.bodyMedium, textAlign: 'center' }} />
        </View>
      ) : !scan ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            Couldn&apos;t find that scan.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <PopIn play delay={MOUNT_DELAY}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Preview bill"
              accessibilityState={{ disabled: scan.image_status !== 'ready' || !scan.image_url }}
              disabled={scan.image_status !== 'ready' || !scan.image_url}
              onPress={() => setPreviewOpen(true)}
              style={[styles.previewChip, { backgroundColor: tokens.accentSoft, borderColor: tokens.accentSoft }]}
            >
              <Eye size={16} color={tokens.accentInk} />
              <Text style={[styles.previewLabel, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>
                {scan.image_status === 'failed' ? "Photo couldn't be saved" : scan.image_status === 'ready' && scan.image_url ? 'Preview bill' : 'Photo still uploading…'}
              </Text>
            </Pressable>
          </PopIn>

          <PopIn play delay={MOUNT_DELAY + ITEM_STAGGER} style={[styles.card, styles.heroCard, { backgroundColor: tokens.heroA, borderColor: tokens.accentSoft }]}>
            <View style={styles.heroHeading}>
              <View style={[styles.categoryIcon, { backgroundColor: scan.category ? tint.bg : tokens.accentSoft }]}>
                {scan.category
                  ? <CategoryIcon name={scan.category} icon={categoryIcons.get(scan.category)} size={24} color={tint.ink} />
                  : <CATEGORY_ICON_COMPONENTS.Receipt size={24} color={tokens.accentInk} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.merchant, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{scan.merchant}</Text>
                <Text style={[styles.summaryMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                  {(category.text || scan.category)} · {formatDate(scan.date)}
                </Text>
              </View>
            </View>
            <View style={styles.shareHero}>
              <Text style={[styles.eyebrow, { color: tokens.accentInk, fontFamily: fontFamily.bodyBold }]}>YOUR SHARE</Text>
              <Text style={[styles.myShare, { color: tokens.accent, fontFamily: fontFamily.displayBold }]}>
                {formatCurrency(scan.my_share, hideAmounts)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: tokens.border }]} />
            <View style={[styles.summaryRow, styles.breakdownRow]}>
              <Text style={[styles.summaryLabel, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>Bill total</Text>
              <Text style={[styles.summaryValue, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
                {formatCurrency(scan.total, hideAmounts)}
              </Text>
            </View>
            {shareGroups.map(group => (
              <View key={group.divisor} style={[styles.summaryRow, styles.breakdownRow]}>
                <Text style={[styles.summaryLabel, { color: group.divisor === 1 ? tokens.mint : tokens.violet, fontFamily: fontFamily.bodySemiBold }]}>By {group.divisor} share</Text>
                <Text style={[styles.summaryValue, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
                  {formatCurrency(group.share, hideAmounts)}
                </Text>
              </View>
            ))}
            {Math.abs(fees) >= 0.01 && (
              <View style={[styles.summaryRow, styles.breakdownRow]}>
                <Text style={[styles.summaryLabel, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>Fees &amp; discounts share</Text>
                <Text style={[styles.summaryValue, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
                  {formatCurrency(feesShare, hideAmounts)}
                </Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.breakdownRow]}>
              <Text style={[styles.summaryLabel, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>Split between</Text>
              <Text style={[styles.summaryValue, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
                {scan.people_count} {scan.people_count === 1 ? 'person' : 'people'}
              </Text>
            </View>
          </PopIn>

          <PopIn play delay={MOUNT_DELAY + 2 * ITEM_STAGGER}>
            <Text style={[styles.sectionLabel, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Inside the bill · {scan.items.length}</Text>
          </PopIn>
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            {scan.items.map((item, i) => (
              <PopIn
                key={`${item.name}-${i}`}
                play
                delay={MOUNT_DELAY + 2 * ITEM_STAGGER + Math.min(i, STAGGER_CAP) * ITEM_STAGGER}
              >
                {i > 0 && <View style={[styles.divider, { backgroundColor: tokens.border }]} />}
                <ItemRow item={item} />
              </PopIn>
            ))}
          </View>
        </ScrollView>
      )}
      {previewOpen && scan?.image_url && (
        <Modal visible presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
          <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.previewHeader}>
              <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Preview bill</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close bill preview" onPress={() => setPreviewOpen(false)} hitSlop={12} style={styles.previewClose}>
                <X size={22} color={tokens.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.container} contentContainerStyle={styles.previewContent}>
              <Image
                accessibilityLabel="Scanned bill image"
                source={{ uri: scan.image_url }}
                style={[styles.previewImage, { aspectRatio: previewAspectRatio }]}
                resizeMode="contain"
                onLoad={({ nativeEvent }) => {
                  const { width, height } = nativeEvent.source
                  if (width > 0 && height > 0) setPreviewAspectRatio(width / height)
                }}
              />
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  )
}

function ItemRow({ item }: { item: BillScanItem }) {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme()
  const { hideAmounts } = usePrivacy()
  const shareColor = item.divisor === null ? tokens.text2 : item.divisor > 1 ? tokens.violet : tokens.mint
  const shareBg = item.divisor === null ? tokens.pillBg : item.divisor > 1 ? tokens.violetSoft : tokens.mintSoft
  const shareLabel = item.divisor === null ? 'Not yours' : item.divisor > 1 ? `Split ÷${item.divisor}` : 'Yours'

  return (
    <View style={styles.summaryRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemName, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.itemMeta, { color: shareColor, backgroundColor: shareBg, fontFamily: fontFamily.bodySemiBold }]}>
          {item.qty > 1 ? `× ${item.qty} · ` : ''}{shareLabel}
        </Text>
      </View>
      <Text style={[styles.summaryValue, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
        {formatCurrency(item.price, hideAmounts)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAction: { fontSize: 14, width: 52 },
  headerTitle: { flex: 1, fontSize: 17, textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  body: { padding: 16, gap: 16 },
  previewChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 24, paddingHorizontal: 14, minHeight: 44 },
  previewLabel: { fontSize: 13 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  previewClose: { padding: 10 },
  previewContent: { alignItems: 'stretch' },
  previewImage: { width: '100%' },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, gap: 12 },
  heroCard: { paddingTop: 16 },
  heroHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  shareHero: { paddingTop: 22, paddingBottom: 18, gap: 4 },
  eyebrow: { fontSize: 12, letterSpacing: 1.2 },
  breakdownRow: { paddingVertical: 6 },
  merchant: { fontSize: 21 },
  summaryMeta: { fontSize: 12, marginTop: 2 },
  myShare: { fontSize: 40, fontVariant: ['tabular-nums'] },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth },
  sectionLabel: { fontSize: 18, marginTop: 6, marginBottom: -4 },
  itemName: { fontSize: 14, lineHeight: 21 },
  itemMeta: { fontSize: 12, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, overflow: 'hidden' },
})
