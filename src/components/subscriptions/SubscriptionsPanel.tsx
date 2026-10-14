import { useCurrency } from '@/src/context/CurrencyContext'
import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { CaretRight } from "@/src/components/shared/icons";
import Reanimated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeProvider";
import { usePrivacy } from "@/src/context/PrivacyContext";
import { fontFamily } from "@/src/theme/fonts";
import { formatDateShort } from "@/src/lib/format"
import { toLocalDateString } from "@/src/lib/date"
import { AmountText } from "@/src/components/ui/AmountText";
import {
  AllocationBar,
  type AllocationSegment,
} from "@/src/components/charts/AllocationBar";
import { usePressSpring } from "@/src/components/ui/Button";
import { Icon } from "@/src/components/shared/Icon";
import { LoadingCaption } from "@/src/components/shared/LoadingCaption";
import { EmptyState } from "@/src/components/shared/EmptyState";
import type { ThemeTokens } from "@/src/theme/tokens";
import { CHART_COLOR_CYCLE } from "@/src/theme/chartColors";
import type { SubscriptionRow } from "@/src/types";
import { brandColor } from "@/src/lib/subscriptionPresets";
import { FORCE_EMPTY_STATE_PREVIEW, emptyForPreview } from "@/src/lib/emptyStatePreview";
import { tap } from "@/src/lib/haptics";

interface Props {
  subscriptions: SubscriptionRow[];
  loading?: boolean;
}

const CHEVRON_SPRING = { damping: 64, stiffness: 600 };

const SUBSCRIPTION_PHRASES = [
  "Counting your recurring charges…",
  "Tallying up what flows every month…",
  "Finding all the silent deductions…",
  "Mapping your subscription maze…",
  "Crunching the renewal calendar…",
  "Sorting active from cancelled…",
  "Adding up the monthly damage…",
  "Tracking where the auto-debits go…",
  "Checking which bills are due next…",
  "Calculating your commitment level…",
  "Reconciling the subscription ledger…",
  "Hunting down every recurring charge…",
  "Making sense of the billing cycles…",
  "Summing up what you actually use…",
  "Organizing your digital obligations…",
];

function toneColor(i: number, tokens: ThemeTokens): string {
  return tokens[CHART_COLOR_CYCLE[i % CHART_COLOR_CYCLE.length]];
}

function toneSoft(i: number, tokens: ThemeTokens): string {
  const key =
    `${CHART_COLOR_CYCLE[i % CHART_COLOR_CYCLE.length]}Soft` as keyof ThemeTokens;
  return tokens[key];
}

function billedSuffix(cycle: string): string {
  if (cycle === "yearly") return "/yr";
  if (cycle === "quarterly") return "/qtr";
  if (cycle === "weekly") return "/wk";
  return "";
}

function monthlyEq(sub: SubscriptionRow): number {
  const amt = Number(sub.amount_inr) || 0;
  if (/one-time/i.test(sub.billing_cycle)) return 0;
  if (/yearly|annual/i.test(sub.billing_cycle)) return amt / 12;
  if (/quarterly/i.test(sub.billing_cycle)) return amt / 3;
  if (/weekly/i.test(sub.billing_cycle)) return amt * 4.33;
  return amt;
}

function cleanCycle(cycle: string): string {
  if (/one-time/i.test(cycle)) return "one-time";
  if (/monthly/i.test(cycle)) return "monthly";
  if (/yearly|annual/i.test(cycle)) return "yearly";
  if (/quarterly/i.test(cycle)) return "quarterly";
  if (/weekly/i.test(cycle)) return "weekly";
  return cycle;
}

/** `dateStr` advanced `n` cycles on calendar parts, clamping the day to the
 *  target month's length so the 31st lands on Feb 28, then back on Mar 31. */
