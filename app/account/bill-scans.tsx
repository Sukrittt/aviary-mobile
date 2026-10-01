import { useCurrency } from '@/src/context/CurrencyContext'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChevronRight } from "lucide-react-native";
import Reanimated from "react-native-reanimated";
import { OfflineScreen } from "@/src/components/shared/OfflineScreen";
import { useOnline } from "@/src/lib/netStatus";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { Icon } from "@/src/components/shared/Icon";
import { LoadingPhrase } from "@/src/components/shared/LoadingPhrase";
import { usePrivacy } from "@/src/context/PrivacyContext";
import { formatDateShort } from "@/src/lib/format"
import { splitEmoji } from "@/src/lib/emoji";
import { useBillScans } from "@/src/hooks/useBillScans";
import { useRefresh } from "@/src/hooks/useRefresh";
import { PopIn } from "@/src/components/shared/PopIn";
import { usePressSpring } from "@/src/components/ui/Button";
import { AmountText } from "@/src/components/ui/AmountText";
import { CHART_COLOR_CYCLE } from "@/src/theme/chartColors";
import type { BillScanSummary } from "@/src/api/bills";
import { EmptyState } from "@/src/components/shared/EmptyState";

const LOADING_PHRASES = [
  "Pulling up your scans…",
  "Sorting by date…",
  "Unfolding the receipts…",
  "Gathering your grocery runs…",
  "Finding the dinner receipts…",
  "Putting your shares in order…",
  "Rounding up the line items…",
  "Bringing the bills together…",
  "Every receipt has a story…",
  "Almost there…",
];

// ponytail: fifth copy of this stagger pair (recurring.tsx, investments.tsx,
// modals/money-brain.tsx, features/scan-bill/presentation.ts) — worth a shared
// spot in src/theme/scale.ts if a sixth shows up.
const MOUNT_DELAY = 100;
const ITEM_STAGGER = 45;
const STAGGER_CAP = 6;

export default function BillScansScreen() {
  const { tokens } = useTheme();
  const { hideAmounts } = usePrivacy();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshing, onRefresh } = useRefresh();
  const scansQ = useBillScans();

  const rows = scansQ.data ?? [];
  const shareTotal = rows.reduce((sum, row) => sum + row.my_share, 0);
  const itemCount = rows.reduce((sum, row) => sum + row.item_count, 0);
  const byCategory = new Map<string, number>();
  for (const row of rows) {
    const category = splitEmoji(row.category).text || row.category;
    byCategory.set(category, (byCategory.get(category) ?? 0) + row.my_share);
  }
  const categoryColor = new Map(
    [...byCategory.keys()]
      .sort()
      .map((label, index) => [
        label,
        tokens[CHART_COLOR_CYCLE[index % CHART_COLOR_CYCLE.length]],
      ]),
  );

  if (!online) return <OfflineScreen />;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tokens.bg, paddingTop: insets.top },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[
            styles.backButton,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.headerTitle,
              { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
            ]}
          >
            Bills Scanned
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: tokens.text2, fontFamily: fontFamily.bodySemiBold },
            ]}
          >
            {scansQ.isLoading
              ? "Fetching your bills"
              : rows.length === 0
              ? "Nothing scanned yet"
              : `${rows.length} scanned`}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={
          scansQ.isLoading || rows.length === 0 ? styles.centered : styles.body
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
          />
        }
      >
        {scansQ.isLoading ? (
          <LoadingPhrase
            phrases={LOADING_PHRASES}
            color={tokens.text2}
            style={[
              styles.loadingPhrase,
              { fontFamily: fontFamily.bodyMedium },
            ]}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            subject="scans"
            title="No scans yet"
            description="Scan a bill and it'll show up here, photo and all."
            action={{ label: "Scan a bill", onPress: () => router.push("/modals/bill-scan") }}
            style={{ paddingVertical: 0 }}
          />
        ) : (
          <>
            <View style={styles.heroBlock}>
              <Text style={[styles.heroLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
                Your share logged
              </Text>
              <AmountText value={shareTotal} size={34} weight="displayBold" animate />
              <Text style={[styles.summaryMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                {rows.length === 50 ? "Latest 50 bills" : `${rows.length} ${rows.length === 1 ? "bill" : "bills"}`} · {itemCount} {itemCount === 1 ? "item" : "items"}
              </Text>
            </View>
            <View style={{ gap: 10 }}>
            {rows.map((row, i) => (
              <BillScanRow
                key={row.id}
                row={row}
                index={i}
                hideAmounts={hideAmounts}
                dotColor={
                  categoryColor.get(splitEmoji(row.category).text || row.category) ??
                  tokens.text3
                }
                onPress={() => router.push(`/modals/bill-scan?id=${row.id}`)}
              />
            ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function BillScanRow({
  row,
  index,
  hideAmounts,
  dotColor,
  onPress,
}: {
  row: BillScanSummary;
  index: number;
  hideAmounts: boolean;
  dotColor: string;
  onPress: () => void;
}) {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme();
  const press = usePressSpring(0.98);
  const category = splitEmoji(row.category);

  return (
    <PopIn
      play
      delay={MOUNT_DELAY + Math.min(index, STAGGER_CAP) * ITEM_STAGGER}
      style={[
        styles.rowCard,
        { backgroundColor: tokens.card, borderColor: tokens.border },
      ]}
    >
      <Reanimated.View style={press.style}>
        <Pressable
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={styles.rowInner}
        >
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.rowTitle,
                { color: tokens.text, fontFamily: fontFamily.bodySemiBold },
              ]}
              numberOfLines={1}
            >
              {row.merchant}
            </Text>
            <Text
              style={[
                styles.rowMeta,
                { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
              ]}
              numberOfLines={1}
            >
              {category.text || row.category} · {formatDateShort(row.date)} ·{" "}
              {row.item_count} {row.item_count === 1 ? "item" : "items"}
            </Text>
          </View>
          <Text
            style={[
              styles.rowAmount,
              { color: tokens.text, fontFamily: fontFamily.bodyBold },
            ]}
          >
            {formatCurrency(row.my_share, hideAmounts)}
          </Text>
          <ChevronRight size={16} color={tokens.text3} strokeWidth={2} />
        </Pressable>
      </Reanimated.View>
    </PopIn>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 19 },
  headerSub: { fontSize: 11.5, marginTop: 1 },
  scroll: { flex: 1 },
  body: { padding: 16, gap: 16 },
  heroBlock: { gap: 4 },
  heroLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  summaryMeta: { fontSize: 12 },
  rowCard: { borderWidth: 1, borderRadius: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowTitle: { fontSize: 15 },
  rowMeta: { fontSize: 12, marginTop: 2 },
  rowAmount: { fontSize: 15 },
  centered: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  loadingPhrase: { fontSize: 13, lineHeight: 19, textAlign: "center" },
});
