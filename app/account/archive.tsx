import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  RotateCcw,
  X,
  Receipt,
  Wallet,
  Tag,
  FolderOpen,
  Repeat,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react-native";
import { Alert } from "@/src/components/ui/AlertHost";
import { OfflineScreen } from "@/src/components/shared/OfflineScreen";
import { useOnline } from "@/src/lib/netStatus";
import { useTheme } from "@/src/theme/ThemeProvider";
import type { ThemeTokens } from "@/src/theme/tokens";
import { fontFamily } from "@/src/theme/fonts";
import { Icon } from "@/src/components/shared/Icon";
import { IconButton } from "@/src/components/ui/Button";
import { CheckIcon } from "@/src/components/shared/CheckIcon";
import { SelectCheck, SelectTint } from "@/src/components/shared/SelectCheck";
import { BottomSheet } from "@/src/components/shared/Modal";
import { LoadingPhrase } from "@/src/components/shared/LoadingPhrase";
import { useRefresh } from "@/src/hooks/useRefresh";
import { usePrivacy } from "@/src/context/PrivacyContext";
import { daysUntil, formatDateShort } from "@/src/lib/format"
import {
  getArchive,
  restoreArchivedItem,
  purgeArchivedItem,
  type ArchivedItem,
  type ArchivableCollection,
} from "@/src/api/account";
import { EmptyState } from "@/src/components/shared/EmptyState";
import { FORCE_EMPTY_STATE_PREVIEW, emptyForPreview } from "@/src/lib/emptyStatePreview";

const SECTION_ORDER: ArchivableCollection[] = [
  "expenses",
  "budgets",
  "categories",
  "groups",
  "subscriptions",
  "holdings",
];

const CHIP_LABELS: Record<ArchivableCollection, string> = {
  expenses: "Transactions",
  budgets: "Budgets",
  categories: "Categories",
  groups: "Groups",
  subscriptions: "Subscriptions",
  holdings: "Holdings",
};

const KIND_LABELS: Record<ArchivableCollection, string> = {
  expenses: "Transaction",
  budgets: "Budget",
  categories: "Category",
  groups: "Group",
  subscriptions: "Subscription",
  holdings: "Holding",
};

const KIND_ICONS: Record<ArchivableCollection, LucideIcon> = {
  expenses: Receipt,
  budgets: Wallet,
  categories: Tag,
  groups: FolderOpen,
  subscriptions: Repeat,
  holdings: TrendingUp,
};

// Web's .archive-kind tiles: each kind gets its own soft tint.
const KIND_TONES: Record<ArchivableCollection, (t: ThemeTokens) => { bg: string; fg: string }> = {
  expenses: (t) => ({ bg: t.accentSoft, fg: t.accentInk }),
  budgets: (t) => ({ bg: t.mintSoft, fg: t.mint }),
  categories: (t) => ({ bg: t.violetSoft, fg: t.violet }),
  groups: (t) => ({ bg: t.blueSoft, fg: t.blue }),
  subscriptions: (t) => ({ bg: t.warnSoft, fg: t.warnInk }),
  holdings: (t) => ({ bg: t.coralSoft, fg: t.coral }),
};

type Filter = "all" | ArchivableCollection;
type Band = "Gone tomorrow" | "Going this week" | "Later this week";

function bandFor(days: number): Band {
  if (days <= 1) return "Gone tomorrow";
  if (days <= 3) return "Going this week";
  return "Later this week";
}

function urgencyColor(
  days: number,
  tokens: { coral: string; warn: string; text2: string },
): string {
  if (days <= 1) return tokens.coral;
  if (days <= 3) return tokens.warn;
  return tokens.text2;
}

const archiveKey = ["archive"] as const;
const LOADING_PHRASES = [
  "Checking the vault…",
  "Dusting off the archive…",
  "Almost there…",
];
const LIST_TRANSITION = LinearTransition.springify().damping(90).stiffness(900);
const PAGE_SIZE = 10;
const CARD_TOP_GAP = 14;

