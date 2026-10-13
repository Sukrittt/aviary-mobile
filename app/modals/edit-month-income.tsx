import { useCurrency } from '@/src/context/CurrencyContext'
import { CheckIcon } from "@/src/components/shared/CheckIcon";
import * as Haptics from "expo-haptics";
import { AmountText } from "@/src/components/ui/AmountText";
import { Numpad } from "@/src/components/ui/Numpad";
import { useAmountEntry } from "@/src/components/ui/useAmountEntry";
import { useBudgets, useUpdateBudget } from "@/src/hooks/useBudgets";
import { EMPTY } from "@/src/lib/constants";
import { currentMonthKey, INCOME_CATEGORY, monthLabel } from "@/src/lib/envelope";

import { fontFamily } from "@/src/theme/fonts";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Opened from Insights' Saved view on a month with spending but no income, so
 * that month can be counted, and from Home's Ready to Assign sheet ("Change
 * income") for the current month's monthly income. Later months carry it
 * forward until one has its own income. Same layout as
 * edit-ready-to-assign.tsx. */
export default function EditMonthIncomeModal() {
  const { month, initial } = useLocalSearchParams<{ month: string; initial?: string }>();
  const isCurrent = month === currentMonthKey();
  const { formatAmountInput } = useCurrency()

  const { tokens, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const budgets = useBudgets().data ?? EMPTY;
  const updateBudget = useUpdateBudget();

  const {
    amount: amountText,
    setAmount: setAmountText,
    pushDigit,
    handleBackspace,
    shake,
  } = useAmountEntry(initial && Number(initial) > 0 ? initial : "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const value = Number(amountText) || 0;

  async function submit() {
    if (value <= 0) return;
    setSaving(true);
    setError("");
    try {
      // A zero-income row can already exist; PUT needs its version, or 0 to create one.
      const version =
        budgets.find((b) => b.month === month && b.category === INCOME_CATEGORY)?.version ?? 0;
      await updateBudget.mutateAsync({
        month,
        category: INCOME_CATEGORY,
        version,
        updates: { assigned: String(value) },
      });
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
          {isCurrent ? "Monthly income" : "Add income"}
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
              {isCurrent ? "EDITING" : "ADDING"}
            </Text>
            <Text
              style={{
                color: tokens.text,
                fontFamily: fontFamily.displaySemiBold,
                fontSize: type.body,
              }}
            >
              {isCurrent ? "Monthly income" : "Income"}
            </Text>
            <Text
              style={{
                color: tokens.text2,
                fontFamily: fontFamily.bodyMedium,
                fontSize: type.caption,
              }}
            >
              {isCurrent ? "What comes in every month, like your salary" : `What came in during ${monthLabel(month)}`}
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
            {isCurrent ? "Carries into next month until you change it" : "Counts toward what you saved that month"}
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
              opacity: saving || value <= 0 ? 0.5 : 1,
            },
          ]}
          onPress={submit}
          disabled={saving || success || value <= 0}
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
