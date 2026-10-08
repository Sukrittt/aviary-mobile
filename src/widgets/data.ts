// Pure transform from the same EnvelopeState/ExpenseRow[] every screen renders
// from, into the small shape the widgets need. No network, no auth, no
// storage here — that's what makes this the only part of the widgets worth
// unit-testing.
import { splitEmoji } from "@/src/lib/emoji";
import { formatMoney } from "@/src/lib/currencies";
import type { Envelope, EnvelopeState } from "@/src/lib/envelope";
import type { ExpenseRow } from "@/src/types";

export interface WidgetRow {
  icon: string;
  name: string;
  pct: number;
  available: string;
  overspent: boolean;
}

export interface WidgetChip {
  category: string;
  label: string;
  uri: string;
}

export interface WidgetToday {
  item: string;
  amount: string;
}

export interface WeeklyTrend {
  pct: number;
  dir: "up" | "down" | "flat";
}

export interface WidgetData {
  currencyCode?: string;
  totalLeft: string;
  daysLeft: number;
  updatedAt: number;
  rows: WidgetRow[];
  chips: WidgetChip[];
  today: WidgetToday[];
  /** Everything spent today, formatted. Empty in a snapshot written before
   *  this field existed. */
  todayTotal: string;
  weeklyTrend: WeeklyTrend | null;
  /** Share of this month's budget still unspent, 0..1. Null when nothing is
   *  budgeted, so there's no pace to measure against. */
  leftPct: number | null;
  /** Share of the month still to go, today included, 0..1. */
  monthPct: number;
  /** What's left spread over today and the rest of the month, formatted.
   *  Empty in a snapshot written before this field existed. */
  perDay: string;
  /** Total left is below zero. */
  overspent: boolean;
}

/** The bird's mood on the widget, and the ring's color. */
export type WidgetMood = "ok" | "tight" | "over" | "stale";

const ROW_COUNT = 5;
const CHIP_COUNT = 3;
const TODAY_COUNT = 3;

function isReal(e: Envelope): boolean {
  return !e.isCreditCardPayment && e.assigned > 0;
}

/** Worst-off envelopes first — the ones worth a glance without opening the app. */
export function selectRows(state: EnvelopeState, currencyCode = 'INR'): WidgetRow[] {
  return [...state.envelopes]
    .filter(isReal)
    .sort((a, b) => b.spentPct - a.spentPct)
    .slice(0, ROW_COUNT)
    .map((e) => {
      const { icon, text } = splitEmoji(e.category);
      return {
        icon,
        name: text,
        pct: e.spentPct,
        available: formatMoney(Math.round(e.available), currencyCode),
        overspent: e.isOverspent,
      };
    });
}

/** Most-used categories this month — the ones worth a one-tap shortcut.
 *  `label` is the button text: full category name, sentence case, emoji-free —
 *  the native `truncate="END"` handles anything still too long to fit. */
export function selectChips(state: EnvelopeState): WidgetChip[] {
  return [...state.envelopes]
    .filter(isReal)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, CHIP_COUNT)
    .map((e) => {
      const { text } = splitEmoji(e.category);
      return {
        category: e.category,
        label: text,
        uri: `envelope://modals/log-expense?category=${encodeURIComponent(e.category)}`,
      };
    });
}

/** Today's spends, most recent first — the one thing here not already
 *  glanceable from the Home tab. */
export function selectToday(
  expenses: ExpenseRow[],
  todayDate: string,
  currencyCode = 'INR',
): WidgetToday[] {
  return expenses
    .filter((e) => e.date === todayDate)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, TODAY_COUNT)
    .map((e) => ({
      item: e.item,
      amount: formatMoney(Math.round(Number(e.amount_inr) || 0), currencyCode),
    }));
}

export function todayTotal(
  expenses: ExpenseRow[],
  todayDate: string,
  currencyCode = 'INR',
): string {
  const sum = expenses
    .filter((e) => e.date === todayDate)
    .reduce((acc, e) => acc + (Number(e.amount_inr) || 0), 0);
  return formatMoney(Math.round(sum), currencyCode);
}

const DAY_MS = 86_400_000;

/** "N days left" while the snapshot is fresh, matching Home's "12 days left";
 *  once the app hasn't run in over a day, flip wholesale to how stale the
 *  numbers are rather than let a silently-frozen snapshot pass as live. */
export function headerRightLabel(
  daysLeft: number,
  updatedAt: number,
  now: number = Date.now(),
): string {
  const ageMs = now - updatedAt;
  if (ageMs < DAY_MS) {
    if (daysLeft === 0) return "Less than 24 hrs";
    return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
  }
  const staleDays = Math.floor(ageMs / DAY_MS);
  return staleDays === 1
    ? "Updated 1 day ago"
    : `Updated ${staleDays} days ago`;
}

/** How far the budget left may trail the month left before the bird worries:
 *  10 points, so a normal lumpy week (rent on the 1st, a big shop) doesn't
 *  flip it the moment spending runs a little ahead of the calendar. */
const TIGHT_MARGIN = 0.1;

/** Stale beats everything: a frozen snapshot saying "on track" is exactly
 *  the lie headerRightLabel's staleness label exists to prevent. */
export function widgetMood(
  data: Pick<WidgetData, "leftPct" | "monthPct" | "overspent" | "updatedAt">,
  now: number = Date.now(),
): WidgetMood {
  if (now - data.updatedAt >= DAY_MS) return "stale";
  if (data.overspent) return "over";
  if (data.leftPct !== null && data.leftPct < data.monthPct - TIGHT_MARGIN) {
    return "tight";
  }
  return "ok";
}

