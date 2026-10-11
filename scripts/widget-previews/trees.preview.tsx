// Step 1 of `npm run widget-previews` (see shoot.mjs for step 2). Runs under
// Jest only because the widgets import src/theme/fonts, which pulls in
// expo-font and won't load in plain Node. Named *.preview.tsx so `npm test`
// never picks it up.
//
// Dumps the exact trees buildWidgetTree hands the native side, so the
// picker previews are drawn from the real widget code rather than a mockup
// that drifts.
import * as fs from "fs";
import * as path from "path";
import { buildWidgetTree } from "react-native-android-widget/src/api/build-widget-tree";
import { darkTokens, lightTokens } from "@/src/theme/tokens";
import type { WidgetData } from "@/src/widgets/data";
import { EnvelopeWidget } from "@/src/widgets/EnvelopeWidget";
import { EnvelopeBarWidget } from "@/src/widgets/EnvelopeBarWidget";
import { EnvelopeMiniWidget } from "@/src/widgets/EnvelopeMiniWidget";

const OUT = path.join(__dirname, ".out", "trees.json");
const DAY = 86_400_000;

// Example numbers for the picker: a believable mid-month, on track.
const sample: WidgetData = {
  currencyCode: "INR",
  totalLeft: "₹18,420",
  daysLeft: 12,
  updatedAt: Date.now(),
  rows: [
    { icon: "🍔", name: "Food", pct: 71, available: "₹2,320", overspent: false },
    { icon: "🛒", name: "Groceries", pct: 64, available: "₹2,880", overspent: false },
    { icon: "🚕", name: "Transport", pct: 52, available: "₹1,440", overspent: false },
    { icon: "🎉", name: "Outings", pct: 38, available: "₹3,100", overspent: false },
    { icon: "🏠", name: "Rent", pct: 100, available: "₹0", overspent: false },
  ],
  chips: [
    { category: "🍔 Food", label: "Food", uri: "" },
    { category: "🛒 Groceries", label: "Groceries", uri: "" },
    { category: "🚕 Transport", label: "Transport", uri: "" },
  ],
  today: [
    { item: "Coffee", amount: "₹180" },
    { item: "Auto to office", amount: "₹120" },
  ],
  todayTotal: "₹300",
  weeklyTrend: null,
  leftPct: 0.48,
  monthPct: 0.42,
  perDay: "₹1,417",
  overspent: false,
};

const moods: Record<string, WidgetData> = {
  ok: sample,
  tight: { ...sample, totalLeft: "₹4,210", leftPct: 0.11, perDay: "₹324" },
  over: { ...sample, totalLeft: "-₹1,860", leftPct: 0, perDay: "₹0", overspent: true },
  stale: { ...sample, updatedAt: Date.now() - 3 * DAY },
};

// Sizes in dp: roughly what a Pixel-class launcher hands each widget.
const WIDGETS = {
  envelope: { width: 300, height: 420 },
  envelopebar: { width: 320, height: 72 },
  envelopemini: { width: 150, height: 150 },
} as const;

function tree(name: keyof typeof WIDGETS, data: WidgetData, scheme: "light" | "dark") {
  const tokens = scheme === "dark" ? darkTokens : lightTokens;
  const { width, height } = WIDGETS[name];
  switch (name) {
    case "envelope":
      return buildWidgetTree(<EnvelopeWidget {...data} tokens={tokens} scheme={scheme} width={width} height={height} />);
    case "envelopebar":
      return buildWidgetTree(<EnvelopeBarWidget {...data} tokens={tokens} scheme={scheme} width={width} height={height} />);
    case "envelopemini":
      return buildWidgetTree(<EnvelopeMiniWidget {...data} tokens={tokens} scheme={scheme} width={width} />);
  }
}

it("dumps widget trees", () => {
  const out = [];
  for (const name of Object.keys(WIDGETS) as (keyof typeof WIDGETS)[]) {
    for (const scheme of ["light", "dark"] as const) {
      for (const [mood, data] of Object.entries(moods)) {
        out.push({ name, scheme, mood, ...WIDGETS[name], tree: tree(name, data, scheme) });
      }
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
});
