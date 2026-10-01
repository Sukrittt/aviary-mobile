import { useCurrency } from '@/src/context/CurrencyContext'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChevronRight, Plus, Repeat2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
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
import { toLocalDateString } from "@/src/lib/date";
import { useRecurringExpenses } from "@/src/hooks/useRecurringExpenses";
import { useRefresh } from "@/src/hooks/useRefresh";
import { AmountText } from "@/src/components/ui/AmountText";
import { PopIn } from "@/src/components/shared/PopIn";
import { usePressSpring } from "@/src/components/ui/Button";
import {
  AllocationBar,
  type AllocationSegment,
} from "@/src/components/charts/AllocationBar";
import { CHART_COLOR_CYCLE } from "@/src/theme/chartColors";
import type { RecurringExpenseRow } from "@/src/types";
import { EmptyState } from "@/src/components/shared/EmptyState";
import { FORCE_EMPTY_STATE_PREVIEW, emptyForPreview } from "@/src/lib/emptyStatePreview";

const LOADING_PHRASES = [
  "Checking what repeats…",
  "Reading the calendar…",
  "Rounding up your regulars…",
  "Counting the usual suspects…",
  "Lining up the due dates…",
  "Working out what's next…",
  "Almost there…",
];

const CADENCE_LABELS: Record<string, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

function cadenceLabel(frequency: string): string {
  return CADENCE_LABELS[frequency] ?? frequency;
}

// ponytail: fourth copy of this stagger quartet (investments.tsx,
// modals/money-brain.tsx, features/scan-bill/presentation.ts are the other
// three) — belongs next to motion in src/theme/scale.ts once a fifth shows up.
const MOUNT_DELAY = 100;
const ITEM_STAGGER = 45;
const STAGGER_CAP = 6;

/** Rough monthly cost, only for the hero total and allocation bar. */
function monthlyEquivalent(row: RecurringExpenseRow): number {
  const amount = Number(row.amount_inr) || 0;
  switch (row.frequency) {
    case "daily":
      return amount * 30;
    case "weekly":
      return (amount * 52) / 12;
    case "yearly":
      return amount / 12;
    default:
      return amount;
  }
}

/** Forward twin of EnvelopeRow.tsx's lastSpentLabel — no Intl, same local date-string compare. */
function dueLabel(nextRunDate: string): string {
  if (!nextRunDate) return "Not scheduled";
  const today = new Date();
  if (nextRunDate === toLocalDateString(today)) return "Due today";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (nextRunDate === toLocalDateString(tomorrow)) return "Due tomorrow";
  return `Next on ${formatDateShort(nextRunDate)}`;
}

/**
 * `next_run_date` is rendered exactly as the server sent it. Deliberately no
 * local due-date math: SubscriptionsPanel's fork of that logic compares against
 * a live instant instead of UTC midnight, so anything due today reads there as
 * next cycle. One schedule owner, and it's the server.
 */