/** headerRightLabel plus the per-day allowance, for the widgets with room for
 *  it. Only while fresh and in budget: a stale snapshot's allowance is
 *  yesterday's, and "₹0/day" when overspent says nothing the red number
 *  doesn't. */
export function withPerDay(
  data: Pick<WidgetData, "daysLeft" | "updatedAt" | "perDay" | "overspent">,
  now: number = Date.now(),
): string {
  const label = headerRightLabel(data.daysLeft, data.updatedAt, now);
  if (now - data.updatedAt >= DAY_MS || data.overspent || !data.perDay) {
    return label;
  }
  return `${label} · ${data.perDay}/day`;
}

/** RemoteViews has no autosize, and a truncated balance ("₹1,23,4…") is
 *  worse than a smaller one, so the hero steps down by string length. */
export function heroFontSize(text: string, base: number): number {
  if (text.length <= 7) return base;
  if (text.length <= 9) return Math.round(base * 0.84);
  return Math.round(base * 0.72);
}

export interface WidgetLayout {
  rows: number;
  today: number;
  /** The per-day / today / week pill row under the hero. */
  pills: boolean;
  buttons: number;
  actionHeight: number;
}

/** Breakpoints for the large (resizable) widget, driven by the dp size Android
 *  actually hands the renderer — not device heuristics, since that's all we
 *  can observe. Bar/Mini don't resize, so they don't call this.
 *
 *  Row height grew when rows picked up an icon + colored amount + a real 5dp
 *  bar (was a hairline), so these bands sit higher than before. The header
 *  then grew again with the oversized bird (+18dp) and, from the 260 band up,
 *  the pill row (+50dp): each band gave up a row or today lines for it. 48dp is
 *  Material's touch-target minimum for the action row; 40dp at the two
 *  shortest bands is a deliberate concession — the widget itself is only
 *  165-210dp tall there, and 48 would eat a quarter of it. */
export function layoutFor(width: number, height: number): WidgetLayout {
  let rows: number;
  let today: number;
  let actionHeight: number;
  if (height >= 320) {
    rows = 4;
    today = 1;
    actionHeight = 48;
  } else if (height >= 260) {
    rows = 3;
    today = 0;
    actionHeight = 48;
  } else if (height >= 210) {
    rows = 2;
    today = 0;
    actionHeight = 40;
  } else if (height >= 165) {
    rows = 1;
    today = 0;
    actionHeight = 40;
  } else {
    rows = 0;
    today = 0;
    actionHeight = 40;
  }
  return { rows, today, pills: height >= 260, buttons: width < 200 ? 2 : 3, actionHeight };
}

/** Past this, the number stops carrying information and starts breaking the
 *  layout: a quiet week followed by rent read 10002%, which wrapped onto a
 *  second line in the mini widget and shoved the Log button off the card. */
const PCT_CAP = 999;

/** Week-over-week change in total spending, as a whole percent. The trailing
 *  7 calendar days (incl. today) vs the 7 before them — "this week" vs "last
 *  week". Positive means we spent more (bad, red), negative less (good, green).
 *  Clamped to +/-999. */
export function weeklyTrend(
  expenses: ExpenseRow[],
  todayDate: string,
): WeeklyTrend | null {
  const today = Date.parse(`${todayDate}T00:00:00Z`);
  let thisWeek = 0;
  let lastWeek = 0;
  for (const e of expenses) {
    if (!e.date || e.date.length !== 10) continue;
    const offset = Math.round(
      (today - Date.parse(`${e.date}T00:00:00Z`)) / DAY_MS,
    );
    if (offset >= 0 && offset < 7) thisWeek += Number(e.amount_inr) || 0;
    else if (offset >= 7 && offset < 14) lastWeek += Number(e.amount_inr) || 0;
  }
  if (thisWeek === 0 && lastWeek === 0) return null;
  if (lastWeek === 0) return { pct: 100, dir: "up" };
  const raw = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  const pct = Math.max(-PCT_CAP, Math.min(PCT_CAP, raw));
  return { pct, dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

export function toWidgetData(
  state: EnvelopeState,
  expenses: ExpenseRow[],
  daysLeft: number,
  todayDate: string,
  currencyCode = 'INR',
): WidgetData {
  const spendable = state.envelopes.filter((e) => !e.isCreditCardPayment);
  const totalLeft = spendable.reduce((sum, e) => sum + e.available, 0);
  // What was there to spend this month: assigned plus rollover, i.e.
  // available + spent. Negative rollover can't shrink the base below zero.
  const budgeted = spendable.reduce(
    (sum, e) => sum + Math.max(0, e.available + e.spent),
    0,
  );
  const [y, m] = todayDate.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  // daysLeft counts the days after today, so today is one more to spend in.
  const daysToGo = daysLeft + 1;
  return {
    currencyCode,
    totalLeft: formatMoney(Math.round(totalLeft), currencyCode),
    daysLeft,
    updatedAt: Date.now(),
    rows: selectRows(state, currencyCode),
    chips: selectChips(state),
    today: selectToday(expenses, todayDate, currencyCode),
    todayTotal: todayTotal(expenses, todayDate, currencyCode),
    weeklyTrend: weeklyTrend(expenses, todayDate),
    leftPct:
      budgeted > 0 ? Math.max(0, Math.min(1, totalLeft / budgeted)) : null,
    monthPct: Math.min(1, daysToGo / daysInMonth),
    perDay: formatMoney(
      Math.round(Math.max(0, totalLeft) / daysToGo),
      currencyCode,
    ),
    overspent: Math.round(totalLeft) < 0,
  };
}
