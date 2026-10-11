import { CurrencyPicker } from "@/src/components/CurrencyPicker";
import { CurrencyScope, useCurrency } from "@/src/context/CurrencyContext";
import { resolveCurrency } from "@/src/lib/currencies";
import { getLocales } from "expo-localization";
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ArrowLeft, CopyX, Info, LayoutGrid, Pencil, Plus } from "lucide-react-native";
import { Toast } from "@/src/components/ui/Toast";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeProvider";
import type { ThemeTokens } from "@/src/theme/tokens";
import { fontFamily } from "@/src/theme/fonts";
import { Numpad } from "@/src/components/ui/Numpad";
import { StepDot } from "@/src/components/onboarding/StepDot";
import { PickRow } from "@/src/components/onboarding/PickRow";
import { SetupDone } from "@/src/components/onboarding/SetupDone";
import { AmountTicker } from "@/src/components/onboarding/AmountTicker";
import { BottomSheet } from "@/src/components/shared/Modal";
import { LoadingPhrase } from "@/src/components/shared/LoadingPhrase";

import { currentMonthKey, INCOME_CATEGORY } from "@/src/lib/envelope";
import { getBudgets, updateBudget } from "@/src/api/budgets";
import { addGroup } from "@/src/api/groups";
import { addCategory, getSplitBuckets } from "@/src/api/categories";
import {
  BUCKET_LABELS,
  BUCKET_PLURALS,
  bucketsOf,
  summarizeSplit,
  splitNote,
  BUCKET_SHARES,
  BUCKETS,
  type Bucket,
  normName,
  splitEvenly,
  suggestSplit,
  unknownCategories,
  type BucketTags,
} from "@/src/lib/budgetSplit";
import { getUser, updateUser } from "@/src/api/account";
import { completeOnboarding } from "@/src/api/billing";
import { signalOnboarded } from "@/src/api/onboardingSignal";
import { DEFAULT_ALERT_PCTS } from "@/src/lib/alerts";
import { startTimer, track } from "@/src/lib/analytics";

// SetupWizard.dc.html — currency → income → done, on a starter budget (the
// pre-checked groups and categories, income split across them). "Pick my own"
// opens groups → categories → assign instead. Writes land on finish, not
// per-step: groups/categories aren't
// reorderable or renameable server-side until they exist, so there's nothing
// worth syncing mid-flow.
const EMOJI_CHOICES = [
  "🏠",
  "🎬",
  "🌱",
  "🛒",
  "💡",
  "🚌",
  "🍜",
  "📺",
  "🛍",
  "🛟",
  "📈",
  "🎓",
  "🐶",
  "💊",
  "✈️",
  "🎁",
];
const QUICK_PICKS = ["30000", "50000", "75000", "100000"];
// Shortest time a Finish-button save step stays on screen.
const STEP_MIN_MS = 500;
// The last step holds longer so it reads as finishing, not a flash before the success screen.
const LAST_STEP_MIN_MS = 1000;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Item {
  id: string;
  emoji: string;
  name: string;
  on: boolean;
}

interface LiveCat {
  key: string;
  groupId: string;
  catId: string;
  group: string;
  emoji: string;
  name: string;
}

let nextId = 1;
const makeId = () => `setup-${nextId++}`;

function defaultGroups(): Item[] {
  return [
    { id: "g1", emoji: "🏠", name: "Essentials", on: true },
    { id: "g2", emoji: "🎬", name: "Lifestyle", on: true },
    { id: "g3", emoji: "🌱", name: "Savings", on: false },
  ];
}

function defaultCats(): Record<string, Item[]> {
  return {
    g1: [
      { id: makeId(), emoji: "🏠", name: "Rent", on: true },
      { id: makeId(), emoji: "🛒", name: "Groceries", on: true },
      { id: makeId(), emoji: "💡", name: "Utilities", on: true },
      { id: makeId(), emoji: "🚌", name: "Transport", on: false },
    ],
    g2: [
      { id: makeId(), emoji: "🍜", name: "Eating out", on: true },
      { id: makeId(), emoji: "📺", name: "Subscriptions", on: false },
      { id: makeId(), emoji: "🛍", name: "Shopping", on: false },
    ],
    g3: [
      { id: makeId(), emoji: "🛟", name: "Emergency fund", on: true },
      { id: makeId(), emoji: "📈", name: "Investments", on: false },
    ],
  };
}

