import { ExpenseNoticeScreen } from '@/src/features/log-expense/ExpenseNoticeScreen';
import { ExpenseWriteError } from '@/src/lib/expenseConflict';
import { useCurrency } from '@/src/context/CurrencyContext'
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, useFocusEffect, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight, SlidersHorizontal, Trash2, X } from "lucide-react-native";
import Reanimated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import type { ThemeTokens } from "@/src/theme/tokens";
import { AnimatedTabContent } from "@/src/components/nav/AnimatedTabContent";
import { Screen } from "@/src/components/ui/Screen";
import { Chip } from "@/src/components/ui/Chip";
import { IconButton } from "@/src/components/ui/Button";
import { Icon } from "@/src/components/shared/Icon";
import { useTheme } from "@/src/theme/ThemeProvider";
import { usePrivacy } from "@/src/context/PrivacyContext";
import { fontFamily } from "@/src/theme/fonts";

import { categoryEmoji, splitEmoji } from "@/src/lib/emoji";
import {
  useExpensesPage,
  useDeleteExpense,
  useDuplicates,
  prefetchExpensesPage,
} from "@/src/hooks/useExpenses";
import { useCategories } from "@/src/hooks/useCategories";
import { CategoryPickerSheet } from "@/src/components/shared/CategoryPickerSheet";
import { BottomSheet } from "@/src/components/shared/Modal";
import { DatePicker, type DateRange } from "@/src/components/shared/DatePicker";
import { useRefresh } from "@/src/hooks/useRefresh";
import { SwipeableRow } from "@/src/components/activity/SwipeableRow";
import { SelectCheck, SelectTint } from "@/src/components/shared/SelectCheck";
import { DeletingRow } from "@/src/components/activity/DeletingRow";
import { LoadingCaption } from "@/src/components/shared/LoadingCaption";
import { OfflineScreen } from "@/src/components/shared/OfflineScreen";
import { ErrorScreen } from "@/src/components/shared/ErrorScreen";
import { EmptyState } from "@/src/components/shared/EmptyState";
import type { ExpenseRow } from "@/src/types";
import { toLocalDateString } from "@/src/lib/date";
import { useOnline } from "@/src/lib/netStatus";
import { EMPTY } from "@/src/lib/constants";
import { FORCE_EMPTY_STATE_PREVIEW, emptyForPreview } from "@/src/lib/emptyStatePreview";

type PeriodKey = "all" | "week" | "month" | "custom";

const CHIP_TRANSITION = LinearTransition.springify().damping(64).stiffness(700);
const PAGE_SIZE = 30;
const ROW_GAP = 12;

// Mirrors Web's TransactionsView.tsx INCOME_CATEGORIES set — colors/signs these
// as income instead of spend.
const INCOME_CATEGORIES = new Set([
  "Salary",
  "Income",
  "Refund",
  "Cashback",
  "Bonus",
  "Interest",
  "Gift",
  "Transfer",
]);

function toDateInput(d: Date): string {
  return toLocalDateString(d);
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === toDateInput(today)) return "Today";
  if (iso === toDateInput(yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = d.toLocaleDateString("en-IN", { month: "short" });
  const year = String(d.getFullYear()).slice(2);
  return `${day} ${month} '${year}`;
}

function formatRangeFilter(range: DateRange): string | null {
  if (range.from && range.to)
    return `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`;
  if (range.from) return `From ${formatShortDate(range.from)}`;
  if (range.to) return `Until ${formatShortDate(range.to)}`;
  return null;
}

// Category avatars cycle through the existing soft-hue tokens (hash of the name) so
// the flat list reads with the same varied-but-controlled color as Slice's own rows,
// without inventing a new palette.
const AVATAR_HUES: ((t: ThemeTokens) => string)[] = [
  (t) => t.mintSoft,
  (t) => t.violetSoft,
  (t) => t.blueSoft,
  (t) => t.accentSoft,
  (t) => t.warnSoft,
  (t) => t.coralSoft,
];

function avatarColorFor(name: string, tokens: ThemeTokens): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length](tokens);
}

