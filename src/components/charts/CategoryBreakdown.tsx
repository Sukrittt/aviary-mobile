import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Check, ListFilter, Play } from "lucide-react-native";
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme/ThemeProvider";
import { usePrivacy } from "@/src/context/PrivacyContext";
import { fontFamily } from "@/src/theme/fonts";

import { CHART_COLOR_CYCLE } from "@/src/theme/chartColors";
import { PopIn } from "@/src/components/shared/PopIn";
import { BottomSheet } from "@/src/components/shared/Modal";
import { Button } from "@/src/components/ui/Button";
import { AmountText } from "@/src/components/ui/AmountText";
import { DonutChart } from "./DonutChart";
import { EmptyState } from "@/src/components/shared/EmptyState";
import { useReveal } from "./useReveal";
import { clampPct } from "@/src/lib/monthly";
import type { BreakdownRow, MonthComparison } from "@/src/lib/monthly";
import type { ThemeTokens } from "@/src/theme/tokens";

interface Props {
  rows: BreakdownRow[];
  categoryRows: BreakdownRow[];
  groupRows: BreakdownRow[];
  categoryGroupMap: ReadonlyMap<string, string>;
  mode: "category" | "group";
  onModeChange: (mode: "category" | "group") => void;
  /** Controlled selection, lifted to the screen so the heat map card can
   *  filter to the same category. */
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  comparison: MonthComparison | null;
  leftover: number;
  monthLabel: string;
  /** Queries still in flight: hold the empty state back so the snoozing
   *  bird doesn't flash before the real rows land. */
  loading?: boolean;
}

const VISIBLE_ROWS = 6;
/** Slices below this share get bucketed into one "Other" wedge, so every
 *  slice left in the ring is big enough to tap — a 1% slice never was. */
const DONUT_TAIL_PCT = 3;

// Rows land after the donut's wipe is already underway, one behind the next.
// The index is capped so a long list doesn't trail off past the fold.
const ROW_START_DELAY = 200;
const ROW_STAGGER_MS = 40;
const ROW_STAGGER_CAP = 6;
/** Each bar fills just after its own row has settled into place. */
const BAR_OFFSET_MS = 60;
const BAR_DURATION = 450;
const FILTER_APPLY_DELAY_MS = 220;
const LIST_TRANSITION = LinearTransition.springify().damping(64).stiffness(700);

function groupForCategory(
  categoryGroupMap: ReadonlyMap<string, string>,
  key: string,
): string {
  return categoryGroupMap.get(key) || "Other";
}

/** Spend-vs-own-budget bar: 100% of the track is "fully spent this
 *  category's budget", so the fill length is self-explanatory with no
 *  legend needed — same convention as the rest of the app's ProgressBar.
 *  Turns coral past 100% instead of overflowing the track. No bar at all
 *  when there's no budget to measure against.
 *
 *  Not `envelope/ProgressBar`: that one owns the mint/warn/coral threshold
 *  palette (the Android widget depends on those thresholds too), while this
 *  bar fills with its row's own chart colour. The fill is a mount-only
 *  0 -> pct reveal, so there's no threshold hand-over to stage either. */
function BudgetBar({
  spent,
  assigned,
  color,
  tokens,
  play,
  delay,
}: {
  spent: number;
  assigned: number;
  color: string;
  tokens: ThemeTokens;
  play: boolean;
  delay: number;
}) {
  const pct = (spent / assigned) * 100;
  const over = pct > 100;
  const target = Math.min(100, pct);

  const progress = useSharedValue(play ? 0 : 1);
  useEffect(() => {
    if (!play) return;
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: BAR_DURATION,
        easing: Easing.inOut(Easing.cubic),
      }),
    );
    // Intentionally runs once for this bar's own mount — `play` and `delay` are
    // read only for their initial value, not tracked reactively (same as PopIn).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillStyle = useAnimatedStyle(
    () => ({ width: `${progress.value * target}%` }),
    [target],
  );

  return (
    <View style={[styles.barTrack, { backgroundColor: tokens.borderStrong }]}>
      <Reanimated.View
        style={[
          styles.barFill,
          { backgroundColor: over ? tokens.coral : color },
          fillStyle,
        ]}
      />
    </View>
  );
}