// A blank row stays unchecked; it checks itself the moment it gets a name,
// and unchecks again if the name is cleared.
function onForName(item: Item, name: string): boolean {
  if (!name.trim()) return false;
  return item.name.trim() ? item.on : true;
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

function label(item: Item): string {
  return `${item.emoji} ${item.name.trim()}`;
}

async function ignoreConflict(err: unknown): Promise<void> {
  if (
    err instanceof Error &&
    err.message.toLowerCase().includes("already exists")
  )
    return;
  throw err;
}

// Analytics names for the five steps, so a funnel reads 'groups' rather than '2'.
const STEP_NAMES = [
  "currency",
  "income",
  "groups",
  "categories",
  "assign",
] as const;

const TITLES: Record<number, [string, string]> = {
  0: [
    "Choose your currency",
    "The currency you use for your budget. You can change it later in More.",
  ],
  1: [
    "What lands each month?",
    "Your take-home income. This becomes the pot you assign from. Not sure yet? Skip it and add it from Home later.",
  ],
  2: [
    "Group your money",
    "Groups are the big buckets. Accept these or rename them to fit your life.",
  ],
  3: [
    "Add your categories",
    "These are the envelopes you actually spend from. Pick the ones you recognize.",
  ],
  4: [
    "Assign your money",
    "We split it with the 50/30/20 rule: half to needs, 30% to wants, 20% to savings. Tap any amount to change it. Anything you leave waits in Ready to Assign.",
  ],
};

const SPLIT_INFO: Record<Bucket, string> = {
  need: "Rent, groceries, bills. The stuff you can't skip.",
  want: "Eating out, shopping, fun. Nice, not needed.",
  savings: "Emergency fund, goals, future you.",
};

function remainderColors(
  rem: number,
  tokens: ThemeTokens,
): { color: string; bg: string } {
  if (rem === 0) return { color: tokens.mint, bg: tokens.mintSoft };
  if (rem < 0) return { color: tokens.coral, bg: tokens.coralSoft };
  return { color: tokens.accentInk, bg: tokens.accentSoft };
}

export default function SetupScreen() {
  // Start on the device region's currency (US → USD, MX → MXN); the profile's
  // seeded INR is only a placeholder until this step saves a real choice.
  const [currencyCode, setCurrencyCode] = useState(() =>
    resolveCurrency(getLocales()[0]?.currencyCode),
  );
  return (
    <CurrencyScope code={currencyCode}>
      <CurrencyWizard
        currencyCode={currencyCode}
        onCurrencyChange={(code) =>
          setCurrencyCode(code as typeof currencyCode)
        }
      />
    </CurrencyScope>
  );
}

function CurrencyWizard({
  currencyCode,
  onCurrencyChange,
}: {
  currencyCode: string;
  onCurrencyChange: (code: string) => void;
}) {
  const { formatMoney } = useCurrency();

  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  // Whether the user chose to pick their own groups and categories. Without
  // it, setup finishes from the income step on the starter budget.
  const [custom, setCustom] = useState(false);
  const [income, setIncome] = useState("");
  // Drive AmountTicker's roll/flash/delta animation — mirrors SetupWizard.dc.html's
  // tick/dir/delta: `tick` forces a remount (replays the per-character entrance),
  // `dir` picks the roll direction, `delta` (quick-pick jumps only) floats a badge.
  const [tick, setTick] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [delta, setDelta] = useState(0);
  const [groups, setGroups] = useState<Item[]>(defaultGroups);
  const [cats, setCats] = useState<Record<string, Item[]>>(defaultCats);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Why a row couldn't be checked (no name yet, or a name another checked row
  // already has); each bump of `n` shows it as a toast.
  const [rowToast, setRowToast] = useState({ n: 0, message: "" });
  // The row whose emoji sheet is open: a group, or a category when catId is set.
  const [emojiFor, setEmojiFor] = useState<{
    groupId: string;
    catId?: string;
    emoji: string;
    name: string;
  } | null>(null);
  const [buf, setBuf] = useState("");
  // The open category's name as it's being edited in the assign sheet; it
  // only lands on the category when the sheet closes.
  const [nameDraft, setNameDraft] = useState("");
  // The assign sheet swaps its numpad for the emoji grid while this is on.
  const [sheetEmojiOpen, setSheetEmojiOpen] = useState(false);
  const [splitInfoOpen, setSplitInfoOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // Real save progress for the Finish button: the step being written and a
  // fill that grows as each write lands, so a slow save visibly moves.
  const [saveStep, setSaveStep] = useState("");
  const saveFill = useSharedValue(0);
  const saveFillStyle = useAnimatedStyle(() => ({
    width: `${saveFill.value * 100}%`,
  }));
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    income: number;
    groupCount: number;
    categoryCount: number;
  } | null>(null);

  // Timing for the onboarding funnel: how long the whole wizard takes, and how
  // long each step holds someone. Refs, since no render depends on them.
  const wizardTimer = useRef<() => number>(() => 0);
  const stepTimer = useRef<() => number>(() => 0);
  // Whether the user touched the suggested split on the assign step, which is
  // the thing worth knowing about the step that asks the most of them.
  const editedSplit = useRef(false);
  // Need/want/savings tags Jev gave the user's own categories, and every name already asked about.
  const [bucketTags, setBucketTags] = useState<BucketTags>({});
  const askedBuckets = useRef(new Set<string>());

  useEffect(() => {
    wizardTimer.current = startTimer();
    track("onboarding_started");
  }, []);

  useEffect(() => {
    if (step > 4) return;
    stepTimer.current = startTimer();
    track("onboarding_step_viewed", { step, step_name: STEP_NAMES[step] });
  }, [step]);

  const selectedGroups = groups.filter((g) => g.on && g.name.trim());
  const selectedCatCount = selectedGroups.reduce(
    (n, g) =>
      n + (cats[g.id] ?? []).filter((c) => c.on && c.name.trim()).length,
    0,
  );

  const liveCats = (): LiveCat[] => {
    const out: LiveCat[] = [];
    selectedGroups.forEach((g) => {
      (cats[g.id] ?? []).forEach((c) => {
        if (c.on && c.name.trim())
          out.push({
            key: `${g.id}:${c.id}`,
            groupId: g.id,
            catId: c.id,
            group: g.name,
            emoji: c.emoji,
            name: c.name,
          });
      });
    });
    return out;
  };

  const assignedTotal = () =>
    liveCats().reduce((n, c) => n + (amounts[c.key] ?? 0), 0);
  const remainder = () => (Number(income) || 0) - assignedTotal();

  const distribute = (
    weighted: boolean,
    tags: BucketTags = bucketTags,
  ): Record<string, number> => {
    const items = liveCats();
    const incomeValue = Number(income) || 0;
    return weighted
      ? suggestSplit(incomeValue, items, tags)
      : splitEvenly(
          incomeValue,
          items.map((it) => it.key),
        );
  };

  const openAssign = (tags: BucketTags) => {
    setAmounts((prev) =>
      Object.keys(prev).length ? prev : distribute(true, tags),
    );
    setStep(4);
  };

  // Jev tags the categories the user named themselves, once per name, before
  // the assign step opens. Any failure leaves them on the group-name fallback.
  // With nothing new to ask, the step opens at once.
  const tagThenOpenAssign = async () => {
    const ask = unknownCategories(liveCats()).filter(
      (c) => !askedBuckets.current.has(normName(c.name)),
    );
    if (!ask.length) return openAssign(bucketTags);
    ask.forEach((c) => askedBuckets.current.add(normName(c.name)));
    saveFill.value = 0;
    setSaveStep("Working out your split…");
    setPending(true);
    const tags = { ...bucketTags, ...(await getSplitBuckets(ask)) };
    setPending(false);
    setBucketTags(tags);
    openAssign(tags);
  };

  const applyDistribution = (weighted: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setAmounts(distribute(weighted));
  };

  const canAdvance =
    step === 0
      ? true
      : step === 1
        ? true
        : step === 2
          ? selectedGroups.length > 0
          : step === 3
            ? selectedCatCount > 0
            : step === 4
              ? remainder() >= 0
              : true;

  // What each step's choice was, as counts and flags. Never the income or the
  // names typed in: those are the sensitive half of this app's data.
  const stepDetails = (): Record<string, string | number | boolean> => {
    if (step === 0) return { currency: currencyCode };
    if (step === 1)
      return {
        used_quick_pick: QUICK_PICKS.includes(income),
        skipped_income: !(Number(income) > 0),
        customized: custom,
      };
    if (step === 2) {
      const defaults = new Map(defaultGroups().map((g) => [g.id, g.name]));
      return {
        groups_selected: selectedGroups.length,
        groups_added: selectedGroups.filter((g) => !defaults.has(g.id)).length,
        groups_renamed: selectedGroups.filter(
          (g) => defaults.has(g.id) && defaults.get(g.id) !== g.name.trim(),
        ).length,
      };
    }
    if (step === 3) return { categories_selected: selectedCatCount };
    return { edited_split: editedSplit.current };
  };

  const trackStepCompleted = (extra?: Record<string, boolean>) =>
    track("onboarding_step_completed", {
      step,
      step_name: STEP_NAMES[step],
      seconds_on_step: stepTimer.current(),
      ...stepDetails(),
      ...extra,
    });

  const patchGroup = (id: string, patch: Partial<Item>) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const patchCat = (groupId: string, catId: string, patch: Partial<Item>) =>
    setCats((c) => ({
      ...c,
      [groupId]: (c[groupId] ?? []).map((cat) =>
        cat.id === catId ? { ...cat, ...patch } : cat,
      ),
    }));

  const blockRow = (message: string) =>
    setRowToast((t) => ({ n: t.n + 1, message }));
  const blockDup = (kind: "group" | "category", name: string) =>
    blockRow(`You've already got a ${kind} called ${name.trim()}.`);

  // Whether `name` matches another checked row. Categories compare across
  // every selected group, since they all become envelopes side by side.
  const groupDup = (id: string) => (name: string) =>
    name.trim() !== "" &&
    groups.some((g) => g.id !== id && g.on && sameName(g.name, name));
  const catDup = (catId: string) => (name: string) =>
    name.trim() !== "" &&
    selectedGroups.some((g) =>
      (cats[g.id] ?? []).some(
        (c) => c.id !== catId && c.on && sameName(c.name, name),
      ),
    );

  const toggleGuarded = (
    item: Item,
    isDup: (name: string) => boolean,
    kind: "group" | "category",
  ): Partial<Item> | null => {
    if (!item.on && !item.name.trim()) {
      blockRow(`Give this ${kind} a name first.`);
      return null;
    }
    if (!item.on && isDup(item.name)) {
      blockDup(kind, item.name);
      return null;
    }
    return { on: !item.on };
  };

  const renameGuarded = (
    item: Item,
    name: string,
    isDup: (name: string) => boolean,
    kind: "group" | "category",
  ): Partial<Item> => {
    const dup = isDup(name);
    const wasDup = isDup(item.name);
    // A row unchecked only because it was a duplicate checks again once renamed.
    const wantOn =
      wasDup && !item.on && name.trim() ? true : onForName(item, name);
    if (wantOn && dup && !wasDup) blockDup(kind, name);
    return { name, on: wantOn && !dup };
  };

  const toggleGroup = (g: Item) => {
    const patch = toggleGuarded(g, groupDup(g.id), "group");
    if (patch) patchGroup(g.id, patch);
  };
  const renameGroup = (g: Item, name: string) =>
    patchGroup(g.id, renameGuarded(g, name, groupDup(g.id), "group"));
  const toggleCat = (groupId: string, c: Item) => {
    const patch = toggleGuarded(c, catDup(c.id), "category");
    if (patch) patchCat(groupId, c.id, patch);
  };
  const renameCat = (groupId: string, c: Item, name: string) =>
    patchCat(groupId, c.id, renameGuarded(c, name, catDup(c.id), "category"));

  const pickEmoji = (emoji: string) => {
    if (!emojiFor) return;
    Haptics.selectionAsync().catch(() => {});
    if (emojiFor.catId) patchCat(emojiFor.groupId, emojiFor.catId, { emoji });
    else patchGroup(emojiFor.groupId, { emoji });
    setEmojiFor(null);
  };

  const addGroupRow = () => {
    Haptics.selectionAsync().catch(() => {});
    const id = makeId();
    setGroups((gs) => [...gs, { id, emoji: "🎁", name: "", on: false }]);
    setCats((c) => ({ ...c, [id]: [] }));
  };

  const addCatRow = (groupId: string) => {
    Haptics.selectionAsync().catch(() => {});
    setCats((c) => ({
      ...c,
      [groupId]: [
        ...(c[groupId] ?? []),
        { id: makeId(), emoji: "🎁", name: "", on: false },
      ],
    }));
  };

  const pressIncomeDigit = (d: string) => {
    setIncome((prev) => (prev + d).replace(/^0+/, "").slice(0, 9));
    setTick((t) => t + 1);
    setDir(1);
    setDelta(0);
  };

  const pressIncomeBackspace = () => {
    setIncome((prev) => prev.slice(0, -1));
    setTick((t) => t + 1);
    setDir(-1);
    setDelta(0);
  };

  const pickIncome = (v: string) => {
    const prev = Number(income) || 0;
    const nextValue = Number(v);
    setIncome(v);
    setTick((t) => t + 1);
    setDir(nextValue >= prev ? 1 : -1);
    setDelta(nextValue - prev);
  };

  const back = () => {
    if (step > 0)
      track("onboarding_back_tapped", {
        from_step: step,
        step_name: STEP_NAMES[step],
      });
    setError("");
    setStep((s) => Math.max(0, s - 1));
  };

  const openRow = (key: string) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveKey(key);
    setBuf("");
    setSheetEmojiOpen(false);
    setNameDraft(liveCats().find((c) => c.key === key)?.name ?? "");
  };

  // A blank name keeps the old one (a nameless category would drop off this
  // step), and a clashing name keeps the old one with the duplicate toast.
  const commitName = () => {
    const cat = liveCats().find((c) => c.key === activeKey);
    const name = nameDraft.trim();
    if (!cat || !name || name === cat.name.trim()) return;
    if (catDup(cat.catId)(name)) return blockDup("category", name);
    patchCat(cat.groupId, cat.catId, { name });
  };

  const closeRow = () => {
    commitName();
    setActiveKey(null);
    setBuf("");
  };

  const pressAmt = (k: string) => {
    if (!activeKey) return;
    editedSplit.current = true;
    const nextBuf =
      k === "del" ? buf.slice(0, -1) : (buf + k).replace(/^0+/, "").slice(0, 8);
    setBuf(nextBuf);
    setAmounts((prev) => ({ ...prev, [activeKey]: Number(nextBuf || 0) }));
  };

  const clearAmt = () => {
    if (!activeKey) return;
    editedSplit.current = true;
    setBuf("");
    setAmounts((prev) => ({ ...prev, [activeKey]: 0 }));
  };

  const fillRemainder = () => {
    if (!activeKey) return;
    editedSplit.current = true;
    const cur = amounts[activeKey] ?? 0;
    const rest = assignedTotal() - cur;
    const v = Math.max(0, (Number(income) || 0) - rest);
    setAmounts((prev) => ({ ...prev, [activeKey]: v }));
    setBuf(String(v));
  };

  const commit = async (amounts: Record<string, number>) => {
    if (pending) return;
    setPending(true);
    setError("");
    const incomeValue = Math.round(Number(income)) || 0;
    const categories = selectedGroups.flatMap((g) =>
      (cats[g.id] ?? [])
        .filter((c) => c.on && c.name.trim())
        .map((c) => ({ name: label(c), group: label(g) })),
    );
    const categoryCount = categories.length;

    // A response can fail after the server has already committed onboarding.
    // Keep the success transition in one place so a verified recovery is
    // indistinguishable from the ordinary happy path to the user.
    const finishSetup = (recoveredAfterError = false) => {
      trackStepCompleted();
      track("onboarding_completed", {
        total_seconds: wizardTimer.current(),
        groups_count: selectedGroups.length,
        categories_count: categoryCount,
        currency: currencyCode,
        customized: custom,
        skipped_income: incomeValue === 0,
        ...(recoveredAfterError ? { recovered_after_error: true } : {}),
      });
      setResult({
        income: incomeValue,
        groupCount: selectedGroups.length,
        categoryCount,
      });
      setStep(5);
    };

    const live = liveCats();
    // Groups, categories, income, each envelope, then currency + completion.
    const totalWrites =
      selectedGroups.length + categoryCount + 1 + live.length + 2;
    let doneWrites = 0;
    const tick = () => {
      saveFill.value = withTiming(++doneWrites / totalWrites, {
        duration: 350,
      });
    };
    saveFill.value = 0;
    setSaveStep("Creating your envelopes…");
    // Each step stays readable for at least STEP_MIN_MS, so a fast write never
    // flashes its text past the user or cuts straight to the next screen.
    let stepShownAt = 0;
    const markStep = () => {
      stepShownAt = Date.now();
    };
    markStep();
    const holdStep = (minMs = STEP_MIN_MS) =>
      new Promise<void>((r) =>
        setTimeout(r, Math.max(0, stepShownAt + minMs - Date.now())),
      );
    const showStep = async (text: string) => {
      await holdStep();
      setSaveStep(text);
      markStep();
    };

    try {
      const month = currentMonthKey();
      const budgetVersions = new Map(
        (await getBudgets()).map((row) => [
          `${row.month}\u0000${row.category}`,
          row.version,
        ]),
      );
      const versionFor = (category: string) =>
        budgetVersions.get(`${month}\u0000${category}`) ?? 0;

      // Groups and categories each run in their own sequential chain: the
      // server numbers `order` as max+1, so parallel inserts within one
      // collection would race and scramble the order the user picked. Budget
      // rows are independent upserts, so they all go out at once alongside.
      await Promise.all([
        (async () => {
          for (const g of selectedGroups)
            await addGroup(label(g)).catch(ignoreConflict).then(tick);
        })(),
        (async () => {
          for (const c of categories)
            await addCategory(c.name, c.group).catch(ignoreConflict).then(tick);
        })(),
        updateBudget(
          month,
          INCOME_CATEGORY,
          { assigned: String(incomeValue), rolled_over: "0" },
          versionFor(INCOME_CATEGORY),
        ).then(tick),
        ...live.map((item) =>
          updateBudget(
            month,
            `${item.emoji} ${item.name.trim()}`,
            { assigned: String(amounts[item.key] ?? 0), rolled_over: "0" },
            versionFor(`${item.emoji} ${item.name.trim()}`),
          ).then(tick),
        ),
      ]);
      // Last, so a failed write above leaves the user un-onboarded and retrying.
      // Two calls rather than one: the currency is an ordinary profile field,
      // but completing onboarding starts the 45-day trial, so its instant is
      // the server's — this device's clock has no say in when the trial ends.
      await showStep("Starting your budget…");
      await updateUser({ currencyCode });
      tick();
      await completeOnboarding();
      tick();
      qc.invalidateQueries({ queryKey: ["user"] });
      // Not awaited: this refetches every cached query, and the celebration
      // screen doesn't need any of them.
      void qc.invalidateQueries();
      // signalOnboarded() is deferred to the celebration screen's CTA — firing
      // it here would flip the root layout's guard and swap this screen out
      // before the user has seen step 5.

      // Counted here, once the server has everything, rather than on the
      // celebration screen's CTA: someone who closes the app on that screen is
      // still onboarded, and the funnel should say so.
      await holdStep(LAST_STEP_MIN_MS);
      finishSetup();
    } catch {
      // The final response may be lost after the server commits the profile and
      // trial. Confirm before telling the user the save failed: this is exactly
      // the state seen in the IQD tester report. If confirmation is unavailable,
      // retries remain safe because every setup write and completion is idempotent.
      try {
        const user = await getUser();
        if (user.onboardedAt) {
          qc.setQueryData(["user"], user);
          void qc.invalidateQueries();
          await holdStep(LAST_STEP_MIN_MS);
          finishSetup(true);
          return;
        }
      } catch {
        // Keep the original failure as the outcome; the message below explains
        // that the app could not confirm whether the server saved the setup.
      }
      track("onboarding_failed", { reason: "save_failed" });
      setError(
        "Couldn't confirm your setup. Check your connection and try again. If it already saved, reopening the app will continue to your budget.",
      );
    } finally {
      setPending(false);
    }
  };

  // The step that saves reports itself once the save lands (see commit), so a
  // failed save doesn't count as a finished step.
  const next = () => {
    if (!canAdvance || pending) return;
    const hasIncome = Number(income) > 0;
    if (step === 1 && !custom) {
      // Starter budget: the pre-checked defaults, income split the suggested way.
      commit(hasIncome ? distribute(true) : {});
      return;
    }
    if (step === 3 && !hasIncome) {
      // Nothing to assign, so there's no assign step to show.
      commit({});
      return;
    }
    if (step === 4) {
      commit(amounts);
      return;
    }
    trackStepCompleted();
    if (step === 3) {
      void tagThenOpenAssign();
      return;
    }
    setStep((s) => s + 1);
  };

  const pickOwn = () => {
    if (pending) return;
    Haptics.selectionAsync().catch(() => {});
    setCustom(true);
    trackStepCompleted({ customized: true });
    setStep(2);
  };

  const pressPrimaryCta = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    next();
  };

  if (step === 5 && result) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: tokens.bg,
            paddingTop: insets.top + 60,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <SetupDone
          income={result.income}
          groupCount={result.groupCount}
          categoryCount={result.categoryCount}
          onFinish={signalOnboarded}
        />
      </View>
    );
  }

  const [title, blurb] = TITLES[step];
  const rem = remainder();
  // Need/want/savings per category, labelled on the assign step so the suggested split explains itself.
  const buckets = bucketsOf(liveCats(), bucketTags);
  const summary = summarizeSplit(liveCats(), bucketTags);
  const note = splitNote(summary);
  // Same colours on the split line and each row's label, so the two read together.
  const bucketColors: Record<Bucket, { fg: string; bg: string }> = {
    need: { fg: tokens.blue, bg: tokens.blueSoft },
    want: { fg: tokens.violet, bg: tokens.violetSoft },
    savings: { fg: tokens.mint, bg: tokens.mintSoft },
  };
  const hint =
    step === 0
      ? ""
      : step === 1
        ? Number(income) > 0
          ? ""
          : "You can add it from Home any time"
        : step === 2
          ? canAdvance
            ? `${selectedGroups.length} groups selected`
            : "Keep at least one group"
          : step === 3
            ? canAdvance
              ? `${selectedCatCount} categories across ${selectedGroups.length} groups`
              : "Pick at least one category"
            : rem === 0
              ? "Everything assigned"
              : rem > 0
                ? `${formatMoney(rem)} left. It'll wait in Ready to Assign`
                : `${formatMoney(-rem)} over your income`;

  const finishesHere =
    (step === 1 && !custom) || step === 4 || (step === 3 && !(Number(income) > 0));
  const ctaLabel =
    step === 1 && !(Number(income) > 0)
      ? "Skip for now"
      : finishesHere
        ? "Finish setup"
        : "Continue";

  const remColors = remainderColors(rem, tokens);
  const remLabel =
    rem === 0 ? "All assigned" : rem < 0 ? "Over by" : "Left to assign";
  const activeCat = activeKey
    ? liveCats().find((c) => c.key === activeKey)
    : undefined;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tokens.bg,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 20,
        },
      ]}
    >
      <View style={styles.topRow}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={back}
          disabled={step === 0}
          style={[
            styles.backButton,
            {
              backgroundColor: tokens.card,
              borderColor: tokens.border,
              opacity: step === 0 ? 0.35 : 1,
            },
          ]}
        >
          <ArrowLeft size={16} color={tokens.text} />
        </Pressable>
        <View style={styles.dots}>
          {(custom ? [0, 1, 2, 3, 4] : [0, 1]).map((n) => (
            <StepDot
              key={n}
              active={n <= step}
              activeColor={tokens.accent}
              inactiveColor={tokens.borderStrong}
              onPress={() => {}}
            />
          ))}
        </View>
      </View>

      <Text
        style={[
          styles.title,
          { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.blurb,
          { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
        ]}
      >
        {blurb}
      </Text>

      {step === 0 && (
        <View style={[styles.stepBody, { paddingTop: 10 }]}>
          <CurrencyPicker
            value={currencyCode}
            onChange={onCurrencyChange}
            fillAvailableSpace
          />
        </View>
      )}

      {step === 1 && (
        <View style={styles.stepBody}>
          <View style={styles.amountWrap}>
            {/* Big like web's, dropping back to the old size for long
                  amounts so ₹10,00,00,000 still fits on one line. */}
            <AmountTicker
              text={formatMoney(Number(income) || 0)}
              tick={tick}
              dir={dir}
              delta={delta}
              dimmed={!income}
              fontSize={formatMoney(Number(income) || 0).length > 10 ? 46 : 64}
            />
          </View>
          <View style={styles.quickRow}>
            {QUICK_PICKS.map((v) => (
              <QuickPickChip
                key={v}
                label={formatMoney(Number(v))}
                on={income === v}
                onPress={() => pickIncome(v)}
              />
            ))}
          </View>
          {!custom && (
            <Pressable
              onPress={pickOwn}
              disabled={pending}
              accessibilityRole="button"
              style={[styles.pickOwn, { borderColor: tokens.borderStrong }]}
            >
              <LayoutGrid size={15} color={tokens.accentInk} strokeWidth={2.2} />
              <Text
                style={[
                  styles.pickOwnLabel,
                  { color: tokens.accentInk, fontFamily: fontFamily.bodyBold },
                ]}
              >
                Build my own budget
              </Text>
            </Pressable>
          )}
          <View style={{ flex: 1, minHeight: 10 }} />
          <View style={{ marginBottom: 14 }}>
            <Numpad
              extraKey="00"
              onDigit={pressIncomeDigit}
              onBackspace={pressIncomeBackspace}
              onClear={() => setIncome("")}
            />
          </View>
        </View>
      )}

      {step === 2 && (
        <ScrollView
          style={styles.stepBody}
          contentContainerStyle={styles.rowList}
          showsVerticalScrollIndicator={false}
        >
          {groups.map((g) => (
            <PickRow
              key={g.id}
              emoji={g.emoji}
              name={g.name}
              on={g.on}
              placeholder="Group name"
              onPressEmoji={() =>
                setEmojiFor({ groupId: g.id, emoji: g.emoji, name: g.name })
              }
              onChangeName={(name) => renameGroup(g, name)}
              onToggle={() => toggleGroup(g)}
            />
          ))}
          <Pressable
            onPress={addGroupRow}
            style={[styles.addRow, { borderColor: tokens.borderStrong }]}
          >
            <Plus size={16} color={tokens.text2} strokeWidth={2.2} />
            <Text style={[styles.addRowLabel, { color: tokens.text2 }]}>
              Add your own group
            </Text>
          </Pressable>
          <Text style={[styles.microHint, { color: tokens.text3 }]}>
            tap a name to rename · tap the emoji to pick another
          </Text>
        </ScrollView>
      )}

      {step === 3 && (
        <ScrollView
          style={styles.stepBody}
          contentContainerStyle={styles.sectionList}
          showsVerticalScrollIndicator={false}
        >
          {selectedGroups.map((g) => {
            const rows = cats[g.id] ?? [];
            return (
              <View key={g.id} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={{ fontSize: 14 }}>{g.emoji}</Text>
                  <Text style={[styles.sectionTitle, { color: tokens.text3 }]}>
                    {g.name.toUpperCase()}
                  </Text>
                  <Text style={[styles.sectionCount, { color: tokens.text3 }]}>
                    {rows.filter((c) => c.on).length} picked
                  </Text>
                </View>
                {rows.map((c) => (
                  <PickRow
                    key={c.id}
                    emoji={c.emoji}
                    name={c.name}
                    on={c.on}
                    placeholder="Category name"
                    onPressEmoji={() =>
                      setEmojiFor({
                        groupId: g.id,
                        catId: c.id,
                        emoji: c.emoji,
                        name: c.name,
                      })
                    }
                    onChangeName={(name) => renameCat(g.id, c, name)}
                    onToggle={() => toggleCat(g.id, c)}
                  />
                ))}
                <Pressable
                  onPress={() => addCatRow(g.id)}
                  style={[styles.addPill, { borderColor: tokens.borderStrong }]}
                >
                  <Plus size={14} color={tokens.text2} strokeWidth={2.4} />
                  <Text style={[styles.addPillLabel, { color: tokens.text2 }]}>
                    Add category
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {selectedCatCount > 0 && (
            <Text style={[styles.microHint, { color: tokens.text3 }]}>
              Default alerts:{" "}
              {DEFAULT_ALERT_PCTS.map((pct) => `${pct}%`).join(" · ")}
            </Text>
          )}
        </ScrollView>
      )}

      {step === 4 && (
        <View style={styles.stepBody}>
          <View
            style={[
              styles.remChip,
              { backgroundColor: remColors.bg, borderColor: remColors.color },
            ]}
          >
            <Text style={[styles.remLabel, { color: remColors.color }]}>
              {remLabel}
            </Text>
            <Text
              style={[
                styles.remValue,
                {
                  color: remColors.color,
                  fontFamily: fontFamily.displaySemiBold,
                },
              ]}
            >
              {formatMoney(Math.abs(rem))}
            </Text>
          </View>
          <View style={styles.splitRow}>
            <SplitButton
              label="Suggested split"
              onPress={() => applyDistribution(true)}
            />
            <SplitButton
              label="Split evenly"
              onPress={() => applyDistribution(false)}
            />
          </View>
          {summary && (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Shows how the suggested split works"
              onPress={() => setSplitInfoOpen(true)}
              style={styles.splitWhy}
            >
              {summary.map((s) => (
                <View key={s.bucket} style={styles.splitKey}>
                  <View
                    style={[
                      styles.splitDot,
                      { backgroundColor: bucketColors[s.bucket].fg },
                    ]}
                  />
                  <Text
                    style={[
                      styles.splitKeyLabel,
                      { color: tokens.text2, fontFamily: fontFamily.bodyBold },
                    ]}
                  >
                    {BUCKET_PLURALS[s.bucket]} {s.pct}%
                  </Text>
                </View>
              ))}
              <Info size={13} color={tokens.text3} strokeWidth={2.4} />
              {note && (
                <Text
                  style={[
                    styles.splitKeyLabel,
                    styles.splitNote,
                    { color: tokens.text3 },
                  ]}
                >
                  {note}
                </Text>
              )}
            </Pressable>
          )}
          <ScrollView
            contentContainerStyle={[styles.sectionList, { paddingTop: 16 }]}
            showsVerticalScrollIndicator={false}
          >
            {selectedGroups.map((g) => {
              const rows = (cats[g.id] ?? []).filter(
                (c) => c.on && c.name.trim(),
              );
              const subtotal = rows.reduce(
                (n, c) => n + (amounts[`${g.id}:${c.id}`] ?? 0),
                0,
              );
              return (
                <View key={g.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={{ fontSize: 14 }}>{g.emoji}</Text>
                    <Text
                      style={[styles.sectionTitle, { color: tokens.text3 }]}
                    >
                      {g.name.toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.sectionSubtotal,
                        {
                          color: tokens.text2,
                          fontFamily: fontFamily.displaySemiBold,
                        },
                      ]}
                    >
                      {formatMoney(subtotal)}
                    </Text>
                  </View>
                  {rows.map((c) => {
                    const key = `${g.id}:${c.id}`;
                    const v = amounts[key] ?? 0;
                    const active = activeKey === key;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => openRow(key)}
                        style={[
                          styles.assignRow,
                          {
                            backgroundColor: active
                              ? tokens.accentSoft
                              : tokens.card,
                            borderColor: active ? tokens.accent : tokens.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.assignEmoji,
                            {
                              backgroundColor: tokens.inputBg,
                              borderColor: tokens.border,
                            },
                          ]}
                        >
                          <Text style={{ fontSize: 17 }}>{c.emoji}</Text>
                        </View>
                        <Text
                          style={[
                            styles.assignName,
                            {
                              color: tokens.text,
                              fontFamily: fontFamily.bodyBold,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {c.name}
                        </Text>
                        <Text
                          style={[
                            styles.assignBucket,
                            {
                              color: bucketColors[buckets[key]].fg,
                              backgroundColor: bucketColors[buckets[key]].bg,
                              fontFamily: fontFamily.bodyExtraBold,
                            },
                          ]}
                        >
                          {BUCKET_LABELS[buckets[key]]}
                        </Text>
                        <Text
                          style={[
                            styles.assignAmount,
                            {
                              color: v ? tokens.text : tokens.text3,
                              fontFamily: fontFamily.displaySemiBold,
                            },
                          ]}
                        >
                          {formatMoney(v)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {error !== "" && (
        <Text style={[styles.errorText, { color: tokens.coral }]}>{error}</Text>
      )}

      <Pressable
        onPress={pressPrimaryCta}
        disabled={!canAdvance || pending}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canAdvance || pending, busy: pending }}
        style={[
          styles.cta,
          {
            backgroundColor:
              canAdvance && !pending ? tokens.accent : tokens.inputBg,
          },
        ]}
      >
        {pending ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[styles.ctaFill, saveFillStyle]}
            />
            <LoadingPhrase
              phrases={[saveStep || "Saving…"]}
              color={tokens.text3}
              style={[
                styles.ctaText,
                styles.ctaPhrase,
                { fontFamily: fontFamily.displaySemiBold },
              ]}
            />
          </>
        ) : (
          <Text
            style={[
              styles.ctaText,
              {
                color: canAdvance ? tokens.onAccent : tokens.text3,
                fontFamily: fontFamily.displaySemiBold,
              },
            ]}
          >
            {ctaLabel}
          </Text>
        )}
      </Pressable>
      {error === "" && hint !== "" && (
        <Text style={[styles.ctaHint, { color: tokens.text3 }]}>{hint}</Text>
      )}

      <BottomSheet visible={!!activeKey} onClose={closeRow}>
        {activeCat && (
          <View style={{ gap: 12 }}>
            <View
              style={[
                styles.sheetGrabber,
                { backgroundColor: tokens.borderStrong },
              ]}
            />
            <View style={styles.sheetHeader}>
              <Pressable
                onPress={() => setSheetEmojiOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityLabel={`Change emoji for ${activeCat.name}`}
                accessibilityState={{ expanded: sheetEmojiOpen }}
                style={[
                  styles.sheetEmoji,
                  {
                    backgroundColor: tokens.inputBg,
                    borderColor: sheetEmojiOpen ? tokens.accent : tokens.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 16 }}>{activeCat.emoji}</Text>
              </Pressable>
              <View
                style={[styles.sheetNameField, { borderColor: tokens.border }]}
              >
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder={activeCat.name}
                  placeholderTextColor={tokens.text3}
                  accessibilityLabel="Category name"
                  returnKeyType="done"
                  style={[
                    styles.sheetName,
                    {
                      color: tokens.text,
                      fontFamily: fontFamily.displaySemiBold,
                    },
                  ]}
                />
                <Pencil size={13} color={tokens.text3} strokeWidth={2.2} />
              </View>
              <View
                style={[
                  styles.remChipSmall,
                  {
                    backgroundColor: remColors.bg,
                    borderColor: remColors.color,
                  },
                ]}
              >
                <Text
                  style={[styles.remLabelSmall, { color: remColors.color }]}
                >
                  {remLabel}
                </Text>
                <Text
                  style={[
                    styles.remValueSmall,
                    {
                      color: remColors.color,
                      fontFamily: fontFamily.displaySemiBold,
                    },
                  ]}
                >
                  {formatMoney(Math.abs(rem))}
                </Text>
              </View>
            </View>
            {sheetEmojiOpen ? (
              <EmojiGrid
                current={activeCat.emoji}
                onPick={(emoji) => {
                  Haptics.selectionAsync().catch(() => {});
                  patchCat(activeCat.groupId, activeCat.catId, { emoji });
                  setSheetEmojiOpen(false);
                }}
              />
            ) : (
              <>
                <Text
                  style={[
                    styles.sheetAmount,
                    {
                      color: tokens.text,
                      fontFamily: fontFamily.displaySemiBold,
                    },
                  ]}
                >
                  {formatMoney(amounts[activeCat.key] ?? 0)}
                </Text>
                {rem !== 0 && (
                  <Pressable
                    onPress={fillRemainder}
                    style={[
                      styles.fillButton,
                      {
                        borderColor: tokens.accent,
                        backgroundColor: tokens.accentSoft,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.fillButtonLabel, { color: tokens.accent }]}
                    >
                      Give this the leftover
                    </Text>
                  </Pressable>
                )}
                <Numpad
                  extraKey="00"
                  onDigit={pressAmt}
                  onBackspace={() => pressAmt("del")}
                  onClear={clearAmt}
                />
              </>
            )}
            <Pressable
              onPress={closeRow}
              style={[styles.sheetDone, { backgroundColor: tokens.accent }]}
            >
              <Text
                style={[
                  styles.sheetDoneLabel,
                  {
                    color: tokens.onAccent,
                    fontFamily: fontFamily.displaySemiBold,
                  },
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={splitInfoOpen}
        onClose={() => setSplitInfoOpen(false)}
      >
        <View style={{ gap: 14 }}>
          <View
            style={[
              styles.sheetGrabber,
              { backgroundColor: tokens.borderStrong },
            ]}
          />
          <Text
            style={[
              styles.sheetName,
              { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
            ]}
          >
            How we split it
          </Text>
          <Text style={[styles.splitInfoBody, { color: tokens.text2 }]}>
            We tag each category as a need, a want or savings, then follow the
            50/30/20 rule.
          </Text>
          {BUCKETS.map((b) => (
            <View key={b} style={styles.splitInfoRow}>
              <View
                style={[
                  styles.splitInfoPct,
                  { backgroundColor: bucketColors[b].bg },
                ]}
              >
                <Text
                  style={{
                    color: bucketColors[b].fg,
                    fontFamily: fontFamily.displaySemiBold,
                    fontSize: 15,
                  }}
                >
                  {BUCKET_SHARES[b]}%
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: tokens.text,
                    fontFamily: fontFamily.bodyBold,
                    fontSize: 14,
                  }}
                >
                  {BUCKET_PLURALS[b]}
                </Text>
                <Text style={[styles.splitInfoBody, { color: tokens.text3 }]}>
                  {SPLIT_INFO[b]}
                </Text>
              </View>
            </View>
          ))}
          <Text style={[styles.splitInfoBody, { color: tokens.text3 }]}>
            Missing a group? Its share goes to the others. Tap any amount to
            change it.
          </Text>
        </View>
      </BottomSheet>

      <BottomSheet visible={!!emojiFor} onClose={() => setEmojiFor(null)}>
        {emojiFor && (
          <View style={{ gap: 14 }}>
            <View
              style={[
                styles.sheetGrabber,
                { backgroundColor: tokens.borderStrong },
              ]}
            />
            <Text
              style={[
                styles.sheetName,
                { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
              ]}
              numberOfLines={1}
            >
              Pick an emoji
              {emojiFor.name.trim() ? ` for ${emojiFor.name.trim()}` : ""}
            </Text>
            <EmojiGrid current={emojiFor.emoji} onPick={pickEmoji} />
          </View>
        )}
      </BottomSheet>

      <Toast
        trigger={rowToast.n}
        message={rowToast.message}
        icon={CopyX}
        style={{ top: insets.top + 12 }}
      />
    </View>
  );
}

// SetupWizard.dc.html:505-511 — the selected chip bounces (pillPop) and picks
// up a accent shadow instead of a flat border/background swap.
function QuickPickChip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const scale = useSharedValue(1);

  const onPressWithBounce = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress();
    scale.value = withSequence(
      withTiming(1.11, { duration: 143 }),
      withTiming(1.04, { duration: 197 }),
    );
  };

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: on ? scale.value : 1 }],
  }));

  return (
    <Animated.View
      style={[
        style,
        on && {
          shadowColor: tokens.accent,
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
      ]}
    >
      <Pressable
        onPress={onPressWithBounce}
        style={[
          styles.quickPick,
          {
            borderColor: on ? tokens.accent : tokens.borderStrong,
            backgroundColor: on ? tokens.accentSoft : tokens.inputBg,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.quickPickLabel,
            { color: on ? tokens.accent : tokens.text2 },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function SplitButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { tokens, motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withSpring(0.97, motion.springTight);
      }}
      onPressOut={() => {
        scale.value = reduceMotion ? 1 : withSpring(1, motion.springTight);
      }}
      style={[
        styles.splitButton,
        { borderColor: tokens.borderStrong, backgroundColor: tokens.inputBg },
        animatedStyle,
      ]}
    >
      <Text style={[styles.splitButtonLabel, { color: tokens.text2 }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// The 4x4 grid of EMOJI_CHOICES, shared by the group/category emoji sheet and
// the assign sheet.
function EmojiGrid({
  current,
  onPick,
}: {
  current: string;
  onPick: (emoji: string) => void;
}) {
  const { tokens } = useTheme();
  return (
    <View style={styles.emojiGrid}>
      {EMOJI_CHOICES.map((e) => {
        const active = e === current;
        return (
          <Pressable
            key={e}
            onPress={() => onPick(e)}
            accessibilityRole="button"
            accessibilityLabel={e}
            accessibilityState={{ selected: active }}
            style={[
              styles.emojiOpt,
              {
                backgroundColor: active ? tokens.accentSoft : tokens.inputBg,
                borderColor: active ? tokens.accent : tokens.border,
              },
            ]}
          >
            <View pointerEvents="none" style={styles.emojiOptContent}>
              <Text style={styles.emojiOptLabel}>{e}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 22 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: { flexDirection: "row", gap: 6 },
  title: {
    fontSize: 27,
    fontWeight: "600",
    lineHeight: 31,
    marginTop: 16,
    letterSpacing: -0.2,
  },
  blurb: { fontSize: 14, lineHeight: 21, marginTop: 7, maxWidth: 310 },
  stepBody: { flex: 1, marginTop: 4 },
  amountWrap: { paddingTop: 28, paddingBottom: 20 },
  quickRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  quickPick: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1,
  },
  quickPickLabel: { fontSize: 12, fontFamily: fontFamily.bodyBold },
  rowList: { gap: 8, paddingTop: 12 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addRowLabel: { fontSize: 13, fontFamily: fontFamily.bodyBold },
  microHint: { fontSize: 10, paddingHorizontal: 4, paddingTop: 2 },
  sectionList: { gap: 16, paddingTop: 12 },
  section: { gap: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 11, letterSpacing: 1, flex: 1 },
  sectionCount: { fontSize: 11 },
  sectionSubtotal: { fontSize: 13 },
  addPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addPillLabel: { fontSize: 12, fontFamily: fontFamily.bodyBold },
  errorText: { fontSize: 13, textAlign: "center", marginTop: 8 },
  cta: {
    marginTop: 12,
    minHeight: 54,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ctaText: { fontSize: 15 },
  ctaFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  ctaPhrase: { textAlign: "center" },
  ctaHint: { fontSize: 11, textAlign: "center", marginTop: 8, minHeight: 15 },
  pickOwn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pickOwnLabel: { fontSize: 13 },

  remChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 16,
    borderWidth: 1,
  },
  remLabel: { fontSize: 12, fontFamily: fontFamily.bodyExtraBold },
  remValue: { fontSize: 20 },
  splitRow: { flexDirection: "row", gap: 7, marginTop: 10 },
  splitButton: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 100,
    borderWidth: 1,
    alignItems: "center",
  },
  splitButtonLabel: { fontSize: 12, fontFamily: fontFamily.bodyBold },
  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  assignEmoji: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  assignName: { flex: 1, fontSize: 14 },
  assignAmount: { fontSize: 15 },
  assignBucket: {
    fontSize: 10,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  splitWhy: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 4,
    marginTop: 16,
    paddingHorizontal: 2,
  },
  splitKey: { flexDirection: "row", alignItems: "center", gap: 5 },
  splitDot: { width: 8, height: 8, borderRadius: 4 },
  splitKeyLabel: { fontSize: 12 },
  splitNote: { flexBasis: "100%", fontFamily: fontFamily.bodyMedium },
  splitInfoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  splitInfoPct: {
    width: 52,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  splitInfoBody: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.bodyMedium },

  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  emojiOpt: {
    width: "23%",
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiOptContent: {
    alignItems: "center",
    justifyContent: "center",
    height: 80,
  },
  emojiOptLabel: {
    fontSize: 26,
    textAlign: "center",
    includeFontPadding: false,
  },
  sheetGrabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 100,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sheetEmoji: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetName: { flex: 1, fontSize: 16, paddingVertical: 4 },
  sheetNameField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderBottomWidth: 1,
  },
  remChipSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  remLabelSmall: { fontSize: 10, fontFamily: fontFamily.bodyExtraBold },
  remValueSmall: { fontSize: 13 },
  sheetAmount: {
    fontSize: 38,
    textAlign: "center",
    letterSpacing: -0.4,
    paddingVertical: 4,
  },
  fillButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1,
  },
  fillButtonLabel: { fontSize: 12, fontFamily: fontFamily.bodyBold },
  sheetDone: {
    minHeight: 50,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDoneLabel: { fontSize: 15 },
});
