import { useCurrency } from "@/src/context/CurrencyContext";
import { useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react-native";
import Reanimated from "react-native-reanimated";
import { OfflineScreen } from "@/src/components/shared/OfflineScreen";
import { useOnline } from "@/src/lib/netStatus";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { Icon } from "@/src/components/shared/Icon";
import { LoadingPhrase } from "@/src/components/shared/LoadingPhrase";
import { PopIn } from "@/src/components/shared/PopIn";
import { EmptyState } from "@/src/components/shared/EmptyState";
import { BottomSheet } from "@/src/components/shared/Modal";
import { AmountText } from "@/src/components/ui/AmountText";
import { usePressSpring } from "@/src/components/ui/Button";
import { Alert } from "@/src/components/ui/AlertHost";
import { accountName } from "@/src/components/shared/AccountChips";
import { usePrivacy } from "@/src/context/PrivacyContext";
import { useDeleteIncome, useIncomes, useRecurringIncomes } from "@/src/hooks/useIncomes";
import { useAccounts } from "@/src/hooks/useAccounts";
import { useRefresh } from "@/src/hooks/useRefresh";
import { formatDateShort } from "@/src/lib/format";
import { toLocalDateString } from "@/src/lib/date";
import { currentMonthKey, monthLabel } from "@/src/lib/envelope";
import type { AccountRow, IncomeRow, RecurringIncomeRow } from "@/src/types";

const LOADING_PHRASES = ["Counting what comes in…", "Checking paydays…", "Almost there…"];
const CADENCE_LABELS: Record<string, string> = { daily: "Every day", weekly: "Every week", monthly: "Every month", yearly: "Every year" };
const CADENCE_ORDER = ["monthly", "weekly", "daily", "yearly"] as const;
const CADENCE_PER: Record<string, string> = { daily: "a day", weekly: "a week", monthly: "a month", yearly: "a year" };
const SOURCE_LABELS: Record<string, string> = { manual: "Added by you", recurring: "Payday", balance_gap: "From your balance check" };
const MOUNT_DELAY = 100;
const ITEM_STAGGER = 45;
const STAGGER_CAP = 6;

/** `amount` every `frequency`, as a rough monthly figure. Same as account/recurring.tsx. */
function monthlyAmount(amount: number, frequency: string): number {
  switch (frequency) {
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

/** Active schedules summed per cadence, in a fixed order, skipping cadences nobody uses. Same as Web's IncomePage. */
export function cadenceTotals(rows: RecurringIncomeRow[]): { frequency: string; total: number; count: number }[] {
  return CADENCE_ORDER.map((frequency) => {
    const list = rows.filter((r) => r.frequency === frequency);
    return { frequency, total: list.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), count: list.length };
  }).filter((c) => c.count > 0);
}

/** The server's next payday, worded like recurring expenses' due line. No local schedule math. */
function payLabel(row: RecurringIncomeRow): string {
  if (row.status === "ended") return "Finished";
  if (row.status !== "active") return "Paused";
  if (!row.next_run_date) return "Not scheduled";
  const today = new Date();
  if (row.next_run_date === toLocalDateString(today)) return "Payday today";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (row.next_run_date === toLocalDateString(tomorrow)) return "Payday tomorrow";
  return `Next pay on ${formatDateShort(row.next_run_date)}`;
}

/**
 * What comes in: recurring income (a salary, a weekly gig) on top, every
 * payment recorded this month below. Ready to Assign math is the server's
 * (Web/lib/income.ts). Twin of Web's src/views/IncomePage.tsx.
 */
export default function IncomeScreen() {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();
  const { hideAmounts } = usePrivacy();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshing, onRefresh } = useRefresh();
  const recurringQ = useRecurringIncomes();
  const incomesQ = useIncomes();
  const accounts = useAccounts().data;
  const removeIncome = useDeleteIncome();
  const [deleting, setDeleting] = useState<IncomeRow | null>(null);

  const month = currentMonthKey();
  const schedules = recurringQ.data ?? [];
  const active = schedules.filter((r) => r.status === "active");
  const inactive = schedules.filter((r) => r.status !== "active");
  const thisMonth = (incomesQ.data ?? []).filter((r) => r.date.startsWith(month));
  const monthlyTotal = active.reduce((sum, r) => sum + monthlyAmount(Number(r.amount) || 0, r.frequency), 0);
  const receivedTotal = thisMonth.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const cadences = cadenceTotals(active);
  const single = cadences.length === 1 ? cadences[0] : null;
  const landedPct = monthlyTotal > 0 ? Math.min(100, Math.round((receivedTotal / monthlyTotal) * 100)) : 0;
  const loading = recurringQ.isLoading || incomesQ.isLoading;
  const loadError = recurringQ.isError || incomesQ.isError;
  const empty = schedules.length === 0 && thisMonth.length === 0;

  if (!online) return <OfflineScreen />;

  function confirmDelete() {
    if (!deleting) return;
    removeIncome.mutate(
      { id: deleting.id, version: deleting.version },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setDeleting(null);
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          setDeleting(null);
          Alert.alert("Couldn't delete that", "Check your connection and try again.");
        },
      },
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back" style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { flex: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Income</Text>
        <View style={styles.headerButtons}>
          <Pressable onPress={() => router.push("/modals/add-income")} accessibilityRole="button" style={[styles.addButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <Icon icon={Plus} size={16} color={tokens.text} />
            <Text style={[styles.addText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>One-off</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/modals/recurring-income")} accessibilityRole="button" accessibilityLabel="Add recurring income" style={[styles.addButton, { backgroundColor: tokens.accent, borderColor: tokens.accent }]}>
            <Icon icon={Plus} size={16} color={tokens.onAccent} />
            <Text style={[styles.addText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>Recurring</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={loading || loadError || empty ? styles.centered : styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />}
      >
        {loading ? (
          <LoadingPhrase phrases={LOADING_PHRASES} color={tokens.text2} style={[styles.loadingPhrase, { fontFamily: fontFamily.bodyMedium }]} />
        ) : loadError ? (
          // Not the first-income prompt: there may well be income we couldn't read.
          <Text style={[styles.loadingPhrase, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
            Couldn&apos;t load your income. Pull down to try again.
          </Text>
        ) : empty ? (
          <EmptyState
            subject="recurring"
            title="What comes in?"
            description="Add your salary once and it counts toward Ready to Assign every month. Weekly gigs land on each payday."
            action={{ label: "Add your income", onPress: () => router.push("/modals/recurring-income") }}
            style={{ paddingVertical: 0 }}
          />
        ) : (
          <>
            <PopIn play delay={MOUNT_DELAY} style={[styles.hero, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              {active.length === 0 ? (
                <>
                  <Text style={[styles.heroLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Recorded in {monthLabel(month)}</Text>
                  <AmountText value={receivedTotal} size={40} weight="displayBold" color={tokens.mint} />
                </>
              ) : (
                <>
                  <Text style={[styles.heroLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Coming in</Text>
                  <View style={styles.heroAmountRow}>
                    <AmountText value={single ? single.total : monthlyTotal} size={40} weight="displayBold" color={tokens.mint} animate />
                    <Text style={[styles.heroPer, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>{single ? CADENCE_PER[single.frequency] : "a month"}</Text>
                  </View>
                  {single && single.frequency !== "monthly" && (
                    <Text style={[styles.rowMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>About {formatCurrency(monthlyTotal, hideAmounts)} a month</Text>
                  )}
                  {cadences.length > 1 && (
                    <View style={styles.tileRow} accessibilityLabel="Income by schedule">
                      {cadences.map((c) => {
                        const tone = toneFor(tokens, c.frequency);
                        return (
                          <View key={c.frequency} style={[styles.tile, { backgroundColor: tone.soft }]}>
                            <Text style={[styles.tileName, { color: tone.ink, fontFamily: fontFamily.bodyBold }]}>{CADENCE_LABELS[c.frequency]}</Text>
                            <Text style={[styles.tileAmount, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{formatCurrency(c.total, hideAmounts)}</Text>
                            <Text style={[styles.tileCount, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{c.count === 1 ? "1 source" : `${c.count} sources`}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <View
                    style={[styles.progress, { backgroundColor: tokens.borderStrong }]}
                    accessibilityRole="progressbar"
                    accessibilityLabel={`Recorded in ${monthLabel(month)}`}
                    accessibilityValue={{ min: 0, max: 100, now: landedPct }}
                  >
                    <View style={[styles.progressFill, { width: `${landedPct}%`, backgroundColor: tokens.mint }]} />
                  </View>
                  <Text style={[styles.rowMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                    {formatCurrency(receivedTotal, hideAmounts)} of {formatCurrency(monthlyTotal, hideAmounts)} recorded in {monthLabel(month)}
                  </Text>
                </>
              )}
            </PopIn>

            {active.length > 0 && (
              <Section title="Recurring">
                {active.map((row, i) => (
                  <ScheduleItem key={row.id} row={row} index={1 + i} accounts={accounts} />
                ))}
              </Section>
            )}
            {inactive.length > 0 && (
              <Section title="Paused and finished">
                {inactive.map((row, i) => (
                  <ScheduleItem key={row.id} row={row} index={1 + active.length + i} accounts={accounts} />
                ))}
              </Section>
            )}

            <Section title={monthLabel(month)}>
              {thisMonth.length === 0 ? (
                <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>Nothing recorded yet this month.</Text>
              ) : (
                thisMonth.map((row, i) => {
                  const account = accountName(accounts, row.account_id);
                  const index = 1 + schedules.length + i;
                  return (
                    <PopIn key={row.id} play delay={MOUNT_DELAY + Math.min(index, STAGGER_CAP) * ITEM_STAGGER} style={[styles.rowCard, styles.rowInner, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>{row.label}</Text>
                        <Text style={[styles.rowMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>
                          {formatDateShort(row.date)} · {SOURCE_LABELS[row.source] ?? "Income"}{account ? ` · ${account}` : ""}
                        </Text>
                      </View>
                      <Text style={[styles.rowAmount, { color: tokens.mint, fontFamily: fontFamily.bodyBold }]}>+{formatCurrency(Number(row.amount) || 0, hideAmounts)}</Text>
                      <View style={styles.rowActions}>
                        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(`/modals/add-income?id=${encodeURIComponent(row.id)}`); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${row.label}`}>
                          <Pencil size={17} color={tokens.text3} />
                        </Pressable>
                        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setDeleting(row); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${row.label}`}>
                          <Trash2 size={17} color={tokens.text3} />
                        </Pressable>
                      </View>
                    </PopIn>
                  );
                })
              )}
            </Section>
          </>
        )}
      </ScrollView>

      <BottomSheet visible={deleting !== null} onClose={() => !removeIncome.isPending && setDeleting(null)}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Delete income</Text>
        <Text style={[styles.sheetBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          {deleting?.counted === "monthly"
            ? `Remove this record of "${deleting.label}"? Your monthly income still counts.`
            : `Remove "${deleting?.label ?? ""}"? It comes back out of Ready to Assign.`}
        </Text>
        <View style={styles.sheetButtonRow}>
          <Pressable onPress={() => setDeleting(null)} disabled={removeIncome.isPending} style={[styles.sheetButton, { backgroundColor: tokens.pillBg }]}>
            <Text style={[styles.sheetButtonText, { color: tokens.text2, fontFamily: fontFamily.bodyBold }]}>Back</Text>
          </Pressable>
          <Pressable onPress={confirmDelete} disabled={removeIncome.isPending} style={[styles.sheetButton, { backgroundColor: tokens.coral, opacity: removeIncome.isPending ? 0.6 : 1 }]}>
            <Text style={[styles.sheetButtonText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>{removeIncome.isPending ? "Working…" : "Delete"}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

type Tokens = ReturnType<typeof useTheme>["tokens"];

function toneFor(tokens: Tokens, frequency: string): { ink: string; soft: string } {
  if (frequency === "weekly") return { ink: tokens.blue, soft: tokens.blueSoft };
  if (frequency === "daily") return { ink: tokens.violet, soft: tokens.violetSoft };
  if (frequency === "yearly") return { ink: tokens.accentInk, soft: tokens.accentSoft };
  return { ink: tokens.mint, soft: tokens.mintSoft };
}

// Module-level, not inside IncomeScreen: a component defined in render is a new
// type each render, so its rows remount and replay the reveal.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>{title.toUpperCase()}</Text>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

function ScheduleItem({ row, index, accounts }: { row: RecurringIncomeRow; index: number; accounts: AccountRow[] | undefined }) {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();
  const { hideAmounts } = usePrivacy();
  const router = useRouter();
  const isActive = row.status === "active";
  const press = usePressSpring(0.98);
  const account = accountName(accounts, row.account_id);
  const tone = toneFor(tokens, row.frequency);
  const pay = payLabel(row);
  return (
    <PopIn play delay={MOUNT_DELAY + Math.min(index, STAGGER_CAP) * ITEM_STAGGER} style={[styles.rowCard, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
      <Reanimated.View style={press.style}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            router.push(`/modals/recurring-income?id=${encodeURIComponent(row.id)}`);
          }}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${row.label}`}
          style={styles.rowInner}
        >
          <View style={{ flex: 1, opacity: isActive ? 1 : 0.5 }}>
            <Text style={[styles.rowTitle, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>{row.label}</Text>
            <Text style={[styles.rowMeta, styles.rowMetaLine, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>
              <Text style={{ color: tone.ink, fontFamily: fontFamily.bodyBold }}>{CADENCE_LABELS[row.frequency] ?? row.frequency}</Text>
              {" · "}
              {/* Orange only when payday is close; a normal date stays quiet. */}
              <Text style={pay.startsWith("Payday") ? { color: tokens.accentInk } : undefined}>{pay}</Text>
              {account ? ` · ${account}` : ""}
            </Text>
          </View>
          <Text style={[styles.rowAmount, { color: tokens.text, fontFamily: fontFamily.bodyBold, opacity: isActive ? 1 : 0.5 }]}>
            {formatCurrency(Number(row.amount) || 0, hideAmounts)}
          </Text>
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
  hero: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 20, gap: 6, overflow: "hidden" },
  heroAmountRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  heroPer: { fontSize: 15 },
  tileRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  tile: { flex: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 1 },
  tileName: { fontSize: 11.5 },
  tileAmount: { fontSize: 17 },
  tileCount: { fontSize: 10.5 },
  progress: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: 8 },
  progressFill: { height: "100%", borderRadius: 999 },
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
  emoji: { fontSize: 20 },
  headerButtons: { flexDirection: "row", gap: 8 },
  starter: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, width: "100%" },
  starterTitle: { fontSize: 16 },
  starterBody: { fontSize: 13, lineHeight: 18 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13 },
  primary: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  primaryText: { fontSize: 15 },
  hint: { fontSize: 12, lineHeight: 16 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 18, marginLeft: 8 },
  sheetTitle: { fontSize: 18, marginBottom: 12 },
  sheetBody: { fontSize: 13, lineHeight: 18 },
  sheetButtonRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  sheetButton: { flex: 1, minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  sheetButtonText: { fontSize: 14 },
  rowTitle: { fontSize: 15 },
  rowMetaLine: { marginTop: 2 },
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