export function CategoryBreakdown({
  rows,
  categoryRows,
  groupRows,
  categoryGroupMap,
  mode,
  onModeChange,
  selectedKey,
  onSelectKey,
  comparison,
  leftover,
  monthLabel,
  loading = false,
}: Props) {
  const { currencySymbol, formatCurrency } = useCurrency()

  const { tokens, space, radius, type } = useTheme();
  const { hideAmounts } = usePrivacy();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<"spend" | "budget">("spend");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<"category" | "group">(
    "category",
  );
  const [excludedCategoryKeys, setExcludedCategoryKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [excludedGroupKeys, setExcludedGroupKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [draftIncludedCategoryKeys, setDraftIncludedCategoryKeys] =
    useState<Set<string> | null>(null);
  const [draftIncludedGroupKeys, setDraftIncludedGroupKeys] =
    useState<Set<string> | null>(null);
  const [pendingFilters, setPendingFilters] = useState<{
    categories: Set<string>;
    groups: Set<string>;
  } | null>(null);

  // A filter describes one concrete month, so it resets on a month change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets local filter UI to an incoming month/mode prop, not derivable from render
    setFilterOpen(false);
    setExcludedCategoryKeys(new Set());
    setExcludedGroupKeys(new Set());
    setDraftIncludedCategoryKeys(null);
    setDraftIncludedGroupKeys(null);
    setPendingFilters(null);
  }, [monthLabel]);

  // "eligible" rows: every category row, plus the groups that still have at
  // least one of them as a member (a group can drop out entirely once its
  // last category is filtered via the "Filter chart" sheet below).
  const eligibleCategoryRows = categoryRows;

  const eligibleGroupRows = useMemo(() => {
    const groupsWithCategories = new Set(
      eligibleCategoryRows.map((row) =>
        groupForCategory(categoryGroupMap, row.key),
      ),
    );
    return groupRows.filter((row) => groupsWithCategories.has(row.key));
  }, [eligibleCategoryRows, groupRows, categoryGroupMap]);

  const displayRows = useMemo(() => {
    const includedCategories = eligibleCategoryRows.filter(
      (row) =>
        !excludedCategoryKeys.has(row.key) &&
        !excludedGroupKeys.has(groupForCategory(categoryGroupMap, row.key)),
    );
    const filtered =
      mode === "category"
        ? includedCategories
        : eligibleGroupRows
            .map((group) => {
              const members = includedCategories.filter(
                (row) =>
                  groupForCategory(categoryGroupMap, row.key) === group.key,
              );
              if (members.length === 0) return null;
              if (
                members.length ===
                eligibleCategoryRows.filter(
                  (row) =>
                    groupForCategory(categoryGroupMap, row.key) === group.key,
                ).length
              )
                return group;
              const spent = members.reduce((sum, row) => sum + row.spent, 0);
              const previousSpent = members.reduce((sum, row) => {
                if (row.deltaPct == null) return sum;
                return sum + row.spent / (1 + row.deltaPct / 100);
              }, 0);
              return {
                ...group,
                spent,
                assigned: members.reduce(
                  (sum, row) => sum + row.assigned,
                  0,
                ),
                assignedIsCarried: members.every(
                  (row) => row.assignedIsCarried,
                ),
                deltaPct:
                  previousSpent > 0
                    ? clampPct(((spent - previousSpent) / previousSpent) * 100)
                    : null,
              };
            })
            .filter((row): row is BreakdownRow => row != null);
    const total = filtered.reduce((s, r) => s + r.spent, 0) || 1;
    return filtered.map((r) => ({ ...r, pct: (r.spent / total) * 100 }));
  }, [
    eligibleCategoryRows,
    eligibleGroupRows,
    excludedCategoryKeys,
    excludedGroupKeys,
    mode,
    categoryGroupMap,
  ]);

  const displayTotal = useMemo(
    () => displayRows.reduce((s, r) => s + r.spent, 0),
    [displayRows],
  );

  // Every entrance on this card runs off one cue: the screen has settled after
  // its push transition and there are real rows to show. Bumps again whenever
  // the rows are swapped out (month or mode), which is what makes a mode
  // switch re-wipe the donut and refill the bars from 0.
  const { revealKey, revealReady } = useReveal(
    `${monthLabel}|${mode}`,
    displayRows.length > 0,
  );
  const play = revealReady;

  const colorByKey = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row, i) =>
      map.set(row.key, tokens[CHART_COLOR_CYCLE[i % CHART_COLOR_CYCLE.length]]),
    );
    return map;
  }, [rows, tokens]);

  const segments = useMemo(() => {
    const big = displayRows.filter((r) => r.pct >= DONUT_TAIL_PCT);
    const small = displayRows.filter((r) => r.pct < DONUT_TAIL_PCT);
    const result = big.map((row) => ({
      key: row.key,
      label: row.label,
      emoji: row.emoji,
      value: row.spent,
      color: colorByKey.get(row.key) ?? tokens.text3,
    }));
    if (small.length > 0) {
      result.push({
        key: "__other__",
        label: "Other",
        emoji: "",
        value: small.reduce((s, r) => s + r.spent, 0),
        color: tokens.text3,
      });
    }
    return result;
  }, [displayRows, colorByKey, tokens]);

  const selectedRow = displayRows.find((r) => r.key === selectedKey) ?? null;
  // A selected row bucketed into the donut's "Other" wedge (below the tail
  // threshold) still needs its wedge to light up, not nothing.
  const donutSelectedKey =
    selectedKey == null
      ? null
      : segments.some((s) => s.key === selectedKey)
        ? selectedKey
        : "__other__";

  // Row order for the legend list only — the donut and its colors stay keyed
  // to spend order regardless, so slices never reshuffle when this toggles.
  const sortedRows = useMemo(() => {
    if (sortBy === "spend") return displayRows;
    const withBudget = displayRows.filter(
      (r) => !r.assignedIsCarried && r.assigned > 0,
    );
    const withoutBudget = displayRows.filter(
      (r) => r.assignedIsCarried || r.assigned <= 0,
    );
    withBudget.sort((a, b) => b.spent / b.assigned - a.spent / a.assigned);
    return [...withBudget, ...withoutBudget];
  }, [displayRows, sortBy]);

  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, VISIBLE_ROWS);
  const collapsedCount = sortedRows.length - VISIBLE_ROWS;
  const baseRows = mode === "category" ? eligibleCategoryRows : eligibleGroupRows;
  const filterHiddenCount = baseRows.length - displayRows.length;
  const hasCustomFilter = filterHiddenCount > 0;
  const filterActiveCount = displayRows.length;
  const activeFilterNoun =
    mode === "category"
      ? filterActiveCount === 1
        ? "category"
        : "categories"
      : filterActiveCount === 1
        ? "group"
        : "groups";
  const filterRows =
    filterTab === "category" ? eligibleCategoryRows : eligibleGroupRows;
  const draftIncludedKeys =
    filterTab === "category"
      ? draftIncludedCategoryKeys
      : draftIncludedGroupKeys;
  const allDraftItemsSelected =
    filterRows.length > 0 &&
    filterRows.every((row) => draftIncludedKeys?.has(row.key));
  const hasDraftVisibleCategory = eligibleCategoryRows.some(
    (row) =>
      draftIncludedCategoryKeys?.has(row.key) &&
      draftIncludedGroupKeys?.has(
        groupForCategory(categoryGroupMap, row.key),
      ),
  );

  const centerDelta =
    comparison && comparison.baseline != null && comparison.deltaPct != null
      ? comparison
      : null;

  useEffect(() => {
    if (filterOpen || pendingFilters == null) return;
    const id = setTimeout(() => {
      setExcludedCategoryKeys(pendingFilters.categories);
      setExcludedGroupKeys(pendingFilters.groups);
      setPendingFilters(null);
      if (selectedKey == null) return;
      const selectionWasExcluded =
        mode === "category"
          ? pendingFilters.categories.has(selectedKey) ||
            pendingFilters.groups.has(
              groupForCategory(categoryGroupMap, selectedKey),
            )
          : pendingFilters.groups.has(selectedKey) ||
            eligibleCategoryRows
              .filter(
                (row) =>
                  groupForCategory(categoryGroupMap, row.key) === selectedKey,
              )
              .every((row) => pendingFilters.categories.has(row.key));
      if (selectionWasExcluded) onSelectKey(null);
    }, FILTER_APPLY_DELAY_MS);
    return () => clearTimeout(id);
  }, [
    filterOpen,
    onSelectKey,
    pendingFilters,
    selectedKey,
    mode,
    eligibleCategoryRows,
    categoryGroupMap,
  ]);

  function openFilter() {
    setFilterTab(mode);
    setDraftIncludedCategoryKeys(
      new Set(
        eligibleCategoryRows
          .filter((row) => !excludedCategoryKeys.has(row.key))
          .map((row) => row.key),
      ),
    );
    setDraftIncludedGroupKeys(
      new Set(
        eligibleGroupRows
          .filter((row) => !excludedGroupKeys.has(row.key))
          .map((row) => row.key),
      ),
    );
    setFilterOpen(true);
  }

  function toggleDraftKey(key: string) {
    const setDraftIncludedKeys =
      filterTab === "category"
        ? setDraftIncludedCategoryKeys
        : setDraftIncludedGroupKeys;
    setDraftIncludedKeys((current) => {
      const next = new Set(current ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllDraftKeys() {
    const setDraftIncludedKeys =
      filterTab === "category"
        ? setDraftIncludedCategoryKeys
        : setDraftIncludedGroupKeys;
    setDraftIncludedKeys(
      allDraftItemsSelected
        ? new Set()
        : new Set(filterRows.map((row) => row.key)),
    );
  }

  function applyFilter() {
    if (!hasDraftVisibleCategory) return;
    const categoryKeys = new Set(eligibleCategoryRows.map((row) => row.key));
    const groupKeys = new Set(eligibleGroupRows.map((row) => row.key));
    const nextCategories = new Set(
      [...excludedCategoryKeys].filter((key) => !categoryKeys.has(key)),
    );
    const nextGroups = new Set(
      [...excludedGroupKeys].filter((key) => !groupKeys.has(key)),
    );
    for (const row of eligibleCategoryRows)
      if (!draftIncludedCategoryKeys?.has(row.key)) nextCategories.add(row.key);
    for (const row of eligibleGroupRows)
      if (!draftIncludedGroupKeys?.has(row.key)) nextGroups.add(row.key);
    setPendingFilters({ categories: nextCategories, groups: nextGroups });
    const hasActiveFilterForTab =
      filterTab === "category"
        ? nextCategories.size > 0
        : nextGroups.size > 0;
    if (hasActiveFilterForTab && mode !== filterTab) onModeChange(filterTab);
    setDraftIncludedCategoryKeys(null);
    setDraftIncludedGroupKeys(null);
    setFilterOpen(false);
  }

  const empty = displayRows.length === 0;

  return (
    <View style={empty && styles.emptyContainer}>
      <View style={styles.breakdownHeader}>
        <Text
          style={{
            color: tokens.text,
            fontFamily: fontFamily.displaySemiBold,
            fontSize: type.bodyLg,
          }}
        >
          Where it went
        </Text>
        {baseRows.length > 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hasCustomFilter
                ? `Filter chart, ${filterActiveCount} ${activeFilterNoun} active`
                : "Filter chart"
            }
            onPress={openFilter}
            style={[
              styles.headerFilterButton,
              {
                borderRadius: radius.full,
                borderColor: tokens.borderStrong,
                backgroundColor: tokens.inputBg,
                paddingHorizontal: hasCustomFilter ? 12 : 0,
              },
              hasCustomFilter && {
                backgroundColor: tokens.chipActiveBg,
                borderColor: tokens.chipActiveBg,
              },
            ]}
          >
            <ListFilter size={18} color={tokens.text} />
            {hasCustomFilter ? (
              <Text
                style={{
                  color: tokens.text,
                  fontSize: type.caption,
                  fontFamily: fontFamily.bodySemiBold,
                }}
              >
                {filterActiveCount}
              </Text>
            ) : null}
          </Pressable>
        )}
      </View>

      <View style={styles.controlsRow}>
        <View
          style={[
            styles.toggleGroup,
            { backgroundColor: tokens.inputBg, borderRadius: radius.full },
          ]}
        >
          <Pressable
            accessibilityLabel="By category"
            onPress={() => onModeChange("category")}
            style={[
              styles.toggleBtn,
              { borderRadius: radius.full },
              mode === "category" && { backgroundColor: tokens.chipActiveBg },
            ]}
          >
            <Text
              style={{
                color: tokens.text,
                fontSize: type.caption,
                fontFamily: fontFamily.bodySemiBold,
              }}
            >
              By category
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="By group"
            onPress={() => onModeChange("group")}
            style={[
              styles.toggleBtn,
              { borderRadius: radius.full },
              mode === "group" && { backgroundColor: tokens.chipActiveBg },
            ]}
          >
            <Text
              style={{
                color: tokens.text,
                fontSize: type.caption,
                fontFamily: fontFamily.bodySemiBold,
              }}
            >
              By group
            </Text>
          </Pressable>
        </View>

        <View style={styles.controlsRight}>
          <View
            style={[
              styles.measureToggle,
              { backgroundColor: tokens.inputBg, borderRadius: radius.full },
            ]}
          >
            <Pressable
              accessibilityLabel="Measure by amount spent"
              onPress={() => setSortBy("spend")}
              style={[
                styles.measureCell,
                { borderRadius: radius.full },
                sortBy === "spend" && { backgroundColor: tokens.chipActiveBg },
              ]}
            >
              <Text
                style={{
                  color: tokens.text,
                  fontSize: type.body,
                  fontFamily: fontFamily.bodyBold,
                }}
              >

                {currencySymbol}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Measure by percent of budget used"
              onPress={() => setSortBy("budget")}
              style={[
                styles.measureCell,
                { borderRadius: radius.full },
                sortBy === "budget" && { backgroundColor: tokens.chipActiveBg },
              ]}
            >
              <Text
                style={{
                  color: tokens.text,
                  fontSize: type.body,
                  fontFamily: fontFamily.bodyBold,
                }}
              >
                %
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {empty && loading ? (
        <View style={[styles.emptyState, styles.emptyContent]} />
      ) : empty ? (
        <EmptyState
          testID="breakdown-empty"
          title="Nothing spent yet"
          description="Log an expense and it'll land here."
          action={{ label: "Log an expense", onPress: () => router.push("/modals/log-expense") }}
          style={styles.emptyContent}
        />
      ) : (
        <View
          testID="breakdown-reveal-content"
          style={[styles.revealContent, !revealReady && styles.preReveal]}
        >
          <View style={styles.donutWrap}>
            <DonutChart
              key={revealKey}
              segments={segments}
              selectedKey={donutSelectedKey}
              onSelect={onSelectKey}
              revealKey={revealKey}
            >
              {/* Held back until the reveal fires, so the label never sits alone in
                an undrawn ring. Keyed so each swap is a genuine remount, and
                driven by PopIn rather than an `entering` prop: this deep inside a
                ScrollView `entering` may never fire, which left the swap with no
                transition at all. AmountText's own `id` carries the odometer's
                previous value across these remounts. */}
              {play && (
                <PopIn
                  key={`${revealKey}:${selectedKey ?? "__none__"}`}
                  play
                  delay={0}
                  style={styles.centerBlock}
                >
                  {selectedRow ? (
                    <>
                      {selectedRow.emoji ? (
                        <Text style={{ fontSize: 22 }}>{selectedRow.emoji}</Text>
                      ) : null}
                      <AmountText
                        value={selectedRow.spent}
                        size={type.body}
                        weight="bodySemiBold"
                        animate
                        id="insights-donut-center"
                      />
                      <Text
                        style={{
                          color: tokens.text2,
                          fontSize: type.caption,
                          fontFamily: fontFamily.bodyMedium,
                        }}
                      >
                        {selectedRow.pct.toFixed(0)}%
                      </Text>
                    </>
                  ) : hasCustomFilter ? (
                    <>
                      <Text
                        style={{
                          color: tokens.text2,
                          fontSize: 11,
                          fontFamily: fontFamily.bodyMedium,
                        }}
                      >
                        Filtered total
                      </Text>
                      <AmountText
                        value={displayTotal}
                        size={type.body}
                        weight="bodySemiBold"
                        animate
                        id="insights-donut-center"
                      />
                    </>
                  ) : centerDelta ? (
                    <>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                        }}
                      >
                        <View
                          style={{
                            transform: [
                              {
                                rotate:
                                  centerDelta.deltaPct! > 0 ? "-90deg" : "90deg",
                              },
                            ],
                          }}
                        >
                          <Play
                            size={12}
                            color={
                              centerDelta.deltaPct! > 0
                                ? tokens.coral
                                : tokens.mint
                            }
                            fill={
                              centerDelta.deltaPct! > 0
                                ? tokens.coral
                                : tokens.mint
                            }
                          />
                        </View>
                        <Text
                          style={{
                            color:
                              centerDelta.deltaPct! > 0
                                ? tokens.coral
                                : tokens.mint,
                            fontSize: type.body,
                            fontFamily: fontFamily.bodySemiBold,
                          }}
                        >
                          {Math.abs(centerDelta.deltaPct!).toFixed(0)}%
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: tokens.text2,
                          fontSize: 10,
                          lineHeight: 13,
                          fontFamily: fontFamily.bodyMedium,
                          textAlign: "center",
                        }}
                      >
                        {formatCurrency(
                          Math.abs(centerDelta.spent - centerDelta.baseline!),
                          hideAmounts,
                        )}{" "}
                        {centerDelta.deltaPct! > 0 ? "more" : "less"} than usual
                      </Text>
                    </>
                  ) : displayRows[0] ? (
                    <>
                      {displayRows[0].emoji ? (
                        <Text style={{ fontSize: 22 }}>
                          {displayRows[0].emoji}
                        </Text>
                      ) : null}
                      <Text
                        style={{
                          color: tokens.text,
                          fontSize: type.body,
                          fontFamily: fontFamily.bodySemiBold,
                        }}
                      >
                        {displayRows[0].label}
                      </Text>
                      <Text
                        style={{
                          color: tokens.text2,
                          fontSize: type.caption,
                          fontFamily: fontFamily.bodyMedium,
                        }}
                      >
                        {displayRows[0].pct.toFixed(0)}%
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        style={{
                          color: tokens.text2,
                          fontSize: type.caption,
                          fontFamily: fontFamily.bodyMedium,
                        }}
                      >
                        Total
                      </Text>
                      <Text
                        style={{
                          color: tokens.text,
                          fontSize: type.body,
                          fontFamily: fontFamily.bodySemiBold,
                        }}
                      >
                        {formatCurrency(displayTotal, hideAmounts)}
                      </Text>
                    </>
                  )}
                </PopIn>
              )}
            </DonutChart>
          </View>

          <View style={{ marginTop: space.md, gap: space.sm }}>
            {visibleRows.map((row, i) => {
              const color = colorByKey.get(row.key) ?? tokens.text3;
              const isSelected = selectedKey === row.key;
              const hasBudget = !row.assignedIsCarried && row.assigned > 0;
              const rowDelay =
                ROW_START_DELAY + Math.min(i, ROW_STAGGER_CAP) * ROW_STAGGER_MS;
              return (
                // The revealKey prefix is what makes the row remount on a replay:
                // PopIn and BudgetBar both read `play`/`delay` on their own mount
                // only, so a fresh instance is how they run again.
                <Reanimated.View
                  key={row.key}
                  layout={LIST_TRANSITION}
                  exiting={FadeOut.duration(160)}
                >
                  <PopIn
                    key={`${revealKey}:${row.key}`}
                    play={play}
                    delay={rowDelay}
                  >
                    <Pressable
                      onPress={() => onSelectKey(isSelected ? null : row.key)}
                      style={[
                        isSelected && { opacity: 1 },
                        !isSelected && selectedKey != null && { opacity: 0.5 },
                      ]}
                    >
                      <View style={styles.legendTop}>
                        {/* Dot stays even when there's an emoji: it's the only thing
                      tying this row to its wedge in the donut above. */}
                        <View
                          style={[styles.legendDot, { backgroundColor: color }]}
                        />
                        {row.emoji ? (
                          <Text style={{ fontSize: 13 }}>{row.emoji}</Text>
                        ) : null}
                        <Text
                          style={[
                            styles.legendLabel,
                            {
                              color: tokens.text,
                              fontFamily: fontFamily.bodyMedium,
                              fontSize: type.caption,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {row.label}
                        </Text>
                        <Text
                          style={{
                            color: tokens.text,
                            fontSize: type.caption,
                            fontFamily: fontFamily.bodySemiBold,
                          }}
                        >
                          {formatCurrency(row.spent, hideAmounts)}
                        </Text>
                        {row.deltaPct != null && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              minWidth: 32,
                              gap: 2,
                            }}
                          >
                            <View
                              style={{
                                transform: [
                                  {
                                    rotate: row.deltaPct > 0 ? "-90deg" : "90deg",
                                  },
                                ],
                              }}
                            >
                              <Play
                                size={8}
                                color={
                                  row.deltaPct > 0 ? tokens.coral : tokens.mint
                                }
                                fill={
                                  row.deltaPct > 0 ? tokens.coral : tokens.mint
                                }
                              />
                            </View>
                            <Text
                              style={{
                                color:
                                  row.deltaPct > 0 ? tokens.coral : tokens.mint,
                                fontSize: 10,
                                fontFamily: fontFamily.bodySemiBold,
                              }}
                            >
                              {Math.abs(row.deltaPct).toFixed(0)}%
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ marginTop: space.xs }}>
                        {hasBudget ? (
                          <BudgetBar
                            spent={row.spent}
                            assigned={row.assigned}
                            color={color}
                            tokens={tokens}
                            play={play}
                            delay={rowDelay + BAR_OFFSET_MS}
                          />
                        ) : (
                          <View
                            style={[
                              styles.barTrack,
                              { backgroundColor: tokens.borderStrong },
                            ]}
                          />
                        )}
                      </View>
                      <Text
                        style={{
                          color: tokens.text3,
                          fontSize: 11,
                          fontFamily: fontFamily.bodyMedium,
                          marginTop: 6,
                        }}
                      >
                        {hasBudget
                          ? `${formatCurrency(row.spent, hideAmounts)} of ${formatCurrency(row.assigned, hideAmounts)}`
                          : "No budget set"}
                      </Text>
                      {isSelected && mode === "category" && (
                        <Pressable
                          hitSlop={8}
                          onPress={() =>
                            router.push({
                              pathname: "/(tabs)/activity",
                              params: { category: row.key },
                            })
                          }
                        >
                          <Text
                            style={{
                              color: tokens.accent,
                              fontSize: 11,
                              fontFamily: fontFamily.bodySemiBold,
                              marginTop: 4,
                            }}
                          >
                            View transactions ›
                          </Text>
                        </Pressable>
                      )}
                    </Pressable>
                  </PopIn>
                </Reanimated.View>
              );
            })}
            {!expanded && collapsedCount > 0 && (
              <Pressable onPress={() => setExpanded(true)}>
                <Text
                  style={{
                    color: tokens.accent,
                    fontSize: type.caption,
                    fontFamily: fontFamily.bodySemiBold,
                  }}
                >
                  Other ({collapsedCount})
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <View
        style={[
          styles.leftoverRow,
          {
            borderTopColor: tokens.border,
            marginTop: space.md,
            paddingTop: space.md,
          },
        ]}
      >
        <Text
          style={{
            color: tokens.text2,
            fontSize: type.caption,
            fontFamily: fontFamily.bodyMedium,
          }}
        >
          Income left in {monthLabel}
        </Text>
        <Text
          style={{
            color: tokens.text,
            fontSize: type.body,
            fontFamily: fontFamily.bodySemiBold,
          }}
        >
          {formatCurrency(leftover, hideAmounts)}
        </Text>
      </View>

      <BottomSheet
        visible={filterOpen}
        onClose={() => {
          setFilterOpen(false);
          setDraftIncludedCategoryKeys(null);
          setDraftIncludedGroupKeys(null);
        }}
      >
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: tokens.text,
                fontSize: type.bodyLg,
                fontFamily: fontFamily.displaySemiBold,
              }}
            >
              Filter chart
            </Text>
            <Text
              style={{
                color: tokens.text2,
                fontSize: type.caption,
                fontFamily: fontFamily.bodyMedium,
                marginTop: 3,
              }}
            >
              Choose what appears in this chart
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${allDraftItemsSelected ? "Deselect" : "Select"} all ${filterTab === "category" ? "categories" : "groups"}`}
            onPress={toggleAllDraftKeys}
            hitSlop={8}
          >
            <Text
              style={{
                color: tokens.accent,
                fontSize: type.caption,
                fontFamily: fontFamily.bodySemiBold,
              }}
            >
              {allDraftItemsSelected ? "Deselect all" : "Select all"}
            </Text>
          </Pressable>
        </View>

        <View
          accessibilityRole="tablist"
          style={[
            styles.filterTabs,
            { backgroundColor: tokens.inputBg, borderRadius: radius.full },
          ]}
        >
          {(
            [
              ["category", "Categories"],
              ["group", "Groups"],
            ] as const
          ).map(([tab, label]) => {
            const active = filterTab === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setFilterTab(tab)}
                style={[
                  styles.filterTab,
                  { borderRadius: radius.full },
                  active && { backgroundColor: tokens.chipActiveBg },
                ]}
              >
                <Text
                  style={{
                    color: active ? tokens.text : tokens.text2,
                    fontSize: type.caption,
                    fontFamily: active
                      ? fontFamily.bodySemiBold
                      : fontFamily.bodyMedium,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={[styles.filterList, { borderColor: tokens.border }]}
          showsVerticalScrollIndicator={false}
        >
          {filterRows.map((row, index) => {
            const checked = draftIncludedKeys?.has(row.key) ?? false;
            return (
              <Reanimated.View
                key={row.key}
                layout={LIST_TRANSITION}
                entering={FadeIn.duration(150)}
                exiting={FadeOut.duration(120)}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={row.label}
                  accessibilityState={{ checked }}
                  onPress={() => toggleDraftKey(row.key)}
                  style={[
                    styles.filterOption,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: tokens.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.legendDot,
                      {
                        backgroundColor: colorByKey.get(row.key) ?? tokens.text3,
                      },
                    ]}
                  />
                  {row.emoji ? (
                    <Text style={{ fontSize: 16 }}>{row.emoji}</Text>
                  ) : null}
                  <Text
                    style={{
                      flex: 1,
                      color: tokens.text,
                      fontSize: type.body,
                      fontFamily: fontFamily.bodyMedium,
                    }}
                  >
                    {row.label}
                  </Text>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: checked
                          ? tokens.accent
                          : tokens.borderStrong,
                      },
                      checked && { backgroundColor: tokens.accent },
                    ]}
                  >
                    {checked ? (
                      <Check size={14} color={tokens.onAccent} strokeWidth={3} />
                    ) : null}
                  </View>
                </Pressable>
              </Reanimated.View>
            );
          })}
        </ScrollView>

        {!hasDraftVisibleCategory && (
          <Text
            style={{
              color: tokens.coral,
              fontSize: 11,
              fontFamily: fontFamily.bodyMedium,
              marginTop: 8,
            }}
          >
            Keep at least one item in the chart.
          </Text>
        )}
        <View style={styles.sheetActions}>
          <Button
            label="Cancel"
            variant="secondary"
            style={styles.sheetButton}
            onPress={() => {
              setFilterOpen(false);
              setDraftIncludedCategoryKeys(null);
              setDraftIncludedGroupKeys(null);
            }}
          />
          <Button
            label="Apply"
            style={[styles.sheetButton, { backgroundColor: tokens.accent }]}
            disabled={!hasDraftVisibleCategory}
            onPress={applyFilter}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  breakdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerFilterButton: {
    minWidth: 38,
    height: 38,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  toggleGroup: { flexDirection: "row", gap: 2, padding: 3 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  controlsRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  measureToggle: { flexDirection: "row", width: 64, padding: 3, gap: 2 },
  measureCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
  },
  donutWrap: { alignItems: "center", marginTop: 16 },
  emptyState: { alignItems: "center", paddingVertical: 44 },
  emptyContainer: { minHeight: 480 },
  emptyContent: { flex: 1 },
  revealContent: { opacity: 1 },
  preReveal: { opacity: 0 },
  // Capped to the donut's inner hole (200 size, 28 thickness) so long
  // captions like the delta line wrap instead of spilling past the ring.
  centerBlock: { alignItems: "center", width: 118 },
  legendTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendLabel: { flex: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  barTrack: { height: 6, borderRadius: 100, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 100 },
  leftoverRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 14,
  },
  filterTabs: {
    flexDirection: "row",
    padding: 3,
    gap: 2,
    marginBottom: 12,
  },
  filterTab: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterList: {
    maxHeight: 340,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
  },
  filterOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  sheetButton: { flex: 1 },
});