// Id first: two same-item rows logged in the same second share a timestamp,
// and selecting (or rendering) one must not stand in for both.
function keyOf(t: ExpenseRow): string {
  return t.id || `t-${t.timestamp}-${t.item}`;
}

export default function ActivityScreen() {
  const { formatCurrency } = useCurrency()

  const { tokens, scheme } = useTheme();
  const { refreshing, onRefresh } = useRefresh();
  const { hideAmounts } = usePrivacy();
  const router = useRouter();
  const online = useOnline();

  const categoriesQ = useCategories();
  const deleteExpense = useDeleteExpense();
  const duplicateCount = useDuplicates().data?.length ?? 0;
  const [deleteNotice, setDeleteNotice] = useState<{ status?: number } | null>(null);
  const qc = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(1);

  const changePage = useCallback((next: number, scrollToTop = false) => {
    setPage(next);
    if (scrollToTop) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, []);

  const params = useLocalSearchParams<{
    date?: string;
    category?: string;
    period?: string;
  }>();
  const paramDate = typeof params.date === "string" ? params.date : "";
  const paramCategory =
    typeof params.category === "string" ? params.category : "";
  const paramPeriod =
    params.period === "month" || params.period === "week"
      ? params.period
      : "";
  // Date drill-in from the Insights heatmap: show only that day's transactions.
  const [selectedDate, setSelectedDate] = useState(paramDate);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local (user-clearable) filter to an incoming route param, not derivable from render
    if (paramDate) setSelectedDate(paramDate);
  }, [paramDate]);

  const [period, setPeriod] = useState<PeriodKey>(paramPeriod || "month");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: "",
    to: "",
  });
  // Category drill-in from an envelope's "View transactions" action.
  const [selectedCategory, setSelectedCategory] = useState(paramCategory);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local (user-clearable) filter to an incoming route param, not derivable from render
    if (paramCategory) setSelectedCategory(paramCategory);
  }, [paramCategory]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local (user-clearable) filter to an incoming route param, not derivable from render
    if (paramPeriod) setPeriod(paramPeriod);
  }, [paramPeriod]);
  const [search, setSearch] = useState("");
  // Row supports swipe-left (delete) / swipe-right (edit) via SwipeableRow;
  // tap still opens this Edit/Delete action sheet as a non-swipe fallback.
  const [sheetTxn, setSheetTxn] = useState<ExpenseRow | null>(null);
  const [deleteTxn, setDeleteTxn] = useState<ExpenseRow | null>(null);
  // Set once the confirm sheet's Delete is tapped; drives the row's collapse
  // animation in DeletingRow. The actual mutate() call is deferred until that
  // animation finishes (see its onDone), so the refetch-driven removal never
  // pops a still-visible row.
  const [pendingDelete, setPendingDelete] = useState<ExpenseRow | null>(null);
  // Multi-select: a long-press starts it, and clearing the last row ends it.
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const selecting = selectedKeys.size > 0;
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Rows hidden the moment a bulk delete starts; failed ones come back.
  const [removedKeys, setRemovedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const timeFilterLabel = useMemo(() => {
    if (selectedDate) return formatDateHeader(selectedDate);
    if (period === "week") return "This Week";
    if (period === "month") return "This Month";
    if (period === "custom") return formatRangeFilter(customRange);
    return null;
  }, [customRange, period, selectedDate]);
  const categoryFilterLabel = selectedCategory
    ? `${categoryEmoji(selectedCategory)} ${splitEmoji(selectedCategory).text}`
    : null;
  const hasActiveFilters = Boolean(timeFilterLabel || categoryFilterLabel);

  const clearTimeFilter = useCallback(() => {
    setSelectedDate("");
    setPeriod("all");
    setCustomRange({ from: "", to: "" });
  }, []);

  const clearAllFilters = useCallback(() => {
    clearTimeFilter();
    setSelectedCategory("");
  }, [clearTimeFilter]);
  // Currently swiped-open row's close/reset fns + key — snapped shut on blur so the
  // edit/delete panel is never left revealed when the user returns to this tab. Blur uses
  // `reset` (instant, no spring) rather than `close` (animated) — an animated close still
  // settling when the tab's fade transition starts would sweep the still-visible action
  // panel into that fade, flashing its background during the switch.
  const openRowRef = useRef<{
    key: string;
    close: () => void;
    reset: () => void;
  } | null>(null);
  useFocusEffect(
    useCallback(() => {
      return () => {
        openRowRef.current?.reset();
        openRowRef.current = null;
      };
    }, []),
  );

  // A cheap 1-row fetch to anchor "this week"/"this month" off the newest
  // logged transaction, the same way the old full-fetch version did.
  const anchorQuery = useExpensesPage({ page: 1, limit: 1 });
  const latestDate = useMemo(() => {
    const iso = anchorQuery.data?.rows[0]?.date;
    if (!iso) return new Date();
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [anchorQuery.data]);

  // The from/to window sent to the server — same date math the old
  // client-side filter used, now producing a range instead of filtering an
  // already-fetched array.
  const { from, to } = useMemo(() => {
    if (selectedDate) return { from: selectedDate, to: selectedDate };
    if (period === "custom") {
      return {
        from: customRange.from || undefined,
        to: customRange.to || undefined,
      };
    }
    if (period === "all") return { from: undefined, to: undefined };
    // Compare as local calendar-date strings (like the customRange branch above) rather than
    // Date objects — avoids UTC/local timezone skew when the boundary falls near midnight.
    const endStr = toLocalDateString(latestDate);
    let startStr: string;
    if (period === "week") {
      const start = new Date(latestDate);
      const diffToMonday = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - diffToMonday);
      startStr = toLocalDateString(start);
    } else {
      startStr = `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, "0")}-01`;
    }
    return { from: startStr, to: endStr };
  }, [selectedDate, period, customRange.from, customRange.to, latestDate]);

  const expensesQ = useExpensesPage({
    page,
    limit: PAGE_SIZE,
    category: selectedCategory || undefined,
    from,
    to,
    q: search.trim() || undefined,
  });
  const filtered = emptyForPreview(expensesQ.data?.rows ?? EMPTY).filter(
    (t) => !removedKeys.has(keyOf(t)),
  );
  const selectedTxns = filtered.filter((t) => selectedKeys.has(keyOf(t)));
  // keepPreviousData shows the old page's rows while the new one loads; they
  // aren't what the filter asked for, so nothing gets picked or deleted then.
  const selectionLocked = bulkDeleting || expensesQ.isPlaceholderData;
  const allSelected = filtered.length > 0 && selectedTxns.length === filtered.length;
  const totalCount = FORCE_EMPTY_STATE_PREVIEW ? 0 : expensesQ.data?.total ?? 0;
  const totalPages = FORCE_EMPTY_STATE_PREVIEW ? 1 : expensesQ.data?.pageCount ?? 1;
  const totalSpend = FORCE_EMPTY_STATE_PREVIEW ? 0 : expensesQ.data?.totalAmount ?? 0;
  // ponytail: with search + period "all" + no category, the server can't
  // filter item/notes in Mongo (they're encrypted) and falls back to an
  // unbounded JS scan for that one combo — same as this screen's own
  // pre-pagination behavior, not a regression. Upgrade path: a denormalized
  // plaintext search field, if it ever shows up slow.

  useEffect(() => {
    // Reset pagination whenever any filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [selectedDate, period, customRange.from, customRange.to, selectedCategory, search]);

  // Which rows are on screen; a bulk delete that finishes after it changed
  // mustn't reselect its failures into a view that no longer shows them.
  const viewKey = [page, selectedDate, period, customRange.from, customRange.to, selectedCategory, search].join("|");
  const viewKeyRef = useRef(viewKey);
  useEffect(() => {
    viewKeyRef.current = viewKey;
  });
  useEffect(() => {
    // A selection only means the rows on screen: drop it when they change, so
    // rows picked earlier can't come back selected and get swept into a delete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedKeys(new Set());
  }, [page, selectedDate, period, customRange.from, customRange.to, selectedCategory, search]);

  // Warms the next page's cache slot once the current page has loaded, so
  // "Next" reads from cache instead of waiting on a fetch.
  useEffect(() => {
    if (!expensesQ.data || page >= totalPages) return;
    prefetchExpensesPage(qc, {
      page: page + 1,
      limit: PAGE_SIZE,
      category: selectedCategory || undefined,
      from,
      to,
      q: search.trim() || undefined,
    });
  }, [expensesQ.data, page, totalPages, selectedCategory, from, to, search, qc]);

  function openEdit(t: ExpenseRow) {
    setSheetTxn(null);
    router.push({
      pathname: "/modals/log-expense",
      params: {
        id: t.id ?? "",
        version: t.version === undefined ? "" : String(t.version),
        timestamp: t.timestamp,
        item: t.item,
        amountInr: t.amount_inr,
        category: t.category,
        date: t.date,
        notes: t.notes,
        paymentMethod: t.payment_method,
      },
    });
  }

  function confirmDelete(t: ExpenseRow) {
    setSheetTxn(null);
    setDeleteTxn(t);
  }

  function runDelete(t: ExpenseRow) {
    setDeleteTxn(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {},
    );
    deleteExpense.mutate(
      {
        id: t.id,
        version: t.version,
        timestamp: t.timestamp,
        item: t.item,
        amountInr: Number(t.amount_inr) || 0,
      },
      // Left set on success so the row stays collapsed until the refetch drops
      // it — clearing it here springs the row back to full height for a whole
      // round trip. On failure the row does come back, which is the signal.
      { onError: (err) => {
        setPendingDelete(null);
        setDeleteNotice({ status: err instanceof ExpenseWriteError ? err.status : undefined });
      } },
    );
  }

  function toggleSelected(t: ExpenseRow) {
    Haptics.selectionAsync().catch(() => {});
    openRowRef.current?.close();
    const key = keyOf(t);
    setSelectedKeys((keys) => {
      const next = new Set(keys);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  // One request per row, in order: each delete runs its own server transaction
  // (credit-card envelope rebalance included), so parallel requests would just
  // race those for no real speed-up at a page's worth of rows.
  async function runBulkDelete(txns: ExpenseRow[]) {
    const keys = txns.map(keyOf);
    setConfirmBulk(false);
    setBulkDeleting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {},
    );
    // Optimistic: rows and the selection header go now; failures bring both back.
    setRemovedKeys((prev) => new Set([...prev, ...keys]));
    setSelectedKeys(new Set());
    const startView = viewKeyRef.current;
    const failed: ExpenseRow[] = [];
    let firstStatus: number | undefined;
    for (const t of txns) {
      try {
        await deleteExpense.mutateAsync({
          id: t.id,
          version: t.version,
          timestamp: t.timestamp,
          item: t.item,
          amountInr: Number(t.amount_inr) || 0,
        });
      } catch (err) {
        if (!failed.length) firstStatus = err instanceof ExpenseWriteError ? err.status : undefined;
        failed.push(t);
      }
    }
    // Wait for the list to drop the deleted rows, then stop hiding anything:
    // a row restored from Archive later must show up again on this tab.
    await qc.refetchQueries({ queryKey: ["expenses"] }).catch(() => {});
    setBulkDeleting(false);
    setRemovedKeys(new Set());
    // Failed rows come back, still selected, so a retry is one tap away.
    if (failed.length && viewKeyRef.current === startView) setSelectedKeys(new Set(failed.map(keyOf)));
    if (failed.length) setDeleteNotice({ status: firstStatus });
  }

  const isLoading = !FORCE_EMPTY_STATE_PREVIEW && (anchorQuery.isLoading || expensesQ.isLoading || categoriesQ.isLoading);
  // A failed refresh keeps the last good data: only an error with no transactions to show replaces the list.
  const hasError = !FORCE_EMPTY_STATE_PREVIEW && !!(expensesQ.error || categoriesQ.error) && expensesQ.data === undefined;

  if (hasError && !online) return <OfflineScreen />;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <LoadingCaption />
      </View>
    );
  }

  if (hasError) {
    return (
      <ErrorScreen
        title="Couldn't load transactions"
        message="Check your connection and try again."
        onRetry={() => {
          expensesQ.refetch();
          categoriesQ.refetch();
        }}
      />
    );
  }

  return (
    <AnimatedTabContent>
      {deleteNotice && <ExpenseNoticeScreen status={deleteNotice.status} action="delete" onBack={() => setDeleteNotice(null)} />}
      <Screen
        ref={scrollRef}
        title={selecting ? `${selectedTxns.length} selected` : "Activity"}
        actions={
          selecting ? (
            <>
              <Chip
                label={allSelected ? "Clear" : "Select all"}
                onPress={() => {
                  if (!selectionLocked)
                    setSelectedKeys(allSelected ? new Set() : new Set(filtered.map(keyOf)));
                }}
              />
              <IconButton
                icon={Trash2}
                color={tokens.coral}
                accessibilityLabel="Delete selected"
                onPress={() => {
                  if (!selectionLocked && selectedTxns.length) setConfirmBulk(true);
                }}
              />
              <IconButton
                icon={X}
                accessibilityLabel="Cancel selection"
                onPress={() => {
                  if (!bulkDeleting) setSelectedKeys(new Set());
                }}
              />
            </>
          ) : duplicateCount > 0 ? (
            <Chip
              selected
              label={`Review ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`}
              onPress={() => router.push("/modals/duplicates" as Href)}
            />
          ) : undefined
        }
        contentContainerStyle={[
          styles.scrollContent,
          totalCount === 0 && styles.scrollContentGrow,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
          />
        }
      >
        {/* The nav keeps entry handy; the empty state offers it in context. */}
        <View style={styles.searchRow}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search transactions"
            placeholderTextColor={tokens.text3}
            style={[
              styles.search,
              {
                backgroundColor:
                  scheme === "dark" ? tokens.cardSolid : tokens.inputBg,
                color: tokens.text,
                fontFamily: fontFamily.bodyMedium,
              },
            ]}
          />
          <IconButton
            icon={SlidersHorizontal}
            accessibilityLabel="Filter transactions"
            onPress={() => setCategorySheetOpen(true)}
          />
        </View>

        {hasActiveFilters ? (
          <Reanimated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(120)}
            style={styles.appliedFilters}
          >
            <View style={styles.appliedFiltersHeader}>
              <Text
                style={[
                  styles.appliedFiltersLabel,
                  { color: tokens.text3, fontFamily: fontFamily.bodyBold },
                ]}
              >
                APPLIED FILTERS
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
                hitSlop={8}
                onPress={clearAllFilters}
              >
                <Text
                  style={[
                    styles.clearFiltersText,
                    {
                      color: tokens.accent,
                      fontFamily: fontFamily.bodySemiBold,
                    },
                  ]}
                >
                  Clear all
                </Text>
              </Pressable>
            </View>
            <Reanimated.View
              layout={CHIP_TRANSITION}
              style={styles.appliedFilterRow}
            >
              {timeFilterLabel ? (
                <AppliedFilterChip
                  label={timeFilterLabel}
                  accessibilityLabel="Remove date filter"
                  onRemove={clearTimeFilter}
                />
              ) : null}
              {categoryFilterLabel ? (
                <AppliedFilterChip
                  label={categoryFilterLabel}
                  accessibilityLabel="Remove category filter"
                  onRemove={() => setSelectedCategory("")}
                />
              ) : null}
            </Reanimated.View>
          </Reanimated.View>
        ) : null}

        {totalCount === 0 ? (
          <EmptyState
            style={styles.emptyState}
            mood={hasActiveFilters || search.trim() ? "searching" : "snoozing"}
            title={hasActiveFilters || search.trim() ? "Nothing turned up" : "Your story starts here"}
            description={hasActiveFilters || search.trim() ? "No transactions for this filter." : "Log your first expense. We'll keep the little details here."}
            action={hasActiveFilters || search.trim()
              ? { label: "Clear filters", onPress: () => { clearAllFilters(); setSearch(""); } }
              : { label: "Log an expense", onPress: () => router.push("/modals/log-expense") }}
          />
        ) : (
          <View>
            {filtered.map((txn) => {
              const avatarBg = avatarColorFor(txn.category, tokens);
              const isSelected = selectedKeys.has(keyOf(txn));
              const content = (
                <Pressable
                  onPress={() => (selecting ? toggleSelected(txn) : setSheetTxn(txn))}
                  onLongPress={() => {
                    if (!selecting) toggleSelected(txn);
                  }}
                  disabled={selectionLocked}
                  accessibilityState={selecting ? { selected: isSelected } : undefined}
                  style={[styles.row, { backgroundColor: tokens.bg }]}
                >
                  <SelectTint selected={isSelected} style={styles.rowTint} />
                  <SelectCheck selecting={selecting} selected={isSelected} gap={ROW_GAP} />
                  <View style={[styles.icon, { backgroundColor: avatarBg }]}>
                    <Text style={{ fontSize: 15 }}>
                      {categoryEmoji(txn.category)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[
                        styles.rowItem,
                        {
                          color: tokens.text,
                          fontFamily: fontFamily.bodySemiBold,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {txn.item}
                    </Text>
                    <Text
                      style={[
                        styles.rowMeta,
                        {
                          color: tokens.text3,
                          fontFamily: fontFamily.bodyMedium,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {formatShortDate(txn.date)} ·{" "}
                      {splitEmoji(txn.category).text}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.rowAmount,
                      {
                        color: INCOME_CATEGORIES.has(txn.category)
                          ? tokens.mint
                          : tokens.text,
                        fontFamily: fontFamily.bodySemiBold,
                      },
                    ]}
                  >
                    {formatCurrency(
                      Number(txn.amount_inr) || 0,
                      hideAmounts,
                    )}
                  </Text>
                </Pressable>
              );
              return (
                <DeletingRow
                  key={keyOf(txn)}
                  active={
                    pendingDelete !== null &&
                    keyOf(pendingDelete) === keyOf(txn)
                  }
                  onDone={() => {
                    if (pendingDelete) runDelete(pendingDelete);
                  }}
                >
                  <SwipeableRow
                      enabled={!selecting}
                      rowKey={keyOf(txn)}
                      onDelete={() => confirmDelete(txn)}
                      onEdit={() => openEdit(txn)}
                      onOpen={(key, close, reset) => {
                        if (
                          openRowRef.current &&
                          openRowRef.current.key !== key
                        ) {
                          openRowRef.current.close();
                        }
                        openRowRef.current = { key, close, reset };
                      }}
                    >
                      {content}
                    </SwipeableRow>
                </DeletingRow>
              );
            })}
          </View>
        )}

        {totalCount > 0 ? (
          <View style={styles.footer}>
            <Text
              style={{
                color: tokens.text2,
                fontSize: 12,
                fontFamily: fontFamily.bodyMedium,
              }}
            >
              {totalCount} transaction{totalCount !== 1 ? "s" : ""}
            </Text>
            <Text
              style={{
                color: tokens.text2,
                fontSize: 12,
                fontFamily: fontFamily.bodyMedium,
              }}
            >
              Total: {formatCurrency(totalSpend, hideAmounts)}
            </Text>
          </View>
        ) : null}

        {totalPages > 1 ? (
          <View style={styles.pagination}>
            <Pressable
              onPress={() => changePage(page - 1)}
              disabled={page <= 1}
              accessibilityRole="button"
              accessibilityLabel="Previous page"
              accessibilityState={{ disabled: page <= 1 }}
              style={[
                styles.pageButton,
                {
                  backgroundColor: tokens.card,
                  borderColor: tokens.border,
                  opacity: page <= 1 ? 0.4 : 1,
                },
              ]}
            >
              <Icon icon={ChevronLeft} size={17} color={tokens.text2} />
            </Pressable>
            <Text
              style={[
                styles.pageLabel,
                { color: tokens.text, fontFamily: fontFamily.bodyBold },
              ]}
            >
              Page {page} of {totalPages}
            </Text>
            <Pressable
              onPress={() => changePage(page + 1, true)}
              disabled={page >= totalPages}
              accessibilityRole="button"
              accessibilityLabel="Next page"
              accessibilityState={{ disabled: page >= totalPages }}
              style={[
                styles.pageButton,
                {
                  backgroundColor: tokens.card,
                  borderColor: tokens.border,
                  opacity: page >= totalPages ? 0.4 : 1,
                },
              ]}
            >
              <Icon icon={ChevronRight} size={17} color={tokens.text2} />
            </Pressable>
          </View>
        ) : null}

        <BottomSheet
          visible={sheetTxn !== null}
          onClose={() => setSheetTxn(null)}
        >
          <Text
            style={[
              styles.sheetTitle,
              { color: tokens.text2, fontFamily: fontFamily.bodySemiBold },
            ]}
            numberOfLines={1}
          >
            {sheetTxn?.item}
          </Text>
          <SheetOption
            label="Edit"
            color={tokens.text}
            onPress={() => sheetTxn && openEdit(sheetTxn)}
          />
          <SheetOption
            label="Delete"
            color={tokens.coral}
            onPress={() => sheetTxn && confirmDelete(sheetTxn)}
          />
          <SheetOption
            label="Cancel"
            color={tokens.text2}
            onPress={() => setSheetTxn(null)}
          />
        </BottomSheet>

        <BottomSheet
          visible={deleteTxn !== null}
          onClose={() => setDeleteTxn(null)}
        >
          <Text
            style={[
              styles.confirmTitle,
              { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
            ]}
          >
            Delete transaction
          </Text>
          <Text
            style={[
              styles.confirmBody,
              { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
            ]}
            numberOfLines={2}
          >
            Remove &quot;{deleteTxn?.item}&quot;? This cannot be undone.
          </Text>
          <SheetOption
            label="Delete"
            color={tokens.coral}
            onPress={() => {
              if (!deleteTxn) return;
              setPendingDelete(deleteTxn);
              setDeleteTxn(null);
            }}
          />
          <SheetOption
            label="Cancel"
            color={tokens.text2}
            onPress={() => setDeleteTxn(null)}
          />
        </BottomSheet>

        <BottomSheet
          visible={confirmBulk}
          onClose={() => setConfirmBulk(false)}
        >
          <Text
            style={[
              styles.confirmTitle,
              { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
            ]}
          >
            Delete {selectedTxns.length} transaction{selectedTxns.length === 1 ? "" : "s"}
          </Text>
          <Text
            style={[
              styles.confirmBody,
              { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
            ]}
            numberOfLines={2}
          >
            {selectedTxns.length === 1 ? "It'll" : "They'll"} move to Archive. You can restore {selectedTxns.length === 1 ? "it" : "them"} for 7 days.
          </Text>
          <SheetOption
            label="Delete"
            color={tokens.coral}
            onPress={() => void runBulkDelete(selectedTxns)}
          />
          <SheetOption
            label="Cancel"
            color={tokens.text2}
            onPress={() => setConfirmBulk(false)}
          />
        </BottomSheet>

        <BottomSheet
          visible={categorySheetOpen}
          onClose={() => setCategorySheetOpen(false)}
        >
          <Text
            style={[
              styles.sheetTitle,
              { color: tokens.text2, fontFamily: fontFamily.bodySemiBold },
            ]}
          >
            Filter
          </Text>
          <View style={styles.periodRow}>
            {(["all", "week", "month", "custom"] as PeriodKey[]).map((key) => (
              <Chip
                key={key}
                selected={period === key}
                label={
                  key === "all"
                    ? "All time"
                    : key === "week"
                      ? "This Week"
                    : key === "month"
                      ? "This Month"
                      : "Custom range"
                }
                onPress={() => {
                  setSelectedDate("");
                  setPeriod(key);
                  if (key === "all")
                    setCustomRange({ from: "", to: "" });
                }}
              />
            ))}
          </View>
          {period === "custom" && (
            <View style={styles.customRangeWrap}>
              <DatePicker
                mode="range"
                value={customRange}
                onChange={(range) => setCustomRange(range)}
              />
            </View>
          )}
          <Pressable
            style={[
              styles.categoryOption,
              styles.categoryFilterRow,
              { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
            ]}
            onPress={() => {
              setCategorySheetOpen(false);
              setCategoryPickerOpen(true);
            }}
          >
            <Text
              style={[
                styles.categoryOptionText,
                { color: tokens.text, fontFamily: fontFamily.bodySemiBold },
              ]}
            >
              Category
            </Text>
            <Text
              style={[
                styles.categoryOptionText,
                { color: tokens.text3, fontFamily: fontFamily.bodyMedium },
              ]}
            >
              {selectedCategory
                ? `${categoryEmoji(selectedCategory)} ${splitEmoji(selectedCategory).text}`
                : "View All"}
            </Text>
          </Pressable>
        </BottomSheet>

        <CategoryPickerSheet
          visible={categoryPickerOpen}
          onClose={() => setCategoryPickerOpen(false)}
          value={selectedCategory}
          onSelect={(c) => setSelectedCategory(c)}
          noneLabel="All categories"
        />
      </Screen>
    </AnimatedTabContent>
  );
}

function AppliedFilterChip({
  label,
  accessibilityLabel,
  onRemove,
}: {
  label: string;
  accessibilityLabel: string;
  onRemove: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <Reanimated.View exiting={FadeOut.duration(120)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onRemove}
        style={({ pressed }) => [
          styles.appliedFilterChip,
          {
            backgroundColor: tokens.chipActiveBg,
            borderColor: tokens.borderStrong,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.appliedFilterChipText,
            { color: tokens.text, fontFamily: fontFamily.bodySemiBold },
          ]}
        >
          {label}
        </Text>
        <X size={13} strokeWidth={2.5} color={tokens.text2} />
      </Pressable>
    </Reanimated.View>
  );
}

function SheetOption({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sheetOption}>
      <Text
        style={[
          styles.sheetOptionText,
          { color, fontFamily: fontFamily.bodySemiBold },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { gap: 4 },
  scrollContentGrow: { flexGrow: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  appliedFilters: {
    gap: 7,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  appliedFiltersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  appliedFiltersLabel: {
    fontSize: 10,
    letterSpacing: 0.7,
  },
  clearFiltersText: { fontSize: 12 },
  appliedFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  appliedFilterChip: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 100,
    paddingLeft: 12,
    paddingRight: 9,
    paddingVertical: 7,
  },
  appliedFilterChipText: { flexShrink: 1, fontSize: 12 },
  periodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  categoryOption: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  categoryOptionText: { fontSize: 14 },
  categoryFilterRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customRangeWrap: { marginBottom: 10 },
  search: {
    flex: 1,
    borderRadius: 100,
    paddingHorizontal: 18,
    paddingVertical: 13,
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingTop: 8,
  },
  pageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pageLabel: { fontSize: 12.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: ROW_GAP,
    paddingVertical: 11,
  },
  rowTint: { borderRadius: 14 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowItem: { fontSize: 15 },
  rowMeta: { fontSize: 12, marginTop: 2 },
  rowAmount: { fontSize: 15 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  sheetTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: "center",
  },
  confirmTitle: { fontSize: 17, textAlign: "center", marginBottom: 6 },
  confirmBody: { fontSize: 13, textAlign: "center", marginBottom: 8 },
  sheetOption: { paddingVertical: 14, alignItems: "center" },
  sheetOptionText: { fontSize: 16 },
});
