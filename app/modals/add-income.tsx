import { useCurrency } from '@/src/context/CurrencyContext'
import { CheckIcon } from "@/src/components/shared/CheckIcon";
import { AmountText } from "@/src/components/ui/AmountText";
import { Numpad } from "@/src/components/ui/Numpad";
import { useAmountEntry } from "@/src/components/ui/useAmountEntry";
import { useBudgets } from "@/src/hooks/useBudgets";
import { useAddIncome } from "@/src/hooks/useIncomes";
import { liveAccounts, useAccounts } from "@/src/hooks/useAccounts";
import { AccountChips } from "@/src/components/shared/AccountChips";
import * as Crypto from "expo-crypto";
import { EMPTY } from "@/src/lib/constants";
import { computeEnvelopeState, currentMonthKey, monthLabel } from "@/src/lib/envelope";
import { usePrivacy } from "@/src/context/PrivacyContext";

import { fontFamily } from "@/src/theme/fonts";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
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
 * next month doesn't repeat it. Same layout as edit-month-income.tsx. */
export default function AddIncomeModal() {
  const month = currentMonthKey();
  const { formatCurrency, formatAmountInput } = useCurrency()
  const { hideAmounts } = usePrivacy();

  const { tokens, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const budgets = useBudgets().data ?? EMPTY;
  const addIncome = useAddIncome();
  const accounts = liveAccounts(useAccounts().data);
  const [label, setLabel] = useState("");
  const [accountId, setAccountId] = useState("");
  const [clientId] = useState(() => Crypto.randomUUID());

  const {
    amount: amountText,
    setAmount: setAmountText,
    pushDigit,
    handleBackspace,
    shake,
  } = useAmountEntry("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const value = Number(amountText) || 0;
  // Expenses don't change income or what's assigned, so budgets alone are enough here.
  const state = computeEnvelopeState(budgets, EMPTY, month, EMPTY, EMPTY);
  const detail =
    state.incomeExtra === 0
      ? `${formatCurrency(state.incomeBase, hideAmounts)} monthly`
      : `${formatCurrency(state.incomeBase, hideAmounts)} monthly · ${formatCurrency(state.incomeExtra, hideAmounts)} extra`;

  async function submit() {
    if (value <= 0 || saving) return;
    setSaving(true);
    setError("");
    try {
      // The server records it and moves this month's extra in one write
      // (Web/lib/income.ts); the client id makes a retried save count once.
      await addIncome.mutateAsync({
        amount: value,
        label: label.trim() || "Extra income",
        ...(accountId ? { account_id: accountId } : {}),
        client_id: clientId,
      });
      setSuccess(true);
    } catch {
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
          Add income
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
              ADDING
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
            {value > 0
              ? `Ready to Assign ${formatCurrency(state.readyToAssign + value, hideAmounts)} · this month only`
              : "What came in on top of your monthly income"}
          </Reanimated.Text>
        </View>

        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="What was it? A bonus, a refund, a gift…"
          placeholderTextColor={tokens.text3}
          maxLength={200}
          accessibilityLabel="What was it"
          style={{
            borderWidth: 1,
            borderColor: tokens.border,
            backgroundColor: tokens.inputBg,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: space.sm + 2,
            color: tokens.text,
            fontFamily: fontFamily.bodyMedium,
            fontSize: type.body,
          }}
        />

        {accounts.length > 0 && (
          <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} allowNone label="Paid into" />
        )}

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
              backgroundColor: success ? tokens.mint : tokens.accent,
              borderRadius: radius.full,
              opacity: saving || value <= 0 ? 0.5 : 1,
            },
          ]}
          onPress={submit}
          disabled={saving || success || value <= 0}
        >
          {success ? (
            <CheckIcon color={tokens.onAccent} size={16} />
          ) : (
            <Text
              style={{
                color: tokens.onAccent,
                fontFamily: fontFamily.bodyBold,
                fontSize: type.body,
              }}
            >
              {saving ? "Saving…" : "Add"}
            </Text>
          )}
        </Pressable>
      </View>
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
  confirmButton: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
});
