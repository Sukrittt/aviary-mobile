import { MoveExpenseSheet } from "@/src/components/budgets/MoveExpenseSheet";
import { useBudgetSpaces } from "@/src/hooks/useBudgetSpaces";
import { Avatar } from "@/src/components/budgets/MemberAvatars";
import { firstName, loggedBy, onlyMine } from "@/src/lib/budgetMembership";
import { currentUserId } from "@/src/api/accessMode";
import { ExpenseNoticeScreen } from '@/src/features/log-expense/ExpenseNoticeScreen';
import { useIncomes } from "@/src/hooks/useIncomes";
import { liveAccounts, useAccounts } from "@/src/hooks/useAccounts";
import { AccountChips, accountName } from "@/src/components/shared/AccountChips";
import { incomesForPage, periodEnd } from "@/src/lib/incomeActivity";
import { ExpenseWriteError } from '@/src/lib/expenseConflict';
import { useCurrency } from '@/src/context/CurrencyContext'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { tap } from "@/src/lib/haptics";
import { AnimatedPressable, usePressSpring } from "@/src/components/ui/Button";
import { CaretLeft, CaretRight, Images, MoneyWavy, Rows, SlidersHorizontal, Trash, WarningCircle, X } from "@/src/components/shared/icons";
import { ActivityFeed } from "@/src/components/activity/ActivityFeed";
import { useActivityView, useFeedOn } from "@/src/hooks/useActivityView";
import { useFeedTip } from "@/src/hooks/useFeedTip";
import { CaptureTipBubble } from "@/src/features/log-expense/CaptureTipBubble";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { track } from "@/src/lib/analytics";
import Reanimated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Screen } from "@/src/components/ui/Screen";
import { Chip } from "@/src/components/ui/Chip";
import { IconButton } from "@/src/components/ui/Button";
import { Icon } from "@/src/components/shared/Icon";
import { useTheme } from "@/src/theme/ThemeProvider";
import { usePrivacy } from "@/src/context/PrivacyContext";
import { fontFamily } from "@/src/theme/fonts";

import { splitEmoji } from "@/src/lib/emoji";
import { CategoryIcon } from "@/src/components/shared/CategoryIcon";
import {
  useExpensesPage,
  useDeleteExpense,
  useDuplicates,
  prefetchExpensesPage,
} from "@/src/hooks/useExpenses";
import { useCategories, useCategoryTint } from "@/src/hooks/useCategories";
import { CategoryPickerSheet } from "@/src/components/shared/CategoryPickerSheet";
import { BottomSheet } from "@/src/components/shared/Modal";
import { DatePicker, type DateRange } from "@/src/components/shared/DatePicker";
import { useRefresh } from "@/src/hooks/useRefresh";
import { SwipeableRow } from "@/src/components/activity/SwipeableRow";
import { SelectCheck, SelectInset, SelectTint } from "@/src/components/shared/SelectCheck";
import { DeletingRow } from "@/src/components/activity/DeletingRow";
import { ActivitySkeleton } from "@/src/components/shared/TabSkeleton";
import { OfflineScreen } from "@/src/components/shared/OfflineScreen";
import { ErrorScreen } from "@/src/components/shared/ErrorScreen";
import { EmptyState } from "@/src/components/shared/EmptyState";
import type { ExpenseRow, IncomeRow } from "@/src/types";
import { formatDayLabel, parseLocalDate, toLocalDateString } from "@/src/lib/date";
import { useOnline } from "@/src/lib/netStatus";
import { restoreArchivedItem } from "@/src/api/account";
import { Alert } from "@/src/components/ui/AlertHost";
import { Toast } from "@/src/components/ui/Toast";
import { useUnsyncedExpenses } from "@/src/hooks/useUnsyncedExpenses";
import { LOG_EXPENSE_PATH } from "@/src/features/log-expense/SubmitContext";
import { EMPTY } from "@/src/lib/constants";
import { useImportInProgress } from '@/src/components/home/ImportBanner'
import { FORCE_EMPTY_STATE_PREVIEW, emptyForPreview } from "@/src/lib/emptyStatePreview";

