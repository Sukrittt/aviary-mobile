import { useCurrency } from '@/src/context/CurrencyContext'
import { CheckIcon } from "@/src/components/shared/CheckIcon";
import { AmountText } from "@/src/components/ui/AmountText";
import { Numpad } from "@/src/components/ui/Numpad";
import { useAmountEntry } from "@/src/components/ui/useAmountEntry";
import { useBudgets } from "@/src/hooks/useBudgets";
import { useCategories } from "@/src/hooks/useCategories";
import { useAddIncome, useIncomes, useUpdateIncome } from "@/src/hooks/useIncomes";
import type { IncomeRow } from "@/src/types";
import { liveAccounts, useAccounts } from "@/src/hooks/useAccounts";
import { AccountChips } from "@/src/components/shared/AccountChips";
import { BottomSheet } from "@/src/components/shared/Modal";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { EMPTY } from "@/src/lib/constants";
import { computeEnvelopeState, currentMonthKey, monthLabel } from "@/src/lib/envelope";
import { usePrivacy } from "@/src/context/PrivacyContext";

import { fontFamily } from "@/src/theme/fonts";
import { useTheme } from "@/src/theme/ThemeProvider";
import { INCOME_FLOOD } from "@/src/theme/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Opened from Home's Ready to Assign sheet and the Income screen. Records a
 * one-off in the income ledger; the server adds it to this month's income
 * extra in the same write, so Ready to Assign goes up by exactly that much and
 * next month doesn't repeat it. Same layout as edit-month-income.tsx.
 * With `?id=`, edits that recorded income instead (the Income screen's pencil). */
export default function AddIncomeModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const incomesQ = useIncomes();
  if (!id) return <IncomeForm />;
  const existing = incomesQ.data?.find((r) => r.id === id);
  // The Income screen already loaded the list, so this is only a frame or two.
  if (!existing) return null;
  return <IncomeForm existing={existing} />;
}

