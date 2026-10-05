import { useCurrency } from '@/src/context/CurrencyContext'
// Pushes live data to the Android widgets while the app is running. Mounted
// only while the signed-in screens are (see app/_layout.tsx): firing these
// queries before auth resolves would mean an unauthenticated /api/budgets
// call on every cold boot, guest or not.
//
// The headless widget-task-handler covers everything this can't reach: app
// killed, a widget freshly added, or the 30-minute OS timer.
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import type { WidgetInfo } from "react-native-android-widget";
import { useBudgets } from "@/src/hooks/useBudgets";
import { useRecentExpenses } from "@/src/hooks/useExpenses";
import { useCategories } from "@/src/hooks/useCategories";
import { useGroups } from "@/src/hooks/useGroups";
import { useTheme } from "@/src/theme/ThemeProvider";
import {
  computeEnvelopeState,
  currentMonthKey,
  daysLeftInMonth,
} from "@/src/lib/envelope";
import { todayLocal } from "@/src/lib/date";
import { toWidgetData } from "./data";
import { clearSnapshot, writeSnapshot } from "./snapshot";
import { SignInWidget } from "./SignInWidget";
import type { ThemePreference } from "@/src/theme/pref";
import { variants } from "./variants";
import { EnvelopeWidget } from "./EnvelopeWidget";
import { EnvelopeBarWidget } from "./EnvelopeBarWidget";
import { EnvelopeMiniWidget } from "./EnvelopeMiniWidget";

const HOUR_MS = 60 * 60 * 1000;

export function WidgetSync() {
  const { currencyCode } = useCurrency()
  const { preference } = useTheme();
  const budgetsQ = useBudgets();
  const expensesQ = useRecentExpenses();
  const categoriesQ = useCategories();
  const groupsQ = useGroups();
  // Every refetch hands back fresh objects even when nothing changed. Skipping
  // identical redraws keeps the widget image from being rewritten while the
  // launcher may be reading it.
  const lastDrawn = useRef("");

  useEffect(() => {
    if (Platform.OS !== "android" || !budgetsQ.data || !expensesQ.data) return;

    const state = computeEnvelopeState(
      budgetsQ.data,
      expensesQ.data,
      currentMonthKey(),
      categoriesQ.data ?? [],
      groupsQ.data ?? [],
    );
    const data = toWidgetData(
      state,
      expensesQ.data,
      daysLeftInMonth(),
      todayLocal(),
      currencyCode,
    );
    // updatedAt is Date.now(), so it's bucketed by the hour: still refreshed
    // often enough that the widget never trips its day-old "stale" state.
    const key = JSON.stringify([
      { ...data, updatedAt: Math.floor(data.updatedAt / HOUR_MS) },
      preference,
    ]);
    if (key === lastDrawn.current) return;
    lastDrawn.current = key;
    void writeSnapshot(data);

    void requestWidgetUpdate({
      widgetName: "Envelope",
      renderWidget: (info: WidgetInfo) =>
        variants(preference, (tokens, scheme) => (
          <EnvelopeWidget
            {...data}
            tokens={tokens}
            scheme={scheme}
            width={info.width}
            height={info.height}
          />
        )),
    });
    void requestWidgetUpdate({
      widgetName: "EnvelopeBar",
      renderWidget: (info: WidgetInfo) =>
        variants(preference, (tokens, scheme) => (
          <EnvelopeBarWidget
            {...data}
            tokens={tokens}
            scheme={scheme}
            height={info.height}
          />
        )),
    });
    void requestWidgetUpdate({
      widgetName: "EnvelopeMini",
      renderWidget: (info: WidgetInfo) =>
        variants(preference, (tokens, scheme) => (
          <EnvelopeMiniWidget
            {...data}
            tokens={tokens}
            scheme={scheme}
            width={info.width}
          />
        )),
    });
  }, [
    budgetsQ.data,
    expensesQ.data,
    categoriesQ.data,
    groupsQ.data,
    preference,
    currencyCode,
  ]);

  return null;
}

/**
 * Blank the home-screen widgets once the account has lost access. The app
 * hides its budget screens at that point, and a widget still showing them
 * would be the one place the budget stayed readable. Clearing the snapshot
 * keeps the headless task (widget-task-handler.tsx) from redrawing it later.
 */
export async function lockWidgets(preference: ThemePreference): Promise<void> {
  if (Platform.OS !== "android") return;
  await clearSnapshot();
  for (const widgetName of ["Envelope", "EnvelopeBar", "EnvelopeMini"]) {
    void requestWidgetUpdate({
      widgetName,
      renderWidget: () =>
        variants(preference, (tokens, scheme) => (
          <SignInWidget tokens={tokens} scheme={scheme} compact={widgetName !== "Envelope"} />
        )),
    });
  }
}
