import { useCurrency } from "@/src/context/CurrencyContext";
import { useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus } from "lucide-react-native";
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
import type { IncomeRow, RecurringIncomeRow } from "@/src/types";

const LOADING_PHRASES = ["Counting what comes in…", "Checking paydays…", "Almost there…"];
const CADENCE_LABELS: Record<string, string> = { daily: "Every day", weekly: "Every week", monthly: "Every month", yearly: "Every year" };
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
  const loading = recurringQ.isLoading || incomesQ.isLoading;
  const loadError = recurringQ.isError || incomesQ.isError;
  const empty = schedules.length === 0 && thisMonth.length === 0;

  if (!online) return <OfflineScreen />;

  function confirmDelete() {
    if (!deleting) return;
    removeIncome.mutate(
      { id: deleting.id, version: deleting.version },
      {
        onSuccess: () => setDeleting(null),
        onError: () => {
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
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Income</Text>
          <Text style={[styles.headerSub, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
            {active.length === 0 ? "Nothing on repeat yet" : `${active.length} coming in on repeat`}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <Pressable onPress={() => router.push("/modals/add-income")} accessibilityRole="button" style={[styles.addButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <Text style={[styles.addText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>One-off</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/modals/recurring-income")} accessibilityRole="button" accessibilityLabel="Add recurring income" style={[styles.addButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            <Icon icon={Plus} size={16} color={tokens.text} />
            <Text style={[styles.addText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Add</Text>
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
            <View style={styles.heroBlock}>
              <Text style={[styles.heroLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Comes in each month</Text>
              <AmountText value={monthlyTotal} size={34} weight="displayBold" animate />
              <Text style={[styles.rowMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                {formatCurrency(receivedTotal, hideAmounts)} recorded in {monthLabel(month)}
              </Text>
            </View>

            {active.length > 0 && (
              <Section title="Recurring">
                {active.map((row, i) => (
                  <ScheduleItem key={row.id} row={row} index={i} />
                ))}
              </Section>
            )}
            {inactive.length > 0 && (
              <Section title="Paused and finished">
                {inactive.map((row, i) => (
                  <ScheduleItem key={row.id} row={row} index={active.length + i} />
                ))}
              </Section>
            )}

            <Section title={monthLabel(month)}>
              {thisMonth.length === 0 ? (
                <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>Nothing recorded yet this month.</Text>
              ) : (
                thisMonth.map((row) => {
                  const account = accountName(accounts, row.account_id);
                  return (
                    <View key={row.id} style={[styles.rowCard, styles.rowInner, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>{row.label}</Text>
                        <Text style={[styles.rowMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>
                          {formatDateShort(row.date)} · {SOURCE_LABELS[row.source] ?? "Income"}{account ? ` · ${account}` : ""}
                        </Text>
                      </View>
                      <Text style={[styles.rowAmount, { color: tokens.mint, fontFamily: fontFamily.bodyBold }]}>+{formatCurrency(Number(row.amount) || 0, hideAmounts)}</Text>
                      <Pressable onPress={() => setDeleting(row)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Delete ${row.label}`}>
                        <Text style={[styles.restore, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>Delete</Text>
                      </Pressable>
                    </View>
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

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>{title.toUpperCase()}</Text>
        <View style={{ gap: 10 }}>{children}</View>
      </View>
    );
  }

  function ScheduleItem({ row, index }: { row: RecurringIncomeRow; index: number }) {
    const isActive = row.status === "active";
    const press = usePressSpring(0.98);
    const account = accountName(accounts, row.account_id);
    return (
      <PopIn play delay={MOUNT_DELAY + Math.min(index, STAGGER_CAP) * ITEM_STAGGER} style={[styles.rowCard, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
        <Reanimated.View style={press.style}>
          <Pressable
            onPress={() => router.push(`/modals/recurring-income?id=${encodeURIComponent(row.id)}`)}
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${row.label}`}
            style={styles.rowInner}
          >
            <View style={[styles.dot, { backgroundColor: tokens.mint, opacity: isActive ? 1 : 0.5 }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>{row.label}</Text>
              <View style={styles.rowMetaRow}>
                <View style={[styles.pill, { backgroundColor: tokens.pillBg }]}>
                  <Text style={[styles.pillText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{CADENCE_LABELS[row.frequency] ?? row.frequency}</Text>
                </View>
                {account ? <Text style={[styles.rowMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>· {account}</Text> : null}
              </View>
              <Text style={[styles.rowMeta, { color: isActive && row.next_run_date ? tokens.accentInk : tokens.text3, fontFamily: fontFamily.bodyMedium }]}>{payLabel(row)}</Text>
            </View>
            <Text style={[styles.rowAmount, { color: tokens.text, fontFamily: fontFamily.bodyBold, opacity: isActive ? 1 : 0.5 }]}>
              {formatCurrency(Number(row.amount) || 0, hideAmounts)}
            </Text>
          </Pressable>
        </Reanimated.View>
      </PopIn>
    );
  }
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
  restore: { fontSize: 13 },
  sheetTitle: { fontSize: 18, marginBottom: 12 },
  sheetBody: { fontSize: 13, lineHeight: 18 },
  sheetButtonRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  sheetButton: { flex: 1, minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  sheetButtonText: { fontSize: 14 },
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