/** `flood`: the green full-screen take opened from log-expense and the nav's quick-add menu (quick-income.tsx). */
export function IncomeForm({ existing, flood = false }: { existing?: IncomeRow; flood?: boolean }) {
  const month = currentMonthKey();
  const { formatCurrency, formatAmountInput } = useCurrency()
  const { hideAmounts } = usePrivacy();

  const { tokens: theme, space, radius, type } = useTheme();
  // On the flood everything goes white on green, the way log-expense goes white on accent.
  // The green itself is quick-income.tsx's disc, drawn behind this transparent form.
  const onFlood = "rgba(255, 255, 255, 0.7)";
  const fieldBg = "rgba(255, 255, 255, 0.16)";
  const tokens = flood
    ? { ...theme, bg: "transparent", text: "#ffffff", text2: onFlood, text3: onFlood, card: fieldBg, border: "transparent", accent: "#ffffff", accentSoft: fieldBg, coral: "#ffffff" }
    : theme;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const budgetsQ = useBudgets();
  const categoriesQ = useCategories();
  const budgets = budgetsQ.data ?? EMPTY;
  const categories = categoriesQ.data ?? EMPTY;
  // Without both lists the preview would read as income plus the typed value.
  const canPreview = budgetsQ.data !== undefined && categoriesQ.data !== undefined;
  const addIncome = useAddIncome();
  const updateIncome = useUpdateIncome();
  const accounts = liveAccounts(useAccounts().data);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [accountId, setAccountId] = useState(existing?.account_id ?? "");
  const [clientId] = useState(() => Crypto.randomUUID());
  // Label and account are optional, so they live behind "More" like log-expense.tsx.
  const [showMore, setShowMore] = useState(false);

  const {
    amount: amountText,
    setAmount: setAmountText,
    pushDigit,
    handleBackspace,
    shake,
  } = useAmountEntry(existing ? String(Number(existing.amount) || "") : "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const value = Number(amountText) || 0;
  // Expenses and groups don't change income or what's assigned, but the
  // category list owns envelope membership, so without it nothing counts as
  // assigned and Ready to Assign collapses to income.
  const state = computeEnvelopeState(budgets, EMPTY, month, categories, EMPTY);
  const detail =
    state.incomeExtra === 0
      ? `${formatCurrency(state.incomeBase, hideAmounts)} monthly`
      : `${formatCurrency(state.incomeBase, hideAmounts)} monthly · ${formatCurrency(state.incomeExtra, hideAmounts)} extra`;

  // A payday on the monthly schedule is already counted by the monthly income, so editing it moves nothing.
  const countsAsExtra = !existing || existing.counted === "extra";
  const change = value - (existing ? Number(existing.amount) || 0 : 0);
  const hint = !countsAsExtra
    ? "This only changes the record. Your monthly income still counts."
    : value > 0 && canPreview
      ? `Ready to Assign ${formatCurrency(state.readyToAssign + change, hideAmounts)} · This month only`
      : "What came in on top of your monthly income";

  async function submit() {
    if (value <= 0 || saving) return;
    setSaving(true);
    setError("");
    try {
      // The server records it and moves this month's extra in one write
      // (Web/lib/income.ts); the client id makes a retried save count once.
      if (existing) {
        await updateIncome.mutateAsync({
          id: existing.id,
          version: existing.version,
          // The account goes only when it changed: an archived one the row still names would fail the save.
          updates: { amount: value, label: label.trim() || existing.label, ...(accountId !== existing.account_id ? { account_id: accountId } : {}) },
        });
      } else {
        await addIncome.mutateAsync({
          amount: value,
          label: label.trim() || "Extra income",
          ...(accountId ? { account_id: accountId } : {}),
          client_id: clientId,
        });
      }
      setSuccess(true);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  // Let the inline checkmark finish drawing before navigating back.
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => router.back(), 1100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + space.sm,
            paddingHorizontal: space.lg,
            gap: space.md,
            borderBottomColor: tokens.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={12}
          style={[
            styles.headerBtn,
            {
              backgroundColor: tokens.card,
              borderColor: tokens.border,
              borderRadius: radius.full,
            },
          ]}
        >
          <X size={16} color={tokens.text} />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            {
              color: tokens.text,
              fontFamily: fontFamily.displaySemiBold,
              fontSize: type.body,
            },
          ]}
        >
          {existing ? "Edit income" : "Add income"}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: space.lg,
          gap: space.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={[
            styles.stepLabel,
            {
              color: tokens.text3,
              fontFamily: fontFamily.bodySemiBold,
              fontSize: type.micro,
            },
          ]}
        >
          {monthLabel(month).toUpperCase()}
        </Text>
        {/* Mirrors move-money.tsx's DestinationCard so the top half isn't empty. */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: tokens.card,
              borderColor: tokens.border,
              borderRadius: radius.lg,
              padding: space.md,
              gap: space.md,
            },
          ]}
        >
          <View
            style={[
              styles.cardIcon,
              { backgroundColor: tokens.accentSoft, borderRadius: radius.md },
            ]}
          >
            <Text style={{ fontSize: type.title }}>💰</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={[
                styles.stepLabel,
                {
                  color: tokens.text3,
                  fontFamily: fontFamily.bodySemiBold,
                  fontSize: type.micro,
                },
              ]}
            >
              {existing ? "EDITING" : "ADDING"}
            </Text>
            <Text
              style={{
                color: tokens.text,
                fontFamily: fontFamily.displaySemiBold,
                fontSize: type.body,
              }}
            >
              Income
            </Text>
            <Text
              style={{
                color: tokens.text2,
                fontFamily: fontFamily.bodyMedium,
                fontSize: type.caption,
              }}
            >
              {detail}
            </Text>
          </View>
        </View>

        <View style={[styles.amountWrap, { gap: space.sm }]}>
          <Animated.View
            style={{
              transform: [
                {
                  translateX: shake.interpolate({
                    inputRange: [-1, 1],
                    outputRange: [-8, 8],
                  }),
                },
              ],
            }}
          >
            <AmountText
              value={value}
              rawText={formatAmountInput(amountText)}
              size={type.hero}
              weight="displayBold"
              animate
              ignoreHide
              color={flood ? "#ffffff" : undefined}
            />
          </Animated.View>
          <Reanimated.Text
            entering={FadeIn.duration(150)}
            style={{
              color: tokens.text2,
              fontSize: type.caption,
              fontFamily: fontFamily.bodyMedium,
              textAlign: "center",
            }}
          >
            {hint}
          </Reanimated.Text>
        </View>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setShowMore(true);
          }}
          style={[styles.moreToggle, { gap: space.xs }]}
          hitSlop={8}
        >
          <Text
            style={{
              color: tokens.accent,
              fontFamily: fontFamily.bodySemiBold,
              fontSize: type.caption,
            }}
          >
            More
          </Text>
          <ChevronDown size={16} color={tokens.accent} />
        </Pressable>

        {error !== "" && (
          <Text style={{ color: tokens.coral, fontSize: 12 }}>{error}</Text>
        )}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: space.lg,
          paddingTop: space.sm,
          paddingBottom: insets.bottom + space.sm,
          gap: space.md,
        }}
      >
        <Numpad
          onAccent={flood}
          extraKey="."
          onDigit={pushDigit}
          onBackspace={handleBackspace}
          onClear={() => setAmountText("")}
          disabled={saving || success}
        />
        <Pressable
          style={[
            styles.confirmButton,
            {
              // On the flood a mint success fill would vanish, so the white button stays and the check goes green.
              backgroundColor: flood ? "#ffffff" : success ? tokens.mint : tokens.accent,
              borderRadius: radius.full,
              opacity: saving || value <= 0 ? 0.5 : 1,
            },
          ]}
          onPress={submit}
          disabled={saving || success || value <= 0}
        >
          {success ? (
            <CheckIcon color={flood ? INCOME_FLOOD : tokens.onAccent} size={16} />
          ) : (
            <Text
              style={{
                color: flood ? INCOME_FLOOD : tokens.onAccent,
                fontFamily: fontFamily.bodyBold,
                fontSize: type.body,
              }}
            >
              {saving ? "Saving…" : existing ? "Save" : "Add"}
            </Text>
          )}
        </Pressable>
      </View>

      <BottomSheet visible={showMore} onClose={() => setShowMore(false)}>
        <Text
          style={{
            color: theme.text,
            fontFamily: fontFamily.displaySemiBold,
            fontSize: type.bodyLg,
            marginBottom: 12,
          }}
        >
          More details
        </Text>
        <View style={{ gap: space.lg }}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="What was it? A bonus, a refund, a gift…"
            placeholderTextColor={theme.text3}
            maxLength={200}
            accessibilityLabel="What was it"
            style={{
              backgroundColor: theme.inputBg,
              borderRadius: radius.md,
              paddingHorizontal: 14,
              paddingVertical: 14,
              color: theme.text,
              fontFamily: fontFamily.bodyMedium,
              fontSize: type.body,
            }}
          />
          {accounts.length > 0 && (
            <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} allowNone label="Paid into" />
          )}
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
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, textAlign: "right" },
  stepLabel: { letterSpacing: 0.6 },
  card: { flexDirection: "row", alignItems: "center", borderWidth: 1 },
  cardIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  amountWrap: { alignItems: "center", paddingVertical: 8 },
  moreToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  confirmButton: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
});