type PeriodKey = "all" | "week" | "month" | "custom";

const CHIP_TRANSITION = LinearTransition.springify().damping(64).stiffness(700);
const PAGE_SIZE = 30;
// Each row carries a swipe gesture and ~10 Reanimated values, so mounting a
// whole page in one commit stalls the screen. Mount this many on the first
// frame (about a screenful) and the rest of the page this many per frame.
const ROWS_PER_FRAME = 10;
const ROW_GAP = 12;
// Breathing room inside the select tint, which has no row padding to sit in.
const SELECT_INSET = 12;


function formatShortDate(iso: string): string {
  const d = parseLocalDate(iso);
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

// Id first: two same-item rows logged in the same second share a timestamp,
// and selecting (or rendering) one must not stand in for both.
function keyOf(t: ExpenseRow): string {
  return t.id || `t-${t.timestamp}-${t.item}`;
}

function ActivityScreen() {
  const { formatCurrency } = useCurrency()

  const { tokens, scheme, space } = useTheme();
  const tintOf = useCategoryTint();
  const insets = useSafeAreaInsets();
  const categoryRowPress = usePressSpring();
  const { refreshing, onRefresh } = useRefresh();
  const { hideAmounts } = usePrivacy();
  const router = useRouter();
  const online = useOnline();
  const unsynced = useUnsyncedExpenses();

  const categoriesQ = useCategories();
  const categoryByName = useMemo(
    () => new Map((categoriesQ.data ?? []).map((c) => [c.name, c])),
    [categoriesQ.data],
  );
  const deleteExpense = useDeleteExpense();
  const duplicateCount = useDuplicates().data?.length ?? 0;
  const [deleteNotice, setDeleteNotice] = useState<{ status?: number } | null>(null);
  const qc = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useActivityView();
  const feed = useFeedOn();
  const feedOn = feed.on;

  const changePage = useCallback((next: number, scrollToTop = false) => {
    tap();
    setPage(next);
    if (scrollToTop) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, []);

  const params = useLocalSearchParams<{
    date?: string;
    category?: string;
    period?: string;
    account?: string;
  }>();
  const paramAccount = typeof params.account === "string" ? params.account : "";
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
  // "Move to another budget", offered only with 2+ budgets.
  const [moveTxn, setMoveTxn] = useState<ExpenseRow | null>(null);
  const { multi: multiBudget, active: activeBudget } = useBudgetSpaces();
  // Who logged what: only in a budget with 2+ people. One person, no change.
  const shared = (activeBudget?.members.length ?? 0) > 1;
  const [mineOnly, setMineOnly] = useState(false);
  // Deleted rows go to Archive, so a delete needs no confirm: Undo restores it.
  const [undoToast, setUndoToast] = useState<{ n: number; txn: ExpenseRow | null }>({ n: 0, txn: null });
  // Set once Delete is tapped; drives the row's collapse
  // animation in DeletingRow. The actual mutate() call is deferred until that
  // animation finishes (see its onDone), so the refetch-driven removal never
  // pops a still-visible row.
  const [pendingDelete, setPendingDelete] = useState<ExpenseRow | null>(null);
  // Multi-select: a long-press starts it, and clearing the last row ends it.
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const selecting = selectedKeys.size > 0;
  // Selection is the list's; the feed has no checkboxes to show it with.
  // Turning the feed on in Features opens Activity on it. When it came on by
  // itself (first photo) the list stays put and a tip points at the switch.
  // Either way the header button flips views, and that choice sticks on this device.
  const feedView = feedOn && (view ?? (feed.auto ? "list" : "feed")) === "feed" && !selecting;
  const feedTip = useFeedTip(feed.auto && view === null && !selecting);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Rows hidden the moment a bulk delete starts; failed ones come back.
  const [removedKeys, setRemovedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  // Account drill-in from the Accounts screen's transactions action.
  const [selectedAccount, setSelectedAccount] = useState(paramAccount);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local (user-clearable) filter to an incoming route param, not derivable from render
    if (paramAccount) setSelectedAccount(paramAccount);
  }, [paramAccount]);
  const accountsQ = useAccounts();
  const accountOptions = liveAccounts(accountsQ.data);
  const incomesQ = useIncomes();

  const timeFilterLabel = useMemo(() => {
    if (selectedDate) return formatDayLabel(selectedDate);
    if (period === "week") return "This Week";
    if (period === "month") return "This Month";
    if (period === "custom") return formatRangeFilter(customRange);
    return null;
  }, [customRange, period, selectedDate]);
  const categoryFilterLabel = selectedCategory ? splitEmoji(selectedCategory).text : null;
  const accountFilterLabel = selectedAccount ? accountName(accountsQ.data, selectedAccount) || "Account" : null;
  const hasActiveFilters = Boolean(timeFilterLabel || categoryFilterLabel || accountFilterLabel);
  const importing = useImportInProgress();

  const clearTimeFilter = useCallback(() => {
    setSelectedDate("");
    setPeriod("all");
    setCustomRange({ from: "", to: "" });
  }, []);

  const clearAllFilters = useCallback(() => {
    clearTimeFilter();
    setSelectedCategory("");
    setSelectedAccount("");
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
    const d = parseLocalDate(iso);
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

  const pageParams = {
    limit: PAGE_SIZE,
    category: selectedCategory || undefined,
    account: selectedAccount || undefined,
    from,
    to,
    q: search.trim() || undefined,
  };
  const expensesQ = useExpensesPage({ ...pageParams, page });
  // Where this page's income starts: the oldest date on the page before it
  // (src/lib/incomeActivity.ts). Already cached from visiting that page.
  const prevPageQ = useExpensesPage({ ...pageParams, page: Math.max(1, page - 1) });
  const pageExpenses = emptyForPreview(expensesQ.data?.rows ?? EMPTY).filter(
    (t) => !removedKeys.has(keyOf(t)),
  );
  // ponytail: Mine filters the loaded page client-side, so totals and page counts stay everyone's. Server filter if that confuses.
  const filtered = shared && mineOnly ? onlyMine(pageExpenses, activeBudget, currentUserId()) : pageExpenses;
  const selectedTxns = filtered.filter((t) => selectedKeys.has(keyOf(t)));
  // keepPreviousData shows the old page's rows while the new one loads; they
  // aren't what the filter asked for, so nothing gets picked or deleted then.
  const selectionLocked = bulkDeleting || expensesQ.isPlaceholderData;
  const allSelected = filtered.length > 0 && selectedTxns.length === filtered.length;
  const totalCount = FORCE_EMPTY_STATE_PREVIEW ? 0 : expensesQ.data?.total ?? 0;
  const totalPages = FORCE_EMPTY_STATE_PREVIEW ? 1 : expensesQ.data?.pageCount ?? 1;
  const totalSpend = FORCE_EMPTY_STATE_PREVIEW ? 0 : expensesQ.data?.totalAmount ?? 0;
  const pageRows = expensesQ.data?.rows ?? EMPTY;
  const prevRows = page > 1 ? prevPageQ.data?.rows ?? EMPTY : EMPTY;
  // Income has no category, so a category filter hides it; and while an old
  // page is still on screen, so is its income.
  const visibleIncomes =
    selectedCategory || expensesQ.isPlaceholderData || FORCE_EMPTY_STATE_PREVIEW
      ? []
      : incomesForPage(incomesQ.data ?? [], {
          from: from ?? "0000-01-01",
          to: to && !selectedDate ? periodEnd(period, to) : to ?? "9999-12-31",
          pageMin: pageRows.length > 0 ? pageRows[pageRows.length - 1].date : null,
          prevPageMin: prevRows.length > 0 ? prevRows[prevRows.length - 1].date : null,
          page,
          isLastPage: page >= totalPages,
          q: search,
          account: selectedAccount || undefined,
        });
  const listItems = mergeByDate(filtered, visibleIncomes);
  // ponytail: with search + period "all" + no category, the server can't
  // filter item/notes in Mongo (they're encrypted) and falls back to an
  // unbounded JS scan for that one combo — same as this screen's own
  // pre-pagination behavior, not a regression. Upgrade path: a denormalized
  // plaintext search field, if it ever shows up slow.

  useEffect(() => {
    // Reset pagination whenever any filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [selectedDate, period, customRange.from, customRange.to, selectedCategory, selectedAccount, search]);

  // Deleting the last page's only row shrinks pageCount under us; step back
  // to the new last page instead of stranding the user on an empty one.
  // Placeholder data is the previous query's, so its count says nothing here.
  const serverPageCount = expensesQ.isPlaceholderData ? 0 : expensesQ.data?.pageCount ?? 0;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (serverPageCount > 0 && page > serverPageCount) setPage(serverPageCount);
  }, [page, serverPageCount]);

  // Which rows are on screen; a bulk delete that finishes after it changed
  // mustn't reselect its failures into a view that no longer shows them.
  const viewKey = [page, selectedDate, period, customRange.from, customRange.to, selectedCategory, selectedAccount, search].join("|");
  const viewKeyRef = useRef(viewKey);
  const [mountedRows, setMountedRows] = useState(ROWS_PER_FRAME);
  const [mountedView, setMountedView] = useState(viewKey);
  // Reset during render, not in an effect: an effect would commit the new
  // page's full row count once before shrinking it back.
  if (mountedView !== viewKey) {
    setMountedView(viewKey);
    setMountedRows(ROWS_PER_FRAME);
  }
  useEffect(() => {
    if (mountedRows >= listItems.length) return;
    const id = requestAnimationFrame(() => setMountedRows((n) => n + ROWS_PER_FRAME));
    return () => cancelAnimationFrame(id);
  }, [mountedRows, listItems.length]);
  useEffect(() => {
    viewKeyRef.current = viewKey;
  });
  useEffect(() => {
    // A selection only means the rows on screen: drop it when they change, so
    // rows picked earlier can't come back selected and get swept into a delete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedKeys(new Set());
  }, [page, selectedDate, period, customRange.from, customRange.to, selectedCategory, selectedAccount, search]);

  // Warms the next page's cache slot once the current page has loaded, so
  // "Next" reads from cache instead of waiting on a fetch.
  useEffect(() => {
    if (!expensesQ.data || page >= totalPages) return;
    prefetchExpensesPage(qc, {
      page: page + 1,
      limit: PAGE_SIZE,
      category: selectedCategory || undefined,
      account: selectedAccount || undefined,
      from,
      to,
      q: search.trim() || undefined,
    });
  }, [expensesQ.data, page, totalPages, selectedCategory, selectedAccount, from, to, search, qc]);

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
        hasPhoto: t.has_photo ? "1" : "",
        accountId: t.account_id ?? "",
      },
    });
  }

  function confirmDelete(t: ExpenseRow) {
    setSheetTxn(null);
    setPendingDelete(t);
  }

  function undoDelete(id: string) {
    setPendingDelete(null);
    restoreArchivedItem("expenses", id)
      .then(() => qc.invalidateQueries())
      .catch(() => Alert.alert("Couldn't restore this", "You can still restore it from Archive."));
  }

  function runDelete(t: ExpenseRow) {
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
      { onSuccess: () => setUndoToast((u) => ({ n: u.n + 1, txn: t })),
        onError: (err) => {
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

  if (!online) return <OfflineScreen />;

  if (isLoading) {
    return <ActivitySkeleton feed={feedView} />;
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

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={tokens.accent}
      colors={[tokens.accent]}
    />
  );
  const feedParams = { category: pageParams.category, account: pageParams.account, from, to, q: pageParams.q };
  // An import books oldest first, so this month's rows are the last to land; the date filter alone doesn't explain an empty list.
  const historyComing = importing && !search.trim() && !categoryFilterLabel && !accountFilterLabel
  const emptyState = historyComing ? (
    <EmptyState
      style={styles.emptyState}
      mood="snoozing"
      title="Your history is on its way"
      description="It comes in oldest first, so your latest spends land here last."
    />
  ) : (
    <EmptyState
      style={styles.emptyState}
      mood={hasActiveFilters || search.trim() ? "searching" : "snoozing"}
      title={hasActiveFilters || search.trim() ? "Nothing turned up" : "Your story starts here"}
      description={hasActiveFilters || search.trim() ? "No transactions for this filter." : "Log your first expense. We'll keep the little details here."}
      action={hasActiveFilters || search.trim()
        ? { label: "Clear filters", onPress: () => { clearAllFilters(); setSearch(""); } }
        : { label: "Log an expense", onPress: () => router.push("/modals/log-expense") }}
    />
  );
  // Search and filters, shared by both views.
  // Given up on by the sync, so it's nowhere else in Activity. Stays until the
  // user retries or discards it: never dropped on their behalf.
  const firstFailed = unsynced.failed[0]?.payload;
  const failedRow = firstFailed ? (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        router.push({
          pathname: LOG_EXPENSE_PATH,
          params: {
            failedClientId: firstFailed.client_id,
            item: firstFailed.item,
            amountInr: firstFailed.amount_inr,
            category: firstFailed.category,
            date: firstFailed.date,
            notes: firstFailed.notes ?? "",
            paymentMethod: firstFailed.payment_method ?? "",
            ...(firstFailed.account_id ? { accountId: firstFailed.account_id } : {}),
          },
        });
      }}
      style={[styles.row, styles.failedRow, { backgroundColor: tokens.coralSoft, marginBottom: space.md }]}
    >
      <Icon icon={WarningCircle} size={20} color={tokens.coral} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowItem, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
          {unsynced.failed.length === 1 ? "1 expense couldn't be saved" : `${unsynced.failed.length} expenses couldn't be saved`}
        </Text>
        <Text style={[styles.rowMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          Tap to fix it and try again, or discard it.
        </Text>
      </View>
      <Icon icon={CaretRight} size={16} color={tokens.text3} />
    </Pressable>
  ) : null;

  const controls = (
    <>
      {failedRow}
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
      {shared && !feedView ? (
        <View style={styles.whoRow}>
          <Chip label="Everyone" selected={!mineOnly} onPress={() => setMineOnly(false)} />
          <Chip label="Mine" selected={mineOnly} onPress={() => setMineOnly(true)} />
        </View>
      ) : null}

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
            {accountFilterLabel ? (
              <AppliedFilterChip
                label={accountFilterLabel}
                accessibilityLabel="Remove account filter"
                onRemove={() => setSelectedAccount("")}
              />
            ) : null}
          </Reanimated.View>
        </Reanimated.View>
      ) : null}
    </>
  );

  // A row still in the offline queue has no server copy, so nothing in Archive to bring back.
  const undoId = undoToast.txn?.id;

  return (
    <>
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
                icon={Trash}
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
          ) : (
            <>
              {/* Quiet on purpose: the queue drains itself, this only says it's on it. */}
              {unsynced.pending > 0 && (
                <Text style={[styles.syncing, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
                  Syncing {unsynced.pending}…
                </Text>
              )}
              {duplicateCount > 0 && (
                <Chip
                  selected
                  label={`Review ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`}
                  onPress={() => router.push("/modals/duplicates" as Href)}
                />
              )}
              {feedOn && (
                <IconButton
                  icon={feedView ? Rows : Images}
                  accessibilityLabel={feedView ? "Show as list" : "Show as feed"}
                  onPress={() => {
                    const next = feedView ? "list" : "feed";
                    Haptics.selectionAsync().catch(() => {});
                    openRowRef.current?.reset();
                    openRowRef.current = null;
                    setView(next);
                    track("activity_view_changed", { view: next });
                  }}
                />
              )}
            </>
          )
        }
        scroll={!feedView}
        contentContainerStyle={[
          styles.scrollContent,
          totalCount === 0 && styles.scrollContentGrow,
        ]}
        refreshControl={refreshControl}
      >
        {feedView ? (
          <ActivityFeed
            params={feedParams}
            header={controls}
            empty={emptyState}
            categoryByName={categoryByName}
            accountNameOf={(id) => accountName(accountsQ.data, id)}
            onOpenActions={setSheetTxn}
            onEdit={openEdit}
            onDelete={confirmDelete}
            isDeleting={(t) => pendingDelete !== null && keyOf(pendingDelete) === keyOf(t)}
            onDeleteDone={() => {
              if (pendingDelete) runDelete(pendingDelete);
            }}
            refreshControl={refreshControl}
          />
        ) : (
        <>
        {controls}
        {totalCount === 0 && visibleIncomes.length === 0 ? (
          emptyState
        ) : (
          <View>
            {listItems.slice(0, mountedRows).map((entry) => {
              if (entry.kind === "income") {
                const income = entry.income;
                const account = accountName(accountsQ.data, income.account_id);
                return (
                  <Pressable
                    key={`income-${income.id}`}
                    onPress={() => router.push("/account/income")}
                    accessibilityRole="button"
                    accessibilityLabel={`${income.label}, income. Open Income`}
                    style={[styles.row, { backgroundColor: tokens.bg }]}
                  >
                    <View style={[styles.icon, { backgroundColor: tokens.mintSoft }]}>
                      <Icon icon={MoneyWavy} size={16} color={tokens.mint} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowItem, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>
                        {income.label}
                      </Text>
                      <Text style={[styles.rowMeta, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>
                        {formatShortDate(income.date)} · Income{account ? ` · ${account}` : ""}
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: tokens.mint, fontFamily: fontFamily.bodySemiBold }]}>
                      +{formatCurrency(Number(income.amount) || 0, hideAmounts)}
                    </Text>
                  </Pressable>
                );
              }
              const txn = entry.txn;
              const tint = tintOf(txn.category);
              const cat = categoryByName.get(txn.category);
              const isSelected = selectedKeys.has(keyOf(txn));
              const who = shared ? loggedBy(txn, activeBudget) : undefined;
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
                  <SelectCheck selecting={selecting} selected={isSelected} gap={ROW_GAP} inset={SELECT_INSET} />
                  <View style={[styles.icon, { backgroundColor: tint.bg }]}>
                    <CategoryIcon name={txn.category} icon={cat?.icon} group={cat?.group} size={16} color={tint.ink} />
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
                      {txn.has_photo ? " · Photo" : ""}
                    </Text>
                  </View>
                  {who ? (
                    <View testID="logged-by" accessibilityLabel={`Added by ${firstName(who.name) ?? "someone"}`}>
                      <Avatar name={who.name} avatarUrl={null} size={20} />
                    </View>
                  ) : null}
                  <Text
                    style={[
                      styles.rowAmount,
                      {
                        color: tokens.text,
                        fontFamily: fontFamily.bodySemiBold,
                      },
                    ]}
                  >
                    {formatCurrency(
                      Number(txn.amount_inr) || 0,
                      hideAmounts,
                    )}
                  </Text>
                  <SelectInset selecting={selecting} gap={ROW_GAP} inset={SELECT_INSET} />
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

        {totalCount > 0 || visibleIncomes.length > 0 ? (
          <View style={styles.footer}>
            <Text
              style={{
                color: tokens.text2,
                fontSize: 12,
                fontFamily: fontFamily.bodySemiBold,
              }}
            >
              {totalCount} transaction{totalCount !== 1 ? "s" : ""}
            </Text>
            <Text
              style={{
                color: tokens.text2,
                fontSize: 12,
                fontFamily: fontFamily.bodySemiBold,
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
              <Icon icon={CaretLeft} size={17} color={tokens.text2} />
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
              <Icon icon={CaretRight} size={17} color={tokens.text2} />
            </Pressable>
          </View>
        ) : null}
        </>
        )}

        <MoveExpenseSheet expense={moveTxn} onClose={() => setMoveTxn(null)} />

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
          {shared && sheetTxn ? (
            <Text style={[styles.addedBy, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
              {addedByLabel(loggedBy(sheetTxn, activeBudget))}
            </Text>
          ) : null}
          <SheetOption
            label="Edit"
            color={tokens.text}
            onPress={() => sheetTxn && openEdit(sheetTxn)}
          />
          {multiBudget && sheetTxn?.id ? (
            <SheetOption
              label="Move to another budget"
              color={tokens.text}
              onPress={() => {
                setMoveTxn(sheetTxn);
                setSheetTxn(null);
              }}
            />
          ) : null}
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
          <AnimatedPressable
            accessibilityRole="button"
            style={[
              styles.categoryFilterRow,
              { backgroundColor: tokens.pillBg, borderColor: tokens.border },
              categoryRowPress.style,
            ]}
            onPressIn={categoryRowPress.onPressIn}
            onPressOut={categoryRowPress.onPressOut}
            onPress={() => {
              tap();
              setCategorySheetOpen(false);
              setCategoryPickerOpen(true);
            }}
          >
            <Text
              style={[
                styles.categoryOptionText,
                { flex: 1, color: tokens.text, fontFamily: fontFamily.bodySemiBold },
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
              {categoryFilterLabel ?? "View all"}
            </Text>
            <Icon icon={CaretRight} size={14} color={tokens.text3} />
          </AnimatedPressable>
          {accountOptions.length > 0 && (
            <View style={[styles.accountFilter, { borderTopColor: tokens.border }]}>
              <AccountChips
                accounts={accountOptions}
                value={selectedAccount}
                onChange={setSelectedAccount}
                allowNone
                label="Account"
              />
            </View>
          )}
        </BottomSheet>

        <CategoryPickerSheet
          visible={categoryPickerOpen}
          onClose={() => setCategoryPickerOpen(false)}
          value={selectedCategory}
          onSelect={(c) => setSelectedCategory(c)}
          noneLabel="All categories"
        />
      </Screen>
      {feedTip.show && (
        // The feed switch is the header's last icon, so it sits at the right edge.
        <CaptureTipBubble
          anchor={{ top: insets.top + space.md, right: space.lg, size: 40 }}
          title="Your photos, as a feed"
          body="Tap here to scroll your expenses with their photos."
          tryLabel="Try the feed"
          ringColor={tokens.accent}
          onTry={() => {
            feedTip.close("try");
            setView("feed");
            track("activity_view_changed", { view: "feed" });
          }}
          onDismiss={() => feedTip.close("dismiss")}
        />
      )}
      <Toast
        trigger={undoToast.n}
        message={undoToast.txn ? `Deleted ${undoToast.txn.item}` : ""}
        icon={Trash}
        durationMs={5000}
        action={undoId ? { label: "Undo", onPress: () => undoDelete(undoId) } : undefined}
        style={{ top: insets.top + 12 }}
      />
    </>
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
        <X size={13} weight="bold" color={tokens.text2} />
      </Pressable>
    </Reanimated.View>
  );
}

function addedByLabel(who: { userId: string; name: string | null } | undefined): string {
  return `Added by ${who?.userId === currentUserId() ? "you" : firstName(who?.name) ?? "someone"}`;
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

type ListItem = { kind: "expense"; txn: ExpenseRow } | { kind: "income"; income: IncomeRow };

/** Expenses as the server ordered them (newest first), with income slotted in by date: ahead of that day's spends. */
function mergeByDate(expenses: ExpenseRow[], incomes: IncomeRow[]): ListItem[] {
  const pending = [...incomes].sort((a, b) => b.date.localeCompare(a.date));
  const out: ListItem[] = [];
  for (const txn of expenses) {
    while (pending.length > 0 && pending[0].date >= txn.date) out.push({ kind: "income", income: pending.shift()! });
    out.push({ kind: "expense", txn });
  }
  for (const income of pending) out.push({ kind: "income", income });
  return out;
}

const styles = StyleSheet.create({
  accountFilter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 4 },
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
    fontSize: 12,
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
  categoryOptionText: { fontSize: 14 },
  categoryFilterRow: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  failedRow: { borderRadius: 14, paddingHorizontal: 14 },
  syncing: { fontSize: 12, alignSelf: "center" },
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
  whoRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  addedBy: { fontSize: 12, marginTop: -4, marginBottom: 8 },
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

// memo: expo-router re-renders a tab's screen on every focus change with a
// fresh props object, and a full ActivityScreen render held up each tab switch.
export default memo(ActivityScreen);