export default function ArchiveScreen() {
  const { formatCurrency } = useCurrency()

  const { tokens } = useTheme();
  const { hideAmounts } = usePrivacy();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const { refreshing, onRefresh } = useRefresh();
  const archiveQuery = useQuery({ queryKey: archiveKey, queryFn: getArchive });

  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<{
    id: string;
    kind: "restore" | "purge";
  } | null>(null);
  const [success, setSuccess] = useState<{
    id: string;
    kind: "restore" | "purge";
  } | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<ArchivedItem | null>(null);
  // The rows the sheet is about: all of them from "Restore all", or the picked ones.
  const [confirmRestore, setConfirmRestore] = useState<ArchivedItem[] | null>(null);
  const [restoringAll, setRestoringAll] = useState(false);
  const [restoreAllSuccess, setRestoreAllSuccess] = useState(false);
  // Multi-select: a long-press starts it, and clearing the last row ends it.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const selecting = selectedIds.size > 0;

  const items = emptyForPreview(archiveQuery.data ?? []);
  const loading = !FORCE_EMPTY_STATE_PREVIEW && archiveQuery.isLoading;
  const sorted = [...items].sort(
    (a, b) => daysUntil(a.purgesAt) - daysUntil(b.purgesAt),
  );
  const shown =
    filter === "all" ? sorted : sorted.filter((i) => i.collection === filter);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = shown.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const next = sorted[0];

  const changePage = (nextPage: number, scrollToTop = false) => {
    setPage(nextPage);
    if (scrollToTop) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const counts: Record<Filter, number> = { all: items.length } as Record<
    Filter,
    number
  >;
  for (const c of SECTION_ORDER)
    counts[c] = items.filter((i) => i.collection === c).length;

  const selectedItems = pageItems.filter((i) => selectedIds.has(i.id));
  const allSelected =
    pageItems.length > 0 && selectedItems.length === pageItems.length;

  useEffect(() => {
    // A selection only means the rows on screen: drop it when they change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds(new Set());
  }, [filter, currentPage]);

  const toggleSelected = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const settle = (id: string, kind: "restore" | "purge") => {
    setPending(null);
    setSuccess({ id, kind });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    setTimeout(() => {
      setSuccess(null);
      qc.setQueryData<ArchivedItem[]>(archiveKey, (old) =>
        (old ?? []).filter((i) => i.id !== id),
      );
      qc.invalidateQueries();
    }, 650);
  };

  const handleRestore = async (item: ArchivedItem) => {
    setPending({ id: item.id, kind: "restore" });
    try {
      await restoreArchivedItem(item.collection, item.id);
      settle(item.id, "restore");
    } catch (err) {
      setPending(null);
      Alert.alert(
        "Could not restore",
        err instanceof Error && err.message.includes("already exists")
          ? err.message
          : "Check your connection and try again.",
      );
    }
  };

  const handlePurge = async (item: ArchivedItem) => {
    setPurgeTarget(null);
    setPending({ id: item.id, kind: "purge" });
    try {
      await purgeArchivedItem(item.collection, item.id);
      settle(item.id, "purge");
    } catch {
      setPending(null);
      Alert.alert("Could not delete", "Check your connection and try again.");
    }
  };

  // One at a time on purpose: two archived rows with the same name would
  // otherwise race each other past the server's collision check.
  const handleRestoreMany = async (batch: ArchivedItem[]) => {
    setRestoringAll(true);
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    for (const item of batch) {
      try {
        await restoreArchivedItem(item.collection, item.id);
        succeededIds.push(item.id);
      } catch {
        failedIds.push(item.id);
      }
    }
    qc.setQueryData<ArchivedItem[]>(archiveKey, (old) =>
      (old ?? []).filter((i) => !succeededIds.includes(i.id)),
    );
    if (succeededIds.length > 0)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    setTimeout(
      () => {
        setRestoringAll(false);
        qc.invalidateQueries();
      },
      120 + succeededIds.length * 55,
    );
    // Failed rows stay selected, so a retry is one tap away.
    setSelectedIds(new Set(failedIds));
    if (failedIds.length > 0) {
      setConfirmRestore(null);
      Alert.alert(
        "Some items couldn't be restored",
        `${succeededIds.length} restored, ${failedIds.length} skipped because a live item with the same name already exists.`,
      );
      return;
    }
    setRestoreAllSuccess(true);
    setTimeout(() => {
      setRestoreAllSuccess(false);
      setConfirmRestore(null);
    }, 1100);
  };

  let lastBand: Band | null = null;

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
          onPress={() => (selecting ? setSelectedIds(new Set()) : router.back())}
          disabled={restoringAll}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={selecting ? "Cancel selection" : "Back"}
          style={[
            styles.backButton,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Icon icon={selecting ? X : ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.headerTitle,
              { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
            ]}
          >
            {selecting ? `${selectedItems.length} selected` : "Archive"}
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: tokens.text2, fontFamily: fontFamily.bodySemiBold },
            ]}
          >
            {selecting
              ? "Tap rows to pick more"
              : items.length === 0
                ? "Nothing waiting to be purged"
                : `${items.length} item${items.length === 1 ? "" : "s"} · kept 7 days`}
          </Text>
        </View>
        {selecting ? (
          <>
            <Pressable
              onPress={() => {
                if (!restoringAll)
                  setSelectedIds(
                    allSelected ? new Set() : new Set(pageItems.map((i) => i.id)),
                  );
              }}
              style={[
                styles.restoreAllButton,
                { backgroundColor: tokens.card, borderColor: tokens.borderStrong },
              ]}
            >
              <Text
                style={[
                  styles.restoreAllText,
                  { color: tokens.text2, fontFamily: fontFamily.bodyBold },
                ]}
              >
                {allSelected ? "Clear" : "Select all"}
              </Text>
            </Pressable>
            <IconButton
              icon={RotateCcw}
              color={tokens.accent}
              background={tokens.accentSoft}
              accessibilityLabel="Restore selected"
              onPress={() => {
                if (!restoringAll && selectedItems.length) setConfirmRestore(selectedItems);
              }}
            />
          </>
        ) : items.length > 0 ? (
          <Pressable
            onPress={() => setConfirmRestore(sorted)}
            disabled={restoringAll}
            style={[
              styles.restoreAllButton,
              {
                backgroundColor: tokens.card,
                borderColor: tokens.borderStrong,
                opacity: restoringAll ? 0.6 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.restoreAllText,
                { color: tokens.text2, fontFamily: fontFamily.bodyBold },
              ]}
            >
              {restoringAll ? "Restoring…" : "Restore all"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {items.length > 0 ? (
        <View style={styles.chipRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScroll}
          >
            {(["all", ...SECTION_ORDER] as Filter[])
              .filter((f) => f === "all" || counts[f] > 0)
              .map((f) => {
                const on = filter === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => {
                      setFilter(f);
                      setPage(0);
                    }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on ? tokens.accent : tokens.card,
                        borderColor: on ? tokens.accent : tokens.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: on ? tokens.onAccent : tokens.text2,
                          fontFamily: fontFamily.bodyBold,
                        },
                      ]}
                    >
                      {f === "all" ? "All" : CHIP_LABELS[f]}
                    </Text>
                    <Text
                      style={[
                        styles.chipCount,
                        {
                          color: on ? tokens.onAccent : tokens.text3,
                          opacity: on ? 0.75 : 0.6,
                        },
                      ]}
                    >
                      {counts[f]}
                    </Text>
                  </Pressable>
                );
              })}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
          !loading &&
            items.length === 0 && {
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
            },
          loading && {
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        {loading ? (
          <LoadingPhrase
            phrases={LOADING_PHRASES}
            color={tokens.text2}
            style={[
              styles.intro,
              {
                fontFamily: fontFamily.bodyMedium,
              },
            ]}
          />
        ) : null}

        {!loading && next ? (
          <View
            style={[
              styles.nextCard,
              { backgroundColor: tokens.card, borderColor: tokens.border },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[
                  styles.nextLabel,
                  { color: tokens.text3, fontFamily: fontFamily.bodyBold },
                ]}
              >
                NEXT TO GO
              </Text>
              <Text
                style={[
                  styles.nextName,
                  {
                    color: tokens.text,
                    fontFamily: fontFamily.displaySemiBold,
                  },
                ]}
                numberOfLines={1}
              >
                {next.label || "Untitled"}
              </Text>
              <Text
                style={[
                  styles.nextNote,
                  { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
                ]}
                numberOfLines={1}
              >
                {KIND_LABELS[next.collection]}
                {next.amount !== undefined
                  ? ` · ${formatCurrency(next.amount, hideAmounts)}`
                  : ""}{" "}
                · deleted {formatDateShort(next.deletedAt)}
              </Text>
            </View>
            <View
              style={[
                styles.nextClock,
                {
                  backgroundColor:
                    urgencyColor(daysUntil(next.purgesAt), tokens) + "22",
                  borderColor: urgencyColor(daysUntil(next.purgesAt), tokens),
                },
              ]}
            >
              <Text
                style={[
                  styles.nextClockNum,
                  {
                    color: urgencyColor(daysUntil(next.purgesAt), tokens),
                    fontFamily: fontFamily.bodySemiBold,
                  },
                ]}
              >
                {daysUntil(next.purgesAt)}
              </Text>
              <Text
                style={[
                  styles.nextClockUnit,
                  { color: urgencyColor(daysUntil(next.purgesAt), tokens) },
                ]}
              >
                {daysUntil(next.purgesAt) === 1 ? "DAY" : "DAYS"} LEFT
              </Text>
            </View>
          </View>
        ) : null}

        {!loading && items.length === 0 ? (
          <EmptyState
            subject="archive"
            title="All clear in here"
            description="Deleted transactions, budgets and more will rest here for seven days, just in case."
          />
        ) : null}

        {!loading && items.length > 0 && shown.length === 0 ? (
          <EmptyState
            compact
            subject="archive"
            mood="searching"
            title="Nothing turned up"
            description={`Nothing archived under ${filter === "all" ? "All" : CHIP_LABELS[filter as ArchivableCollection]}.`}
          />
        ) : null}

        <View>
        {pageItems.map((item, idx) => {
          const days = daysUntil(item.purgesAt);
          const band = bandFor(days);
          const showBand = band !== lastBand;
          lastBand = band;
          const daysTone =
            days <= 1
              ? { bg: tokens.coralSoft, fg: tokens.coral }
              : days <= 3
                ? { bg: tokens.warnSoft, fg: tokens.warnInk }
                : { bg: tokens.inputBg, fg: tokens.text2 };
          const kindTone = KIND_TONES[item.collection](tokens);
          const isPending = pending?.id === item.id;
          const isSuccess = success?.id === item.id;
          const isSelected = selectedIds.has(item.id);

          return (
            <Animated.View
              key={item.id}
              entering={FadeIn.duration(150)}
              exiting={
                restoringAll
                  ? FadeOut.duration(180).delay(idx * 55)
                  : FadeOut.duration(120)
              }
              layout={LIST_TRANSITION}
            >
              {showBand ? (
                <Text
                  style={[
                    styles.bandLabel,
                    {
                      color: days <= 1 ? tokens.coral : tokens.text,
                      paddingTop: idx === 0 ? 4 : 20,
                      borderBottomColor: tokens.borderStrong,
                      fontFamily: fontFamily.displaySemiBold,
                    },
                  ]}
                >
                  {band}
                </Text>
              ) : null}
              <Pressable
                onPress={() => {
                  if (selecting) toggleSelected(item.id);
                }}
                onLongPress={() => {
                  if (!selecting) toggleSelected(item.id);
                }}
                disabled={restoringAll || isPending}
                accessibilityState={selecting ? { selected: isSelected } : undefined}
                style={[
                  styles.card,
                  {
                    borderBottomColor: tokens.border,
                    borderBottomWidth: idx === pageItems.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <SelectTint selected={isSelected} style={styles.cardTint} />
                <View style={styles.cardTop}>
                  <SelectCheck selecting={selecting} selected={isSelected} gap={CARD_TOP_GAP} />
                  <View
                    style={[styles.iconBadge, { backgroundColor: kindTone.bg }]}
                  >
                    <Icon
                      icon={KIND_ICONS[item.collection]}
                      size={20}
                      color={kindTone.fg}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <Text
                        style={[
                          styles.itemName,
                          {
                            color: tokens.text,
                            fontFamily: fontFamily.bodyBold,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item.label || "Untitled"}
                      </Text>
                      {item.amount !== undefined ? (
                        <Text
                          style={[styles.itemAmount, { color: tokens.text }]}
                        >
                          {formatCurrency(item.amount, hideAmounts)}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.itemContext,
                        {
                          color: tokens.text3,
                          fontFamily: fontFamily.bodyMedium,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {KIND_LABELS[item.collection]} · deleted{" "}
                      {formatDateShort(item.deletedAt)}
                    </Text>
                  </View>
                  <View style={[styles.daysPill, { backgroundColor: daysTone.bg }]}>
                    <Text
                      style={[
                        styles.daysText,
                        { color: daysTone.fg, fontFamily: fontFamily.bodyBold },
                      ]}
                    >
                      {days === 1 ? "1 day left" : `${days} days left`}
                    </Text>
                  </View>
                </View>

                {selecting ? null : (
                <View style={styles.cardBottom}>
                  <Pressable
                    onPress={() => setPurgeTarget(item)}
                    disabled={isPending}
                    style={[styles.purgeButton, { borderColor: tokens.border }]}
                  >
                    <Icon icon={X} size={13} color={tokens.text3} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleRestore(item)}
                    disabled={isPending}
                    style={[
                      styles.restoreButton,
                      {
                        backgroundColor: isSuccess
                          ? tokens.mintSoft
                          : tokens.accentSoft,
                        opacity: isPending && !isSuccess ? 0.6 : 1,
                      },
                    ]}
                  >
                    {isSuccess && success?.kind === "restore" ? (
                      <CheckIcon color={tokens.mint} size={14} />
                    ) : (
                      <Text
                        style={[
                          styles.restoreButtonText,
                          {
                            color: tokens.accent,
                            fontFamily: fontFamily.bodyBold,
                          },
                        ]}
                      >
                        {isPending && pending?.kind === "restore"
                          ? "Restoring…"
                          : "Restore"}
                      </Text>
                    )}
                  </Pressable>
                </View>
                )}
              </Pressable>
            </Animated.View>
          );
        })}
        </View>

        {shown.length > PAGE_SIZE ? (
          <View style={styles.pagination}>
            <Pressable
              onPress={() => changePage(currentPage - 1)}
              disabled={currentPage === 0}
              accessibilityRole="button"
              accessibilityLabel="Previous archive page"
              accessibilityState={{ disabled: currentPage === 0 }}
              style={[
                styles.pageButton,
                {
                  backgroundColor: tokens.card,
                  borderColor: tokens.border,
                  opacity: currentPage === 0 ? 0.4 : 1,
                },
              ]}
            >
              <Icon icon={ChevronLeft} size={17} color={tokens.text2} />
            </Pressable>
            <View style={styles.pageStatus}>
              <Text
                style={[
                  styles.pageLabel,
                  { color: tokens.text, fontFamily: fontFamily.bodyBold },
                ]}
              >
                Page {currentPage + 1} of {pageCount}
              </Text>
              <Text
                style={[
                  styles.pageRange,
                  { color: tokens.text3, fontFamily: fontFamily.bodyMedium },
                ]}
              >
                {currentPage * PAGE_SIZE + 1}–
                {Math.min((currentPage + 1) * PAGE_SIZE, shown.length)} of{" "}
                {shown.length}
              </Text>
            </View>
            <Pressable
              onPress={() => changePage(currentPage + 1, true)}
              disabled={currentPage === pageCount - 1}
              accessibilityRole="button"
              accessibilityLabel="Next archive page"
              accessibilityState={{ disabled: currentPage === pageCount - 1 }}
              style={[
                styles.pageButton,
                {
                  backgroundColor: tokens.card,
                  borderColor: tokens.border,
                  opacity: currentPage === pageCount - 1 ? 0.4 : 1,
                },
              ]}
            >
              <Icon icon={ChevronRight} size={17} color={tokens.text2} />
            </Pressable>
          </View>
        ) : null}

        {items.length > 0 ? (
          <Text
            style={[
              styles.footnote,
              { color: tokens.text3, fontFamily: fontFamily.bodyMedium },
            ]}
          >
            Kept 7 days from deletion, then removed automatically.{"\n"}
            Restoring a category or group puts it back, its transactions stay
            where they are now.
          </Text>
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={confirmRestore !== null}
        onClose={() => !restoringAll && setConfirmRestore(null)}
      >
        <Text
          style={[
            styles.sheetTitle,
            { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
          ]}
        >
          {confirmRestore?.length === 1
            ? `Restore ${confirmRestore[0].label || "this item"} back where it was?`
            : `Restore ${confirmRestore?.length ?? 0} items back where they were?`}
        </Text>
        <View style={styles.sheetButtonRow}>
          <Pressable
            onPress={() => setConfirmRestore(null)}
            disabled={restoringAll}
            style={[
              styles.sheetCancelButton,
              { opacity: restoringAll ? 0.5 : 1 },
            ]}
          >
            <Text
              style={[
                styles.sheetCancelText,
                { color: tokens.text2, fontFamily: fontFamily.bodyBold },
              ]}
            >
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={() => confirmRestore && void handleRestoreMany(confirmRestore)}
            disabled={restoringAll || restoreAllSuccess}
            style={[
              styles.sheetSaveButton,
              styles.sheetFlex,
              {
                backgroundColor: restoreAllSuccess
                  ? tokens.mint
                  : tokens.accent,
                opacity: restoringAll && !restoreAllSuccess ? 0.5 : 1,
              },
            ]}
          >
            {restoreAllSuccess ? (
              <CheckIcon color={tokens.onAccent} />
            ) : (
              <Text
                style={[
                  styles.sheetSaveText,
                  { color: tokens.onAccent, fontFamily: fontFamily.bodyBold },
                ]}
              >
                {restoringAll ? "Restoring…" : "Restore"}
              </Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>

      <BottomSheet visible={!!purgeTarget} onClose={() => setPurgeTarget(null)}>
        <Text
          style={[
            styles.sheetTitle,
            { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
          ]}
        >
          Delete {purgeTarget?.label || "this item"} forever?
        </Text>
        <Text
          style={[
            styles.sheetBody,
            { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
          ]}
        >
          This can&apos;t be undone.
        </Text>
        <View style={styles.sheetButtonRow}>
          <Pressable
            onPress={() => setPurgeTarget(null)}
            style={styles.sheetCancelButton}
          >
            <Text
              style={[
                styles.sheetCancelText,
                { color: tokens.text2, fontFamily: fontFamily.bodyBold },
              ]}
            >
              Keep
            </Text>
          </Pressable>
          <Pressable
            onPress={() => purgeTarget && handlePurge(purgeTarget)}
            style={[
              styles.sheetSaveButton,
              styles.sheetFlex,
              { backgroundColor: tokens.coral },
            ]}
          >
            <Text
              style={[
                styles.sheetSaveText,
                { color: tokens.onAccent, fontFamily: fontFamily.bodyBold },
              ]}
            >
              Delete forever
            </Text>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
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
  restoreAllButton: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
  },
  restoreAllText: { fontSize: 12.5 },
  chipRow: { paddingTop: 0 },
  chipScroll: {
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipText: { fontSize: 12.5 },
  chipCount: { fontSize: 11 },
  scrollContent: { padding: 16, gap: 9 },
  intro: { fontSize: 12, lineHeight: 17, textAlign: "center" },
  nextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  nextLabel: { fontSize: 10.5, letterSpacing: 0.9 },
  nextName: { fontSize: 20, marginTop: 3 },
  nextNote: { fontSize: 11.5, marginTop: 2 },
  nextClock: {
    minWidth: 68,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  nextClockNum: { fontSize: 20 },
  nextClockUnit: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  // Web's .archive-band / .archive-row: a flat divided list, not cards.
  bandLabel: {
    fontSize: 14,
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
  },
  card: { paddingVertical: 13, paddingHorizontal: 6, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: CARD_TOP_GAP },
  cardTint: { borderRadius: 14 },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  itemName: { flex: 1, fontSize: 14.5 },
  itemAmount: { fontSize: 13.5 },
  itemContext: { fontSize: 11.5, marginTop: 2 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  daysPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  daysText: { fontSize: 12 },
  purgeButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  restoreButton: {
    height: 30,
    minWidth: 68,
    paddingHorizontal: 13,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  restoreButtonText: { fontSize: 12.5 },
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
  pageStatus: { minWidth: 92, alignItems: "center", gap: 1 },
  pageLabel: { fontSize: 12.5 },
  pageRange: { fontSize: 10.5 },
  footnote: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  sheetTitle: { fontSize: 16, lineHeight: 22 },
  sheetBody: { fontSize: 12.5, marginTop: 6, lineHeight: 18 },
  sheetButtonRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  sheetCancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCancelText: { fontSize: 14 },
  sheetSaveButton: {
    minHeight: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetFlex: { flex: 1 },
  sheetSaveText: { fontSize: 14 },
});
