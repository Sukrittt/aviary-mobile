import { CarryFailed } from '@/src/components/shared/CarryFailed';
import { useCurrency } from '@/src/context/CurrencyContext'
import { CheckIcon } from "@/src/components/shared/CheckIcon";
import { BudgetConflictReview } from "@/src/features/budgets/BudgetConflictReview";
import { AmountText } from "@/src/components/ui/AmountText";
import { Numpad } from "@/src/components/ui/Numpad";
import { useAmountEntry } from "@/src/components/ui/useAmountEntry";
import { usePrivacy } from "@/src/context/PrivacyContext";
import { useBudgets, useCarry, useUpdateBudget } from "@/src/hooks/useBudgets";
import { useCategories } from "@/src/hooks/useCategories";
import { useRecentExpenses } from "@/src/hooks/useExpenses";
import { useGroups } from "@/src/hooks/useGroups";
import { EMPTY } from "@/src/lib/constants";
import { BudgetWriteError } from "@/src/lib/budgetConflict";
import { amountSeed } from "@/src/lib/calcAmount";
import type { BudgetRow } from "@/src/types";
import {
  computeEnvelopeState,
  currentMonthKey,
  extraForReadyToAssign,
  INCOME_CATEGORY,
  monthLabel,
} from "@/src/lib/envelope";

import { fontFamily } from "@/src/theme/fonts";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useRouter } from "expo-router";
import { MoneyWavy, X } from "@/src/components/shared/icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withReadOnlyGate } from "@/src/components/budgets/ReadOnlyNotice";
import { Icon } from "@/src/components/shared/Icon";

/** Opened from the Ready to Assign options sheet on Home. The user types the RTA
 * they actually have, and the difference lands in this month's income extra:
 * the monthly income stays as is, so next month doesn't inherit a one-off
 * correction. Same layout as edit-assigned-amount.tsx. */
function EditReadyToAssignModal() {
  const { tokens } = useTheme();
  const budgetsQ = useBudgets();
  const carryQ = useCarry(currentMonthKey());
  const expensesQ = useRecentExpenses();
  const categoriesQ = useCategories();
  const groupsQ = useGroups();

  if (
    budgetsQ.isLoading ||
    expensesQ.isLoading ||
    categoriesQ.isLoading ||
    groupsQ.isLoading ||
    carryQ.isLoading
  ) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: tokens.bg },
        ]}
      >
        <ActivityIndicator color={tokens.accentInk} />
      </View>
    );
  }
  if (carryQ.isError && carryQ.data === undefined) return <CarryFailed />;

  const month = currentMonthKey();
  const state = computeEnvelopeState(
    budgetsQ.data ?? EMPTY,
    expensesQ.data ?? EMPTY,
    month,
    categoriesQ.data ?? EMPTY,
    groupsQ.data ?? EMPTY,
    undefined,
    carryQ.data,
  );

  // Mounted only once data has settled, so the numpad seeds from the real RTA.
  return (
    <EditReadyToAssignBody
      month={month}
      income={state.income}
      incomeBase={state.incomeBase}
      totalAssigned={state.totalAssigned}
      readyToAssign={state.readyToAssign}
      carried={state.carriedReadyToAssign}
      version={(budgetsQ.data ?? EMPTY).find((b) => b.month === month && b.category === INCOME_CATEGORY)?.version ?? 0}
    />
  );
}

