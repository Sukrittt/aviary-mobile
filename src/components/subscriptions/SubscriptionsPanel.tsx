import { useCurrency } from '@/src/context/CurrencyContext'
import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
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

interface Props {
  subscriptions: SubscriptionRow[];
  loading?: boolean;
}

const CHEVRON_SPRING = { damping: 64, stiffness: 600 };

const BRAND_COLORS: Record<string, { solid: string; soft: string }> = {
  netflix: { solid: "#E50914", soft: "rgba(229, 9, 20, 0.22)" },
  hotstar: { solid: "#0C3B7C", soft: "rgba(12, 59, 124, 0.22)" },
  "disney+": { solid: "#0C3B7C", soft: "rgba(12, 59, 124, 0.22)" },
  prime: { solid: "#00A8E1", soft: "rgba(0, 168, 225, 0.22)" },
  "amazon prime": { solid: "#00A8E1", soft: "rgba(0, 168, 225, 0.22)" },
  spotify: { solid: "#1DB954", soft: "rgba(29, 185, 84, 0.22)" },
  apple: { solid: "#A2AAAD", soft: "rgba(162, 170, 173, 0.22)" },
  "apple music": { solid: "#FA2D48", soft: "rgba(250, 45, 72, 0.22)" },
  "apple tv": { solid: "#A2AAAD", soft: "rgba(162, 170, 173, 0.22)" },
  youtube: { solid: "#FF0000", soft: "rgba(255, 0, 0, 0.22)" },
  "youtube premium": { solid: "#FF0000", soft: "rgba(255, 0, 0, 0.22)" },
  google: { solid: "#4285F4", soft: "rgba(66, 133, 244, 0.22)" },
  "google one": { solid: "#4285F4", soft: "rgba(66, 133, 244, 0.22)" },
  microsoft: { solid: "#00A4EF", soft: "rgba(0, 164, 239, 0.22)" },
  office: { solid: "#D83B01", soft: "rgba(216, 59, 1, 0.22)" },
  "microsoft 365": { solid: "#D83B01", soft: "rgba(216, 59, 1, 0.22)" },
  notion: { solid: "#FFFFFF", soft: "rgba(255, 255, 255, 0.22)" },
  slack: { solid: "#4A154B", soft: "rgba(74, 21, 75, 0.22)" },
  discord: { solid: "#5865F2", soft: "rgba(88, 101, 242, 0.22)" },
  figma: { solid: "#A259FF", soft: "rgba(162, 89, 255, 0.22)" },
  canva: { solid: "#00C4CC", soft: "rgba(0, 196, 204, 0.22)" },
  adobe: { solid: "#FF0000", soft: "rgba(255, 0, 0, 0.22)" },
  dropbox: { solid: "#0061FF", soft: "rgba(0, 97, 255, 0.22)" },
  twitch: { solid: "#9146FF", soft: "rgba(145, 70, 255, 0.22)" },
  hulu: { solid: "#1CE783", soft: "rgba(28, 231, 131, 0.22)" },
  "hbo max": { solid: "#B537F2", soft: "rgba(181, 55, 242, 0.22)" },
  max: { solid: "#002BE7", soft: "rgba(0, 43, 231, 0.22)" },
  jio: { solid: "#0A2F8F", soft: "rgba(10, 47, 143, 0.22)" },
  jiocinema: { solid: "#0A2F8F", soft: "rgba(10, 47, 143, 0.22)" },
  airtel: { solid: "#ED1C24", soft: "rgba(237, 28, 36, 0.22)" },
  zee5: { solid: "#8B2FC9", soft: "rgba(139, 47, 201, 0.22)" },
  sonyliv: { solid: "#0066CC", soft: "rgba(0, 102, 204, 0.22)" },
  voot: { solid: "#E4002B", soft: "rgba(228, 0, 43, 0.22)" },
  github: { solid: "#6e40c9", soft: "rgba(110, 64, 201, 0.22)" },
  chatgpt: { solid: "#10A37F", soft: "rgba(16, 163, 127, 0.22)" },
  openai: { solid: "#10A37F", soft: "rgba(16, 163, 127, 0.22)" },
  mastercard: { solid: "#EB001B", soft: "rgba(235, 0, 27, 0.22)" },
  visa: { solid: "#1A1F71", soft: "rgba(26, 31, 113, 0.22)" },
};

function brandColor(service: string): { solid: string; soft: string } | null {
  const lower = service.toLowerCase();
  for (const [key, val] of Object.entries(BRAND_COLORS)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

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

function rollForward(dateStr: string, cycle: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  if (/yearly|annual/i.test(cycle)) d.setFullYear(d.getFullYear() + 1);
  else if (/quarterly/i.test(cycle)) d.setMonth(d.getMonth() + 3);
  else if (/weekly/i.test(cycle)) d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// ponytail: skips web's renewal_or_end_month/timestamp fallback chain for subs
// missing next_due_date — add if mobile-added subs start missing that field.
function effectiveDueDate(sub: SubscriptionRow): string {
  if (!sub.next_due_date) return "";
  let d = new Date(sub.next_due_date);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  while (d <= now) {
    const rolled = rollForward(d.toISOString().slice(0, 10), sub.billing_cycle);
    if (!rolled) break;
    d = new Date(rolled);
  }
  return d.toISOString().slice(0, 10);
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
    const days = Math.round((new Date(due).getTime() - Date.now()) / 86400000);
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
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
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
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
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

  const active = useMemo(
    () =>
      subscriptions
        .filter((s) => /^active/i.test(s.status))
        .sort((a, b) => monthlyEq(b) - monthlyEq(a)),
    [subscriptions],
  );
  const cancelled = useMemo(
    () => subscriptions.filter((s) => !/^active/i.test(s.status)),
    [subscriptions],
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

  if (loading) {
    return (
      <View
        style={{ marginTop: space.md, height: 250, justifyContent: "center" }}
      >
        <LoadingCaption phrases={SUBSCRIPTION_PHRASES} />
      </View>
    );
  }

  if (subscriptions.length === 0) {
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
              <Icon icon={ChevronRight} size={14} color={tokens.text3} />
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
  eyebrow: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
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
  sectionTitle: { fontSize: 11, letterSpacing: 0.5 },
});