export default function RecurringExpensesScreen() {

  const { tokens } = useTheme();
  const { hideAmounts } = usePrivacy();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshing, onRefresh } = useRefresh();
  const recurringQ = useRecurringExpenses();

  const rows = emptyForPreview(recurringQ.data ?? []);
  const loading = !FORCE_EMPTY_STATE_PREVIEW && recurringQ.isLoading;
  const active = rows.filter((r) => r.status === "active");
  const inactive = rows.filter((r) => r.status !== "active");

  const monthlyTotal = active.reduce((sum, r) => sum + monthlyEquivalent(r), 0);

  // Grouped/sorted exactly like investments.tsx's segments: sum active rows'
  // monthly-equivalent per category, descending, colour by position in the cycle.
  const segments: AllocationSegment[] = (() => {
    const byCategory = new Map<string, number>();
    for (const r of active) {
      const cat = splitEmoji(r.category).text || r.category;
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + monthlyEquivalent(r));
    }
    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, value], i) => ({
        label: cat,
        value,
        color: tokens[CHART_COLOR_CYCLE[i % CHART_COLOR_CYCLE.length]],
      }));
  })();

  const categoryColor = new Map(segments.map((s) => [s.label, s.color]));

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
            Recurring
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: tokens.text2, fontFamily: fontFamily.bodySemiBold },
            ]}
          >
            {active.length === 0
              ? "Nothing repeating yet"
              : `${active.length} active`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/modals/recurring-expense")}
          style={[
            styles.addButton,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Icon icon={Plus} size={16} color={tokens.text} />
          <Text
            style={[
              styles.addText,
              { color: tokens.text, fontFamily: fontFamily.bodySemiBold },
            ]}
          >
            Add
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={
          loading || rows.length === 0
            ? styles.centered
            : styles.body
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
        {loading ? (
          <LoadingPhrase
            phrases={LOADING_PHRASES}
            color={tokens.text2}
            style={[
              styles.loadingPhrase,
              { fontFamily: fontFamily.bodyMedium },
            ]}
          />
        ) : rows.length === 0 ? (
          <>
            <EmptyState
              subject="recurring"
              title="Set it once, forget it"
              description="Rent, the gym, your maid. Add it here and we'll log it for you on every due date."
              action={{ label: "Add a recurring expense", onPress: () => router.push("/modals/recurring-expense") }}
              style={{ paddingVertical: 0 }}
            />
            <FindRecurringEntry style={{ marginTop: 16, width: "100%" }} />
          </>
        ) : (
          <>
            <View style={styles.heroBlock}>
              <Text
                style={[
                  styles.heroLabel,
                  { color: tokens.text2, fontFamily: fontFamily.bodySemiBold },
                ]}
              >
                Committed each month
              </Text>
              <AmountText
                value={monthlyTotal}
                size={34}
                weight="displayBold"
                animate
              />
            </View>

            {segments.length > 0 && (
              <View
                style={[
                  styles.allocationCard,
                  { backgroundColor: tokens.card, borderColor: tokens.border },
                ]}
              >
                <AllocationBar segments={segments} />
              </View>
            )}

            <FindRecurringEntry />

            {active.length > 0 ? (
              <Section title="Active">
                {active.map((row, i) => (
                  <RecurringRow key={row.id} row={row} index={i} />
                ))}
              </Section>
            ) : null}

            {inactive.length > 0 ? (
              <Section title="Paused and finished">
                {inactive.map((row, i) => (
                  <RecurringRow
                    key={row.id}
                    row={row}
                    index={active.length + i}
                  />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );

  function Section({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <View style={styles.section}>
        <Text
          style={[
            styles.sectionLabel,
            { color: tokens.text3, fontFamily: fontFamily.bodyBold },
          ]}
        >
          {title.toUpperCase()}
        </Text>
        <View style={{ gap: 10 }}>{children}</View>
      </View>
    );
  }

  function RecurringRow({
    row,
    index,
  }: {
    row: RecurringExpenseRow;
    index: number;
  }) {
  const { formatCurrency } = useCurrency()

    const isActive = row.status === "active";
    const category = splitEmoji(row.category);
    const dotColor =
      categoryColor.get(category.text || row.category) ?? tokens.text3;
    const press = usePressSpring(0.98);

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
            onPress={() =>
              router.push(
                `/modals/recurring-expense?id=${encodeURIComponent(row.id)}`,
              )
            }
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            style={styles.rowInner}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: dotColor, opacity: isActive ? 1 : 0.5 },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.rowTitle,
                  { color: tokens.text, fontFamily: fontFamily.bodySemiBold },
                ]}
                numberOfLines={1}
              >
                {row.item}
              </Text>
              <View style={styles.rowMetaRow}>
                <View style={[styles.pill, { backgroundColor: tokens.pillBg }]}>
                  <Text
                    style={[
                      styles.pillText,
                      {
                        color: tokens.text2,
                        fontFamily: fontFamily.bodySemiBold,
                        marginLeft: -5,
                      },
                    ]}
                  >
                    {cadenceLabel(row.frequency)}
                  </Text>
                </View>
                {category.text ? (
                  <Text
                    style={[
                      styles.rowMeta,
                      {
                        color: tokens.text2,
                        fontFamily: fontFamily.bodyMedium,
                        marginLeft: -8,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    · {category.text}
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.rowMeta,
                  {
                    color:
                      isActive && row.next_run_date
                        ? tokens.accentInk
                        : tokens.text3,
                    fontFamily: fontFamily.bodyMedium,
                  },
                ]}
              >
                {row.status === "ended"
                  ? "Finished"
                  : !isActive
                    ? "Paused"
                    : dueLabel(row.next_run_date)}
              </Text>
            </View>
            <Text
              style={[
                styles.rowAmount,
                {
                  color: tokens.text,
                  fontFamily: fontFamily.bodyBold,
                  opacity: isActive ? 1 : 0.5,
                },
              ]}
            >
              {formatCurrency(Number(row.amount_inr) || 0, hideAmounts)}
            </Text>
          </Pressable>
        </Reanimated.View>
      </PopIn>
    );
  }
}

/** Small discovery affordance into account/recurring-suggestions.tsx, the "Find recurring expenses" scan. */
function FindRecurringEntry({ style }: { style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  const router = useRouter();
  const press = usePressSpring(0.98);

  return (
    <Reanimated.View style={[press.style, style]}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          router.push("/account/recurring-suggestions");
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.discoveryRow,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <View
          style={[styles.discoveryIcon, { backgroundColor: tokens.accentSoft }]}
        >
          <Icon icon={Repeat2} size={16} color={tokens.accent} />
        </View>
        <Text
          style={[
            styles.discoveryText,
            { color: tokens.text, fontFamily: fontFamily.bodySemiBold },
          ]}
        >
          Find recurring expenses
        </Text>
        <Icon icon={ChevronRight} size={16} color={tokens.text3} />
      </Pressable>
    </Reanimated.View>
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
  },
  addText: { fontSize: 12.5 },
  body: { padding: 16, gap: 16 },
  heroBlock: { gap: 4 },
  heroLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  allocationCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  discoveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  discoveryIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  discoveryText: { flex: 1, fontSize: 14 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.6 },
  rowCard: { borderWidth: 1, borderRadius: 14 },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { fontSize: 15 },
  rowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  pill: {
    height: 16,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pillText: { fontSize: 11, lineHeight: 13 },
  rowMeta: { fontSize: 12, flexShrink: 1 },
  rowAmount: { fontSize: 15 },
  // Fills the space under the header so the loading phrase and the empty state
  // both sit in the middle of the screen rather than tucked under the header.
  centered: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    marginTop: -72,
  },
  // The phrase spans the full width, so it centers with textAlign rather than
  // by the container's alignItems.
  loadingPhrase: { fontSize: 13, lineHeight: 19, textAlign: "center" },
});