function rollForward(dateStr: string, cycle: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  if (/weekly/i.test(cycle)) {
    return new Date(Date.UTC(y, mo, d + 7 * n)).toISOString().slice(0, 10);
  }
  const step = /yearly|annual/i.test(cycle) ? 12 : /quarterly/i.test(cycle) ? 3 : 1;
  const target = new Date(Date.UTC(y, mo + step * n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// ponytail: skips web's renewal_or_end_month/timestamp fallback chain for subs
// missing next_due_date — add if mobile-added subs start missing that field.
function effectiveDueDate(sub: SubscriptionRow): string {
  const today = toLocalDateString();
  let due = rollForward(sub.next_due_date, sub.billing_cycle, 0);
  if (!due || due >= today) return due;
  if (/one-time/i.test(sub.billing_cycle)) return "";
  for (let n = 1; due < today; n++) {
    due = rollForward(sub.next_due_date, sub.billing_cycle, n);
  }
  return due;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function chargeLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

/** Soonest upcoming charge across the active list, for the hero caption. */
function nextCharge(
  active: SubscriptionRow[],
): { service: string; days: number } | null {
  let best: { service: string; days: number } | null = null;
  for (const sub of active) {
    const due = effectiveDueDate(sub);
    if (!due) continue;
    // Both are UTC midnights of calendar dates, so this is an exact day count.
    const days = Math.round(
      (Date.parse(due) - Date.parse(toLocalDateString())) / 86400000,
    );
    if (days < 0) continue;
    if (!best || days < best.days) best = { service: sub.service, days };
  }
  return best;
}

function SubscriptionRowItem({
  sub,
  toneSolid,
  toneSoftColor,
  isActive,
  sharePct,
  onPress,
  onViewTransactions,
}: {
  sub: SubscriptionRow;
  toneSolid: string;
  toneSoftColor: string;
  isActive: boolean;
  /** This sub's share of the active-subscription monthly total, for the
   *  amount column — what the deleted stacked bar + legend used to carry. */
  sharePct?: number;
  onPress: () => void;
  onViewTransactions?: () => void;
}) {
  const { formatCurrency } = useCurrency()

  const { tokens, space, radius, type: t } = useTheme();
  const { hideAmounts } = usePrivacy();
  const press = usePressSpring(0.98);

  const cycle = cleanCycle(sub.billing_cycle);
  const dueDate = isActive ? effectiveDueDate(sub) : "";
  const meta = capitalize(
    isActive
      ? [cycle, dueDate ? `Next ${formatDateShort(dueDate)}` : ""]
          .filter(Boolean)
          .join(" · ")
      : sub.renewal_or_end_month || "n/a",
  );
  // Yearly/quarterly/weekly subs lead with the ₹/mo figure — the number that
  // actually sums into the hero total — with the as-billed amount secondary.
  const showMonthlyEquiv =
    isActive && cycle !== "monthly" && cycle !== "one-time";
  const primaryAmount = showMonthlyEquiv
    ? monthlyEq(sub)
    : Number(sub.amount_inr) || 0;
  const billedText = showMonthlyEquiv
    ? `${formatCurrency(Number(sub.amount_inr) || 0, hideAmounts)}${billedSuffix(cycle)}`
    : null;
  const shareText =
    isActive && sharePct != null ? `${sharePct.toFixed(0)}%` : null;
  const secondaryText = [billedText, shareText].filter(Boolean).join(" · ");

  return (
    <Reanimated.View style={press.style}>
      <Pressable
        onPress={() => {
          tap();
          onPress();
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.row,
          {
            borderTopColor: tokens.border,
            paddingVertical: space.md,
            gap: space.md,
          },
        ]}
      >
        <View
          style={[
            styles.tile,
            { backgroundColor: toneSoftColor, borderRadius: radius.md },
          ]}
        >
          <Text
            style={{
              color: toneSolid,
              fontSize: t.body,
              fontFamily: fontFamily.bodyBold,
            }}
          >
            {sub.service.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              color: tokens.text,
              fontSize: t.body,
              fontFamily: fontFamily.bodySemiBold,
            }}
          >
            {sub.service}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: tokens.text3,
              fontSize: t.caption,
              fontFamily: fontFamily.bodyMedium,
              marginTop: 2,
            }}
          >
            {meta}
          </Text>
          {onViewTransactions ? (
            <Pressable
              hitSlop={8}
              onPress={() => {
                tap();
                onViewTransactions();
              }}
            >
              <Text
                style={{
                  color: toneSolid,
                  fontSize: t.micro,
                  fontFamily: fontFamily.bodySemiBold,
                  marginTop: 3,
                }}
              >
                View transactions ›
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <AmountText
            value={primaryAmount}
            size={t.body}
            weight="bodySemiBold"
          />
          {secondaryText ? (
            <Text
              style={{
                color: tokens.text3,
                fontSize: t.micro,
                fontFamily: fontFamily.bodyMedium,
                marginTop: 2,
              }}
            >
              {secondaryText}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

export function SubscriptionsPanel({ subscriptions, loading }: Props) {
  const { tokens, space, type: t } = useTheme();
  const router = useRouter();
  const [cancelledExpanded, setCancelledExpanded] = useState(false);

  const rows = emptyForPreview(subscriptions);
  const previewLoading = !FORCE_EMPTY_STATE_PREVIEW && loading;

  const active = useMemo(
    () =>
      rows
        .filter((s) => /^active/i.test(s.status))
        .sort((a, b) => monthlyEq(b) - monthlyEq(a)),
    [rows],
  );
  const cancelled = useMemo(
    () => rows.filter((s) => !/^active/i.test(s.status)),
    [rows],
  );

  const totalMonthlyRaw = active.reduce((s, sub) => s + monthlyEq(sub), 0);
  const totalMonthly = Math.round(totalMonthlyRaw);
  const totalYearly = Math.round(totalMonthly * 12);
  const next = useMemo(() => nextCharge(active), [active]);

  const segments: AllocationSegment[] = useMemo(
    () =>
      active.map((sub, i) => {
        const brand = brandColor(sub.service);
        return {
          label: sub.service,
          value: monthlyEq(sub),
          color: brand ? brand.solid : toneColor(i, tokens),
        };
      }),
    [active, tokens],
  );

  function openModal(service?: string) {
    router.push(
      service
        ? { pathname: "/modals/subscription", params: { service } }
        : "/modals/subscription",
    );
  }

  // Same drill-in pattern as an envelope's "View transactions" action
  // (app/(tabs)/index.tsx) — jumps to Activity pre-filtered to the
  // subscription's linked category.
  function viewTransactions(category: string) {
    router.push({
      pathname: "/(tabs)/activity",
      params: { category, period: "month" },
    });
  }

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: withSpring(
          cancelledExpanded ? "90deg" : "0deg",
          CHEVRON_SPRING,
        ),
      },
    ],
  }));

  if (previewLoading) {
    return (
      <View
        style={{ marginTop: space.md, height: 250, justifyContent: "center" }}
      >
        <LoadingCaption phrases={SUBSCRIPTION_PHRASES} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        subject="subscriptions"
        title="Keep tabs on your repeats"
        description="No subscriptions tracked yet."
        action={{ label: "Add a subscription", onPress: () => openModal() }}
        style={{ marginTop: space.md }}
      />
    );
  }

  return (
    <View>
      <Text
        style={[
          styles.eyebrow,
          { color: tokens.text3, fontFamily: fontFamily.bodySemiBold },
        ]}
      >
        RECURRING / MONTH
      </Text>
      <AmountText
        value={totalMonthly}
        size={t.display}
        weight="displayBold"
        style={{ marginTop: 2 }}
      />
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "baseline",
          marginTop: space.xs,
          gap: 2,
        }}
      >
        <Text
          style={{
            color: tokens.text2,
            fontSize: t.caption,
            fontFamily: fontFamily.bodyMedium,
          }}
        >
          ≈
        </Text>
        <AmountText
          value={totalYearly}
          size={t.caption}
          weight="bodyMedium"
          color={tokens.text2}
        />
        <Text
          style={{
            color: tokens.text2,
            fontSize: t.caption,
            fontFamily: fontFamily.bodyMedium,
          }}
        >
          /yr · {active.length} active
          {next ? ` · Next: ${next.service} ${chargeLabel(next.days)}` : ""}
        </Text>
      </View>

      {segments.length >= 3 && (
        <View style={{ marginTop: space.lg }}>
          <AllocationBar segments={segments} />
        </View>
      )}

      <View style={{ marginTop: space.lg }}>
        {active.length === 0 ? (
          <Text
            style={{
              color: tokens.text3,
              fontSize: t.caption,
              fontFamily: fontFamily.bodyMedium,
            }}
          >
            No active subscriptions.
          </Text>
        ) : (
          active.map((sub, i) => {
            const brand = brandColor(sub.service);
            return (
              <SubscriptionRowItem
                key={sub.service}
                sub={sub}
                toneSolid={brand ? brand.solid : toneColor(i, tokens)}
                toneSoftColor={brand ? brand.soft : toneSoft(i, tokens)}
                isActive
                sharePct={
                  totalMonthlyRaw > 0
                    ? (monthlyEq(sub) / totalMonthlyRaw) * 100
                    : 0
                }
                onPress={() => openModal(sub.service)}
                onViewTransactions={
                  sub.category
                    ? () => viewTransactions(sub.category)
                    : undefined
                }
              />
            );
          })
        )}
      </View>

      {cancelled.length > 0 && (
        <Reanimated.View
          layout={LinearTransition}
          style={{
            marginTop: space.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: tokens.border,
            paddingTop: space.sm,
          }}
        >
          <Pressable
            style={styles.sectionHead}
            onPress={() => setCancelledExpanded((e) => !e)}
          >
            <Reanimated.View style={chevronStyle}>
              <Icon icon={CaretRight} size={14} color={tokens.text3} />
            </Reanimated.View>
            <Text style={[styles.sectionTitle, { color: tokens.text3 }]}>
              CANCELLED ({cancelled.length})
            </Text>
          </Pressable>
          {cancelledExpanded && (
            <Reanimated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(120)}
            >
              {cancelled.map((sub) => (
                <SubscriptionRowItem
                  key={sub.service}
                  sub={sub}
                  toneSolid={tokens.text3}
                  toneSoftColor={tokens.inputBg}
                  isActive={false}
                  onPress={() => openModal(sub.service)}
                  onViewTransactions={
                    sub.category
                      ? () => viewTransactions(sub.category)
                      : undefined
                  }
                />
              ))}
            </Reanimated.View>
          )}
        </Reanimated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  tile: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  sectionTitle: { fontSize: 12, fontFamily: fontFamily.bodyBold, letterSpacing: 0.5 },
});