function EditReadyToAssignBody({
  month,
  income,
  incomeBase: initialIncomeBase,
  totalAssigned,
  readyToAssign,
  carried,
  version,
}: {
  month: string;
  income: number;
  incomeBase: number;
  totalAssigned: number;
  readyToAssign: number;
  /** What Ready to Assign brought in from last month. */
  carried: number;
  version: number;
}) {
  const { formatCurrency, formatAmountInput } = useCurrency()

  const { tokens, space, radius, type } = useTheme();
  const { hideAmounts } = usePrivacy();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const updateBudget = useUpdateBudget();

  const {
    amount: amountText,
    setAmount: setAmountText,
    pushDigit,
    handleBackspace,
    shake,
  } = useAmountEntry(amountSeed(readyToAssign));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [baseIncome, setBaseIncome] = useState(income);
  const [incomeBase, setIncomeBase] = useState(initialIncomeBase);
  const [expectedVersion, setExpectedVersion] = useState(version);
  const [conflict, setConflict] = useState<BudgetRow | null>(null);

  const value = Number(amountText) || 0;
  const extra = extraForReadyToAssign(incomeBase, totalAssigned, value, carried);
  const newIncome = Math.round((incomeBase + extra) * 100) / 100;
  const delta = Math.round((newIncome - baseIncome) * 100) / 100;
  const impactText =
    delta === 0
      ? "Type what's left to assign"
      : `Income ${formatCurrency(newIncome, hideAmounts)}`;

  async function submit() {
    setSaving(true);
    setError("");
    try {
      // PUT upserts, so this creates the month's income row (keeping the carried monthly income) when there isn't one yet.
      await updateBudget.mutateAsync({
        month,
        category: INCOME_CATEGORY,
        version: expectedVersion,
        updates: { extra: String(extra) },
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof BudgetWriteError && err.status === 409 && err.current) {
        setConflict(err.current);
      } else {
        setError("Couldn't save. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  function reviewLatest(keepDraft: boolean) {
    if (!conflict) return;
    const latestBase = Number(conflict.assigned) || 0;
    const latestIncome = Math.round((latestBase + (Number(conflict.extra) || 0)) * 100) / 100;
    setIncomeBase(latestBase);
    setBaseIncome(latestIncome);
    setExpectedVersion(conflict.version);
    if (!keepDraft) setAmountText(amountSeed(latestIncome + carried - totalAssigned));
    setConflict(null);
    setError("");
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
      {conflict && (
        <BudgetConflictReview
          title="Edit Ready to Assign"
          heading="Ready to Assign was updated"
          label="Ready to Assign"
          latestAmount={(Number(conflict.assigned) || 0) + (Number(conflict.extra) || 0) + carried - totalAssigned}
          draftAmount={value}
          onChoose={reviewLatest}
          onClose={() => {
            setConflict(null);
            setError("");
          }}
        />
      )}
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
          Edit Ready to Assign
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
            <Icon icon={MoneyWavy} size={26} color={tokens.accentInk} />
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
              EDITING
            </Text>
            <Text
              style={{
                color: tokens.text,
                fontFamily: fontFamily.displaySemiBold,
                fontSize: type.body,
              }}
            >
              Ready to Assign
            </Text>
            <Text
              style={{
                color: tokens.text2,
                fontFamily: fontFamily.bodyMedium,
                fontSize: type.caption,
              }}
            >
              {formatCurrency(baseIncome, hideAmounts)} income ·{" "}
              {formatCurrency(totalAssigned, hideAmounts)} assigned
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
              fit
              size={type.hero}
              weight="displayBold"
              animate
              ignoreHide
            />
          </Animated.View>
          <Reanimated.Text
            key={impactText}
            entering={FadeIn.duration(150)}
            style={{
              color: tokens.text2,
              fontSize: type.caption,
              fontFamily: fontFamily.bodyMedium,
              textAlign: "center",
            }}
          >
            {impactText}
          </Reanimated.Text>
        </View>

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
              backgroundColor: success ? tokens.successBg : tokens.accent,
              borderRadius: radius.full,
              opacity: saving ? 0.5 : 1,
            },
          ]}
          onPress={submit}
          disabled={saving || success}
        >
          {success ? (
            <CheckIcon color={tokens.onSuccess} size={16} />
          ) : (
            <Text
              style={{
                color: tokens.onAccent,
                fontFamily: fontFamily.bodyBold,
                fontSize: type.body,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
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

export default withReadOnlyGate(EditReadyToAssignModal);
