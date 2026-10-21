import { useBudgetSpaces } from "@/src/hooks/useBudgetSpaces";
import { expenseSuccessParams } from '@/src/lib/expenseSuccessParams'
import { ExpenseNoticeScreen } from '@/src/features/log-expense/ExpenseNoticeScreen'
import { liveAccounts, useAccounts } from "@/src/hooks/useAccounts";
import { AccountChips } from "@/src/components/shared/AccountChips";
import { defaultAccountFor } from "@/src/lib/defaultAccount";
import { ExpenseConflictReview } from '@/src/features/log-expense/ExpenseConflictReview'
import { ExpensePhotoField, pickPhoto, type PickedPhoto } from '@/src/features/log-expense/ExpensePhotoField'
import { takeSharedPhoto } from '@/src/lib/pendingShare'
import { AutoCategoryPill, MIN_SPIN_MS, PILL_MAX_WIDTH } from '@/src/features/log-expense/AutoCategoryPill'
import { createThinkingGate, type ThinkingGate } from '@/src/lib/thinkingGate'
import { ExpenseWriteError, expenseChanges, expenseDraft, paymentMethodOf, rebaseExpenseDraft, type ExpenseDraft, type PaymentMethod } from '@/src/lib/expenseConflict'
import type { CategoryRow, ExpenseRow } from '@/src/types'
import { useCurrency } from '@/src/context/CurrencyContext'
import { suggestCategoryLLM } from "@/src/api/categoryMap";
import { AddCategoryForm } from "@/src/components/shared/AddCategoryForm";
import { CategoryPickerSheet } from "@/src/components/shared/CategoryPickerSheet";
import { DatePicker } from "@/src/components/shared/DatePicker";
import { BottomSheet } from "@/src/components/shared/Modal";
import { AmountText } from "@/src/components/ui/AmountText";
import { Numpad } from "@/src/components/ui/Numpad";
import { Nudge } from "@/src/components/ui/Nudge";
import { useAmountEntry } from '@/src/components/ui/useAmountEntry';
import { clearLogExpenseDraft, getLogExpenseDraft, setLogExpenseDraft } from '@/src/features/log-expense/draft';
import { evaluateAmount, formatExpression, hasOperator } from '@/src/lib/calcAmount';
import {
EMPTY_SUBMIT,
useLogExpenseSubmitPublisher,
} from "@/src/features/log-expense/SubmitContext";
import {
missingFields,
} from "@/src/features/log-expense/missingFields";
import { useCategories } from "@/src/hooks/useCategories";
import { useCategoryMap } from "@/src/hooks/useCategoryMap";
import {
useAddExpense,
useExpensePhotoUrl,
useRecentExpenses,
useSaveExpensePhoto,
useUpdateExpense,
} from "@/src/hooks/useExpenses";
import { unusualAmount } from "@/src/lib/unusualAmount";
import { todayLocal } from "@/src/lib/date";
import { splitEmoji } from "@/src/lib/emoji";
import { categoryIconKey } from "@/src/lib/categoryIcons";

import { useOnline } from "@/src/lib/netStatus";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { NAV_HEIGHT } from "@/src/theme/scale";
import { useIsFocused,useLocalSearchParams,useRouter } from "expo-router";
import { Camera, CaretDown, ChatText, Plus, UploadSimple, Warning } from "@/src/components/shared/icons";
import { useCaptureTip } from "@/src/hooks/useCaptureTip";
import { useFeedOn } from "@/src/hooks/useActivityView";
import { noteManualLog, type CaptureTipReason } from "@/src/lib/captureTip";
import { CaptureTipBubble } from "@/src/features/log-expense/CaptureTipBubble";
import { IncomeFloodButton } from "@/src/features/log-expense/IncomeFloodButton";
import { useCachedUser } from "@/src/hooks/useUser";
import { isHidden } from "@/src/lib/features";
import { useBounce } from "@/src/hooks/useBounce";
import Reanimated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import {
Animated,
Image,
Keyboard,
Pressable,
ScrollView,
StyleSheet,
Text,
TextInput,
View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { track } from "@/src/lib/analytics";
import { isRefreshingToken } from "@/src/api/accessMode";
import { tap } from "@/src/lib/haptics";
import { Alert } from "@/src/components/ui/AlertHost";
import { mintExpensePayload } from "@/src/api/expenses";
import { discardFailed, retryFailed } from "@/src/lib/pendingExpenses";
import { flush } from "@/src/sync/flush";
import { insertExpense, queuedRow } from "@/src/lib/optimisticExpenses";
import { useQueryClient } from "@tanstack/react-query";
import { BudgetIcon } from '@/src/components/budgets/BudgetIcon'
import { BudgetSwitcherSheet } from '@/src/components/budgets/BudgetSwitcherSheet'
import { withReadOnlyGate } from '@/src/components/budgets/ReadOnlyNotice'

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

// Subset of Web's autoCategory.ts::suggestCategory — matches item words against
// the category-map dictionary. Skips the fuzzy old-category-name fallback since
// that's for renamed-category migration, not relevant when logging a new expense.
function suggestCategory(
  item: string,
  words: Record<string, string>,
  categories: string[],
): string {
  if (!item.trim()) return "";
  const matched = new Map<string, number>();
  for (const word of item.toLowerCase().split(/\s+/)) {
    if (word.length < 2) continue;
    const cat = words[word];
    if (cat && categories.includes(cat))
      matched.set(cat, (matched.get(cat) ?? 0) + 1);
  }
  let best = "";
  let bestScore = 0;
  for (const [cat, score] of matched) {
    if (score > bestScore) {
      best = cat;
      bestScore = score;
    }
  }
  return best;
}

// How long a save may hold the screen before it's reported as stuck.
export const SAVE_STUCK_MS = 10_000;

// Shortest description worth an AI call; "ba" is half a word, not an expense.
const MIN_LLM_CHARS = 3;

/**
 * The app's primary verb, as a full-bleed accent screen rather than a form:
 * amount first on a custom keypad, description second, category picked from a
 * recently-used rail. Date, payment method and notes all have good defaults and
 * live behind the "More" disclosure, so the common path stays three inputs.
 *
 * Route-param driven: Activity passes {id, timestamp, item, amountInr, category,
 * date, notes, paymentMethod, hasPhoto} of an existing row to enter edit mode. No params →
 * a fresh entry. Edit reuses this screen rather than a second form; the keypad
 * starts on the existing amount and backspaces from there.
 */
const CAPTURE_TIP_COPY: Record<CaptureTipReason, { title: string; body: string }> = {
  batch: { title: "Logging a few?", body: "Type them all at once in Ask Aviary, like “taxi 240, lunch 150”." },
  gap: { title: "Been a couple of days?", body: "Type whatever you remember in Ask Aviary, like “taxi 240, lunch 150”." },
};

export default withReadOnlyGate(LogExpenseScreen);

function LogExpenseScreen() {
  const { formatAmountInput, formatMoney } = useCurrency()

  const { tokens, space, radius, type, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const isFocused = useIsFocused();
  const online = useOnline();

  const origId = str(params.id) || undefined;
  const origTimestamp = str(params.timestamp);
  const isEdit = origTimestamp !== "";
  // Opened from Activity's "couldn't be saved" row: this entry is in the failed queue.
  const failedClientId = str(params.failedClientId) || undefined;
  const { multi: multiBudget, active: activeBudget } = useBudgetSpaces();
  const [budgetSheet, setBudgetSheet] = useState(false);
  const cachedUser = useCachedUser();
  const feedOn = useFeedOn().on;
  const showIncome = !isEdit && !isHidden(cachedUser, "income");
  // "Several at once" runs through Ask Aviary, so it goes when that does.
  const showCapture = !isEdit && !isHidden(cachedUser, "askAviary");
  // Off while hidden too, so unseen visits don't use up the tip's showings.
  const captureTip = useCaptureTip(showCapture && online);
  const severalBounce = useBounce(-3);
  const origItem = str(params.item);
  const origAmountInr = Number(params.amountInr) || 0;

  const categoriesQ = useCategories();
  const categoryMapQ = useCategoryMap();
  const expensesQ = useRecentExpenses();
  const addExpense = useAddExpense();
  const qc = useQueryClient();
  const updateExpense = useUpdateExpense();

  const publishLogExpenseSubmit = useLogExpenseSubmitPublisher();
  const addMutate = addExpense.mutate;
  const updateMutate = updateExpense.mutate;
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);

  // A plain visit (no edit row, no prefill) picks up where the last one left
  // off, and is the only kind that saves one: a prefill must not overwrite it.
  const [plainVisit] = useState(() => Object.keys(params).length === 0);
  const [draft] = useState(() => (plainVisit ? getLogExpenseDraft() : null));
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [createdCategory, setCreatedCategory] = useState<CategoryRow | null>(null);
  // `expr` is what was typed, maybe a sum ("5+5"); `amount` is its total.
  const { amount: expr, setAmount, pushDigit, handleBackspace, shake } = useAmountEntry(draft?.amount ?? (origAmountInr ? String(origAmountInr) : ""), { shakeAtZero: true });
  const amount = hasOperator(expr) ? String(evaluateAmount(expr)) : expr;
  const [item, setItem] = useState(draft?.item ?? origItem);
  const [category, setCategory] = useState(draft?.category ?? str(params.category));
  const [categoryTouched, setCategoryTouched] = useState(
    draft?.categoryTouched ?? str(params.category) !== "",
  );
  const [date, setDate] = useState(draft?.date ?? (str(params.date).slice(0, 10) || todayLocal()));
  const [notes, setNotes] = useState(draft?.notes ?? str(params.notes));
  // No picker for this without accounts (Web does the same): new expenses log
  // as bank, and an edit keeps the row's own method.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    draft?.paymentMethod ?? paymentMethodOf(str(params.paymentMethod)),
  );
  // null: follow the category's usual account (src/lib/defaultAccount.ts).
  // An edit starts on the row's own account, even none.
  const [accountPick, setAccountPick] = useState<string | null>(
    draft?.accountId !== undefined ? draft.accountId : isEdit ? str(params.accountId) : str(params.accountId) || null,
  );
  const accountsQ = useAccounts();
  const accounts = useMemo(() => liveAccounts(accountsQ.data), [accountsQ.data]);
  const accountId = accountPick ?? defaultAccountFor(expensesQ.data ?? [], category, accounts);
  const [base, setBase] = useState<ExpenseDraft>({ item: origItem, amount: String(origAmountInr), date: str(params.date).slice(0, 10), category: str(params.category), paymentMethod: paymentMethodOf(str(params.paymentMethod)), notes: str(params.notes), accountId: str(params.accountId) });
  const [expectedVersion, setExpectedVersion] = useState(str(params.version) === '' ? undefined : Number(str(params.version)));
  const [conflict, setConflict] = useState<ExpenseRow | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [showDeletedNotice, setShowDeletedNotice] = useState(false);
  const [error, setError] = useState("");
  const [logSuccess, setLogSuccess] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // One optional photo: the camera button under the amount, or the More
  // sheet (library, view, remove). `photo` is newly picked and not yet
  // uploaded; it goes up after the expense saves (see syncPhoto). Edit mode
  // needs the row's server id to address the photo at all.
  const photoAllowed = !isEdit || !!origId;
  const hasSavedPhoto = isEdit && str(params.hasPhoto) === "1";
  // Shared from a UPI app (app/modals/shared-payment.tsx): what it found is in the params, and
  // a screenshot it couldn't read comes attached. `dupe` when it looks logged already.
  const shared = str(params.shared) === "1";
  const sharedDupe = shared && str(params.dupe) === "1";
  // It couldn't be read (unclear, offline, or this month's AI reads are used up): say so, not a bare form.
  const sharedUnread = shared && str(params.unread) === "1";
  const [photo, setPhoto] = useState<PickedPhoto | null>(() => (shared ? takeSharedPhoto() : null));
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const savedPhotoQ = useExpensePhotoUrl(origId, hasSavedPhoto);
  const savePhoto = useSaveExpensePhoto();
  const savePhotoAsync = savePhoto.mutateAsync;
  const showSavedPhoto = hasSavedPhoto && !photoRemoved;
  const photoUri = photo?.uri ?? (showSavedPhoto ? savedPhotoQ.data ?? null : null);
  // Bumped each time the nav's add circle is tapped with the form incomplete.
  // 0 = never, so nothing is highlighted before the first blocked submit.
  const [nudge, setNudge] = useState(0);
  // Typo guard: an amount far above the category's usual blocks the first
  // save with a toast; saving again with the same amount and category goes through.
  const [unusualWarnedFor, setUnusualWarnedFor] = useState("");
  const [unusualNudge, setUnusualNudge] = useState(0);
  // Set only by a successful add (never an edit) right before setLogSuccess —
  // the effect below reads it to tell the two cases apart.
  const pendingAddNavRef = useRef<null | {
    pathname: "/modals/expense-added";
    params: Record<string, string>;
  }>(null);


  // True while the pill shows a category we picked, not one the user chose.
  // Drives the "picked for you" a11y label and the landing pop.
  const [autoPicked, setAutoPicked] = useState(draft?.autoPicked ?? false);
  // Where the last auto-pick came from, for the acceptance-rate event on save:
  // the local keyword map, the AI fallback, or "none" when both came up empty.
  // Null if prediction never ran. pickMs is the wait from last keystroke to pick.
  const suggestedBy = useRef<null | "keyword" | "ai" | "none">(null);
  const pickMs = useRef(0);
  // AI answers by trimmed description, so a trailing space or the keyword map
  // arriving late doesn't spend another AI request on the same text.
  const llmPicks = useRef(new Map<string, string>());
  // "Picking…" is only shown for the slow AI fallback, and only once it's been
  // pending long enough to be worth showing (see thinkingGate.ts).
  const [suggesting, setSuggesting] = useState(false);
  const gateRef = useRef<ThinkingGate | null>(null);
  if (!gateRef.current) gateRef.current = createThinkingGate(setSuggesting, { minVisibleMs: MIN_SPIN_MS });
  useEffect(() => () => gateRef.current?.cancel(), []);

  // A manual category choice wins for the current description. For a new
  // expense, changing that description releases the choice and predicts again.
  useEffect(() => {
    const gate = gateRef.current!;
    // No wait on the keyword map: while it loads (or if it failed), the AI still answers.
    if (categoryTouched) {
      gate.cancel();
      return;
    }
    const clear = () => {
      suggestedBy.current = null;
      setCategory("");
      setAutoPicked(false);
    };
    if (!item.trim()) {
      gate.cancel();
      clear();
      return;
    }
    let cancelled = false;
    const startedAt = Date.now();
    const apply = (name: string, by: "keyword" | "ai") => () => {
      if (cancelled || !name) return;
      suggestedBy.current = by;
      pickMs.current = Date.now() - startedAt;
      setCategory(name);
      setAutoPicked(true);
    };
    const categoryNames = categories.map((c) => c.name);
    // The keyword map is local, so it answers on the keystroke. Only the AI waits for a pause.
    const suggested = suggestCategory(item, categoryMapQ.data?.words ?? {}, categoryNames);
    if (suggested) {
      gate.finish(apply(suggested, "keyword"));
      return;
    }
    // No keyword pick: an old keyword pick doesn't describe this text, so it can't
    // stay up. An AI pick (or its Miscellaneous fallback) stays until a new answer lands.
    if (suggestedBy.current !== "ai" && suggestedBy.current !== "none") clear();
    if (item.trim().length < MIN_LLM_CHARS) {
      // Too short to ask the AI, so no new answer will replace the pick.
      gate.cancel();
      clear();
      return;
    }
    const cached = llmPicks.current.get(item.trim());
    if (cached && categoryNames.includes(cached)) {
      gate.finish(apply(cached, "ai"));
      return;
    }
    const timer = setTimeout(() => {
      gate.start();
      suggestCategoryLLM(item, categoryNames).then((llmSuggested) => {
        if (cancelled) return;
        if (categoryNames.includes(llmSuggested)) {
          llmPicks.current.set(item.trim(), llmSuggested);
          gate.finish(apply(llmSuggested, "ai"));
          return;
        }
        // Nothing found: land on Miscellaneous, like Web. Not an auto-pick, so no ✨.
        const misc = categoryNames.find((n) => n.toLowerCase().includes("miscellaneous"));
        gate.finish(() => {
          if (cancelled) return;
          suggestedBy.current = "none";
          pickMs.current = Date.now() - startedAt;
          setCategory(misc ?? "");
          setAutoPicked(false);
        });
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [item, categoryMapQ.data, categories, categoryTouched]);

  useEffect(() => {
    if (!plainVisit || logSuccess) return;
    setLogExpenseDraft({ amount: expr, item, category, categoryTouched, autoPicked, date, notes, paymentMethod, accountId: accountPick });
  }, [plainVisit, logSuccess, expr, item, category, categoryTouched, autoPicked, date, notes, paymentMethod, accountPick]);

  function handleItemChange(value: string) {
    if (value === item) return;
    setItem(value);
    // The current pick stays up while the prediction effect reruns: blanking it
    // here made the pill land again on every keystroke, even for the same pick.
    if (!isEdit) {
      gateRef.current?.cancel();
      // A manual choice isn't an AI pick, so the next prediction may clear it.
      if (categoryTouched) suggestedBy.current = null;
      setCategoryTouched(false);
    }
  }

  const rollIcons = useMemo(
    () => [...new Set(categories.map((c) => categoryIconKey(c.name, c.icon, c.group)))],
    [categories],
  );

  const selectedCategory = categories.find((c) => c.name === category)
    ?? (createdCategory?.name === category ? createdCategory : undefined);

  const parsedAmount = Number(amount);
  const missing = missingFields({ amount, category });
  // "What was it for?" is optional: left blank, the row is named after its category.
  const savedItem = item.trim() || splitEmoji(category).text;
  // With accounts the server takes the payment method from the account's
  // type, so an edit only ever changes one of the two.
  const editedDraft = useMemo<ExpenseDraft>(() => ({
    item, amount, date, category, notes,
    paymentMethod: accounts.length > 0 ? base.paymentMethod : paymentMethod,
    accountId: accounts.length > 0 ? accountId : base.accountId,
  }), [item, amount, date, category, notes, paymentMethod, accountId, accounts.length, base]);
  // Waits out a cold accounts fetch (one request) so the expense lands on the
  // account it would default to. Never offline: logging must keep working there.
  const accountsPending = online && accountsQ.isLoading;
  const canSubmit = missing.length === 0 && !conflict && !deleted && !accountsPending;
  // A blocked + does the next step instead of describing it: with only the
  // category left it opens the picker; otherwise the amount shakes and the
  // category pill lights up, which is all the keypad screen needs to say.
  const onlyCategoryMissing = missing.length === 1 && missing[0] === "category";
  const onInvalid = useCallback(() => {
    if (onlyCategoryMissing) setPickerOpen(true);
    else setNudge((n) => n + 1);
  }, [onlyCategoryMissing]);
  const flag = (f: (typeof missing)[number]) => nudge > 0 && missing.includes(f);
  const saving = addExpense.isPending || updateExpense.isPending || savePhoto.isPending;
  const unusual = useMemo(
    () => (isEdit && amount === base.amount ? null : unusualAmount(parsedAmount, category, expensesQ.data ?? [], date)),
    [isEdit, amount, base.amount, parsedAmount, category, expensesQ.data, date],
  );

  // Edit: let the inline checkmark finish drawing before navigating back
  // (1100ms, same beat CheckIcon uses elsewhere). Add: let the nav circle's
  // save animation (ripple -> tick, ~950ms) finish before replacing this
  // screen with the success screen — pendingAddNavRef, set right before
  // setLogSuccess(true) in the add branch below, tells the two apart.
  useEffect(() => {
    if (!logSuccess) return;
    const pending = pendingAddNavRef.current;
    const timer = setTimeout(
      () => (pending ? router.replace(pending) : router.back()),
      pending ? 950 : 1100,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logSuccess]);

  // A save that holds this screen past SAVE_STUCK_MS reports where it's
  // waiting, so the next hang shows up in PostHog with its stage instead of
  // as a quiet gap between events (2026-10-19). Unmounting cancels it.
  const stuckStage = useRef<() => string>(() => "request");
  stuckStage.current = () => (logSuccess ? "navigation" : isRefreshingToken() ? "token_refresh" : "request");
  const holding = saving || logSuccess;
  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => track("save_stuck", { stage: stuckStage.current(), mode: isEdit ? "edit" : "add" }), SAVE_STUCK_MS);
    return () => clearTimeout(timer);
  }, [holding, isEdit]);

  // Runs once the expense itself is saved, in the background: the screen
  // moves on without waiting, since an upload on a slow connection can take
  // up to its 60s timeout. A photo failure never undoes that save; it only
  // gets a friendly heads-up, even from the next screen. Not queued offline in v1, so a
  // create that landed in the pending queue (no server id yet) skips it.
  const syncPhoto = useCallback(async (id: string | undefined, queued: boolean) => {
    if (!photo && !(hasSavedPhoto && photoRemoved)) return;
    try {
      if (!id || queued) throw new Error("no server id");
      await savePhotoAsync({ id, photo: photo && { base64: photo.base64, mimeType: photo.mimeType } });
      if (photo) track("expense_photo_added", { from: "log" });
    } catch {
      if (photo) Alert.alert("Photo didn't upload", "Your expense is saved, but the photo didn't upload. Try adding it again from Activity.");
      else Alert.alert("Photo's still there", "Your changes are saved, but the photo didn't come off. Try removing it again.");
    }
  }, [photo, hasSavedPhoto, photoRemoved, savePhotoAsync]);

  // The warning sits under the amount until the user taps + again, or
  // changes the amount or category it was about.
  const warnKey = `${amount}|${category}`;
  const unusualPending = !!unusual && unusualWarnedFor === warnKey;
  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    setError("");
    if (unusual && unusualWarnedFor !== warnKey) {
      setUnusualWarnedFor(warnKey);
      setUnusualNudge((n) => n + 1);
      return;
    }
    if (isEdit) {
      const updates = expenseChanges(base, { ...editedDraft, item: savedItem });
      const finishEdit = () => { void syncPhoto(origId, false); setLogSuccess(true); };
      if (!Object.keys(updates).length) { finishEdit(); return; }
      updateMutate(
        {
          id: origId,
          version: expectedVersion,
          timestamp: origTimestamp,
          item: origItem,
          amountInr: origAmountInr,
          updates,
        },
        {
          onSuccess: finishEdit,
          onError: (err) => {
            if (err instanceof ExpenseWriteError) {
              if (err.status === 409 && err.current) {
                Keyboard.dismiss();
                setConflict(err.current);
                setError('');
                return;
              }
              if (err.status === 404) {
                Keyboard.dismiss(); setDeleted(true); setShowDeletedNotice(true); setError(''); return;
              }
            }
            setError("Couldn't save your changes. Check your connection and try again.");
          },
        },
      );
    } else {
      // Kept (still auto-picked at save) or overridden (the user changed it).
      if (suggestedBy.current) track("ai_category_suggested", { accepted: autoPicked, source: suggestedBy.current, ms: pickMs.current });
      const row = {
        item: savedItem,
        amount_inr: String(parsedAmount),
        category,
        date,
        notes: notes.trim(),
        // With an account, its type is the payment method, sent too so a
        // queued create on an account archived since still funds the right envelope.
        payment_method: accountId ? accounts.find((a) => a.id === accountId)?.type ?? paymentMethod : paymentMethod,
        ...(accountId ? { account_id: accountId } : {}),
        source: 'manual' as const,
      };
      // A create the sync gave up on goes back in the queue under its own
      // client_id, fixes included, and the drain takes it from there.
      if (failedClientId) {
        const payload = mintExpensePayload({ ...row, client_id: failedClientId });
        void retryFailed(payload).then((entry) => {
          // Same as a queued add: show it in the cached lists now (envelopes
          // count it) rather than waiting for the drain's refetch. The retry
          // is re-pinned to the budget on screen, so it always belongs here.
          if (entry) insertExpense(qc, queuedRow(payload));
          return flush();
        });
        setLogSuccess(true);
        return;
      }
      addMutate(
        {
          ...row,
          // A slow save finishes in the background instead of holding this
          // screen. Not with a photo: its upload needs the server id.
          instant: !photo,
        },
        {
          // replace, not push: this screen is spent, and Done on the success
          // screen should land on home with nothing stale behind it. `id` and
          // `timestamp` come back from the POST so Undo can address the row.
          // The replace itself is deferred: stash it and flip logSuccess so
          // the nav circle's save animation plays first (see the effect above).
          onSuccess: (res) => {
            clearLogExpenseDraft();
            noteManualLog();
            void syncPhoto(res.id, res.pending);
            pendingAddNavRef.current = {
              pathname: "/modals/expense-added",
              params: {
                ...expenseSuccessParams(res, {
                  item: savedItem,
                  amount: String(parsedAmount),
                  category,
                  date,
                  notes: notes.trim(),
                  paymentMethod,
                  ...(accountId ? { accountId } : {}),
                }),
                ...(shared ? { shared: "1" } : {}),
                // What it was paid with: an account's type (bank, cash, card) wins over the toggle.
                paidWith: row.payment_method,
              },
            };
            setLogSuccess(true);
          },
          // A failed *add* gets its own screen, same as a successful one — the
          // inline error line below is easy to miss on the flood screen, and it
          // offers no next action. replace for the same reason as onSuccess:
          // this form entry is spent, and Dismiss replaces a fresh one back in
          // with these values prefilled.
          onError: () =>
            router.replace({
              pathname: "/modals/expense-failed",
              params: {
                item: item.trim(),
                amount: String(parsedAmount),
                category,
                date,
                notes: notes.trim(),
                paymentMethod,
                ...(accountId ? { accountId } : {}),
              },
            }),
        },
      );
    }
  }, [canSubmit, unusual, unusualWarnedFor, warnKey, base, expectedVersion, isEdit, origId, origTimestamp, origItem, origAmountInr, item, savedItem, parsedAmount, date, category, notes, paymentMethod, accountId, accounts, editedDraft, router, addMutate, updateMutate, autoPicked, syncPhoto, photo, failedClientId, qc, shared]);

  // Publish only when the action or its visible state changes, and only while
  // focused: a prefilled log-expense (habit nudge) stacks over the launch one,
  // and a blank screen underneath re-publishing would point the nav circle at
  // its empty form. Clear on the way out only if the snapshot is still ours.
  useEffect(() => {
    if (!isFocused) return;
    const snapshot = { canSubmit, saving, success: logSuccess, submit: handleSubmit, onInvalid };
    publishLogExpenseSubmit(snapshot);
    return () => publishLogExpenseSubmit((current) => (current === snapshot ? EMPTY_SUBMIT : current));
  }, [isFocused, canSubmit, saving, logSuccess, handleSubmit, onInvalid, publishLogExpenseSubmit]);

  function reviewLatest(keepDraft: boolean) {
    if (!conflict) return;
    const draft = keepDraft ? rebaseExpenseDraft(base, editedDraft, conflict) : expenseDraft(conflict);
    setBase(expenseDraft(conflict));
    setExpectedVersion(conflict.version);
    setItem(draft.item); setAmount(draft.amount); setDate(draft.date); setCategory(draft.category);
    setPaymentMethod(draft.paymentMethod); setNotes(draft.notes); setAccountPick(draft.accountId);
    setCategoryTouched(true);
    setAutoPicked(false);
    setConflict(null); setError('');
  }

  const onAccentDim = "rgba(255, 255, 255, 0.7)";
  const fieldBg = "rgba(255, 255, 255, 0.16)";

  return (
    <View style={[styles.screen, { backgroundColor: tokens.accent }]}>
      {showDeletedNotice && <ExpenseNoticeScreen status={404} action="edit" onBack={() => setShowDeletedNotice(false)} />}
      {conflict && (
        <ExpenseConflictReview latest={conflict} original={base} draft={editedDraft} accounts={accountsQ.data ?? []}
          onChoose={reviewLatest} onClose={() => { setConflict(null); setError(''); }} />
      )}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + space.sm, paddingHorizontal: space.lg },
        ]}
      >
        <Text
          style={[
            styles.headerTitle,
            {
              color: "#ffffff",
              fontFamily: fontFamily.displaySemiBold,
              fontSize: type.bodyLg,
              flex: 1,
              textAlign: "center",
            },
          ]}
        >
          {isEdit ? "Edit expense" : "Log expense"}
        </Text>
        {showCapture && (
          // Several spends at once go through the money brain: type them,
          // review the list it reads out, log them together. Kept as a quiet
          // header icon; the capture tip points at it at the right moment.
          <Reanimated.View style={[styles.severalButton, { left: space.lg, top: insets.top + space.xs }, severalBounce.style]}>
            <Pressable
              onPressIn={severalBounce.onPressIn}
              onPressOut={severalBounce.onPressOut}
              onPress={() => {
                tap();
                severalBounce.kick();
                captureTip.close("try");
                router.push({ pathname: "/modals/money-brain", params: { capture: "1" } });
              }}
              style={[styles.severalIcon, { backgroundColor: fieldBg }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Log several spends at once"
            >
              <ChatText size={18} color="#ffffff" />
            </Pressable>
          </Reanimated.View>
        )}
      </View>

      {multiBudget && activeBudget && (
        // With 2+ budgets, always say which one this lands in. A new expense
        // can switch budgets from here: the form stays, the category and
        // account (which belong to the old budget) clear.
        <View style={{ alignItems: "center", paddingHorizontal: space.lg }}>
          <Pressable
            testID="log-budget"
            disabled={isEdit}
            onPress={() => { tap(); setBudgetSheet(true); }}
            hitSlop={8}
            accessibilityRole={isEdit ? undefined : "button"}
            accessibilityLabel={`${isEdit ? "In" : "Logging to"} ${activeBudget.name}`}
            accessibilityHint={isEdit ? undefined : "Switch budgets"}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%", paddingHorizontal: isEdit ? 0 : 10, paddingVertical: isEdit ? 0 : 4, borderRadius: radius.full, backgroundColor: isEdit ? "transparent" : fieldBg }}
          >
            <Text style={{ color: onAccentDim, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>{isEdit ? "In" : "Logging to"}</Text>
            <BudgetIcon budget={activeBudget} size={type.micro} color={isEdit ? onAccentDim : "#ffffff"} />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: isEdit ? onAccentDim : "#ffffff", fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>{activeBudget.name}</Text>
            {!isEdit && <CaretDown size={type.micro} color="#ffffff" weight="bold" />}
          </Pressable>
        </View>
      )}
      {!isEdit && (
        <BudgetSwitcherSheet
          visible={budgetSheet}
          onClose={() => setBudgetSheet(false)}
          onSwitch={() => { setCategory(""); setCategoryTouched(false); setAutoPicked(false); setAccountPick(null); }}
        />
      )}

      {showCapture && captureTip.reason && nudge === 0 && unusualNudge === 0 && (
        // The moment it would help (src/lib/captureTip.ts): logging a few by
        // hand, or back after a couple of days with a backlog. Pops out of the
        // header icon so it teaches where the feature lives. Steps aside for
        // good once a save toast needs the same spot.
        <CaptureTipBubble
          anchor={{ top: insets.top + space.xs, left: space.lg, size: 36 }}
          title={CAPTURE_TIP_COPY[captureTip.reason].title}
          body={CAPTURE_TIP_COPY[captureTip.reason].body}
          onTry={() => {
            captureTip.close("try");
            router.push({ pathname: "/modals/money-brain", params: { capture: "1" } });
          }}
          onDismiss={() => captureTip.close("dismiss")}
        />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: space.lg, gap: space.lg, flexGrow: 1 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.amountWrap, { gap: space.sm }]}>
          {unusualPending && unusual && (
            // Typo guard, inline so it reads as part of the amount rather
            // than a system alert. Gone once the amount or category changes.
            <Reanimated.View
              entering={FadeIn.duration(motion.base)}
              exiting={FadeOut.duration(motion.fast)}
              accessibilityRole="alert"
              style={[
                styles.unusualNote,
                { backgroundColor: fieldBg, borderRadius: radius.xl, paddingHorizontal: space.md, gap: space.xs },
              ]}
            >
              <Warning size={16} color="#ffffff" />
              <Text style={{ color: "#ffffff", fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>
                Way above your usual {formatMoney(Math.round(unusual.typical))}. Tap again to save.
              </Text>
            </Reanimated.View>
          )}

          <Nudge trigger={nudge} active={missing.includes("amount")}>
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
              value={parsedAmount || 0}
              rawText={formatAmountInput(amount)}
              fit
              size={type.hero * 1.3}
              color={amount === "" && !flag("amount") ? onAccentDim : "#ffffff"}
              animate
              ignoreHide
            />
          </Animated.View>
          </Nudge>

          {hasOperator(expr) && (
            <Text
              style={{
                color: onAccentDim,
                fontFamily: fontFamily.bodySemiBold,
                fontSize: type.caption,
              }}
            >
              {formatExpression(expr)}
            </Text>
          )}

          <View style={[styles.quickRow, { gap: space.xl }]}>
          {/* The moment you log is the moment to snap it, so the camera sits
              out here; the library and removing a photo stay in More. It
              comes with the photo feed, the place those photos show up. */}
          {photoAllowed && online && feedOn && (
            <Pressable
              onPress={async () => {
                tap();
                if (photoUri) {
                  setShowMore(true);
                  return;
                }
                const picked = await pickPhoto("camera");
                if (picked) {
                  setPhoto(picked);
                  setPhotoRemoved(false);
                }
              }}
              disabled={saving || logSuccess}
              accessibilityRole="button"
              accessibilityLabel={photoUri ? "Photo added. View or change it" : "Take a photo"}
              style={[styles.moreToggle, { gap: space.xs }]}
              hitSlop={8}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.quickThumb} />
              ) : (
                <Camera size={16} color={onAccentDim} />
              )}
              <Text style={{ color: onAccentDim, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>
                {photoUri ? "Photo added" : "Photo"}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              tap();
              setShowMore(true);
            }}
            style={[styles.moreToggle, { gap: space.xs }]}
            hitSlop={8}
          >
            <Text
              style={[
                styles.moreLabel,
                {
                  color: onAccentDim,
                  fontFamily: fontFamily.bodySemiBold,
                  fontSize: type.caption,
                },
              ]}
            >
              More
            </Text>
            <CaretDown size={16} color={onAccentDim} />
          </Pressable>
          </View>


        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: space.lg,
            paddingBottom: NAV_HEIGHT + insets.bottom + space.lg,
            gap: space.md,
          },
        ]}
      >
        {failedClientId && (
          <View style={{ gap: space.sm }}>
            <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>
              This one couldn&apos;t be saved. Fix anything that looks off, then try again.
            </Text>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {[
                { label: "Try again", onPress: handleSubmit },
                {
                  label: "Discard",
                  onPress: () =>
                    Alert.alert("Discard this expense?", "It never reached your account, so it's gone for good.", [
                      { text: "Keep it", style: "cancel" },
                      { text: "Discard", style: "destructive", onPress: () => void discardFailed(failedClientId).then(() => router.back(), () => Alert.alert("Couldn't discard this expense", "Try again in a moment.")) },
                    ]),
                },
              ].map((b) => (
                <Pressable
                  key={b.label}
                  accessibilityRole="button"
                  disabled={holding}
                  onPress={() => { tap(); b.onPress(); }}
                  style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.full, backgroundColor: fieldBg }}
                >
                  <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold }}>{b.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {sharedDupe && error === "" && (
          <Text
            testID="shared-dupe"
            style={[
              styles.error,
              { color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold },
            ]}
          >
            Looks already logged. Add it again only if you paid twice.
          </Text>
        )}
        {sharedUnread && error === "" && (
          <Text
            testID="shared-unread"
            style={[
              styles.error,
              { color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold },
            ]}
          >
            Couldn&apos;t read that one, so add the amount yourself.
          </Text>
        )}
        {error !== "" && (
          <Text
            style={[
              styles.error,
              { color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold },
            ]}
          >
            {error}
          </Text>
        )}

        <View style={styles.itemRow}>
          <TextInput
            value={item}
            onChangeText={handleItemChange}
            placeholder="What was it for?"
            placeholderTextColor={onAccentDim}
            style={[
              styles.itemInput,
              styles.itemInputWithPill,
              {
                backgroundColor: fieldBg,
                borderRadius: radius.lg,
                borderColor: "transparent",
                color: "#ffffff",
                fontFamily: fontFamily.bodySemiBold,
                fontSize: type.bodyLg,
              },
            ]}
          />
          <Nudge
            trigger={nudge}
            active={missing.includes("category")}
            style={styles.categoryPill}
          >
          <AutoCategoryPill
            selected={
              category
                ? {
                    // An edit can carry a category the loaded list lacks
                    // (renamed or deleted since); it still saves, so show it.
                    icon: categoryIconKey(category, selectedCategory?.icon, selectedCategory?.group),
                    name: splitEmoji(category).text,
                  }
                : null
            }
            thinking={suggesting}
            auto={autoPicked}
            highlighted={flag("category")}
            rollIcons={rollIcons}
            onPress={() => {
              tap();
              setPickerOpen(true);
            }}
          />
          </Nudge>
        </View>

        <Numpad
          onAccent
          onDigit={pushDigit}
          onBackspace={handleBackspace}
          onClear={() => setAmount("")}
          calculator
        />
      </View>

      <CategoryPickerSheet
        visible={pickerOpen}
        onClose={() => { setPickerOpen(false); setCreateCategoryOpen(false); }}
        value={category}
        onSelect={(c) => {
          setCategory(c);
          setCategoryTouched(true);
          setAutoPicked(false);
        }}
        title="Choose a category"
        noneLabel="No category"
        creationForm={createCategoryOpen ? (
          <AddCategoryForm
            onCreated={(created) => {
              gateRef.current?.cancel();
              setCreatedCategory(created);
              setCategory(created.name);
              setCategoryTouched(true);
              setAutoPicked(false);
              setCreateCategoryOpen(false);
              setPickerOpen(false);
            }}
          />
        ) : undefined}
        footer={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add category in picker"
            onPress={() => {
              Keyboard.dismiss();
              setCreateCategoryOpen(true);
            }}
            disabled={!online}
            style={{ alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, marginTop: space.sm, borderRadius: radius.full, backgroundColor: tokens.inputBg, opacity: online ? 1 : 0.5 }}
          >
            <Plus size={16} color={tokens.accentInk} />
            <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }}>Add</Text>
            {!online && <Text style={{ color: tokens.text3, textAlign: "center", marginTop: space.xs }}>You can add categories once you&apos;re back online.</Text>}
          </Pressable>
        }
      />

      <BottomSheet visible={showMore} onClose={() => setShowMore(false)}>
        <Text
          style={[
            styles.sheetTitle,
            {
              color: tokens.text,
              fontFamily: fontFamily.displaySemiBold,
              fontSize: type.bodyLg,
            },
          ]}
        >
          More details
        </Text>

        <View style={{ gap: space.lg }}>
          <DatePicker mode="single" value={date} onChange={setDate} />

          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: tokens.text3, fontFamily: fontFamily.bodySemiBold },
                ]}
              >
                Paid from
              </Text>
              {accountsQ.isSuccess && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add account"
                  onPress={() => {
                    Keyboard.dismiss();
                    router.push("/modals/account");
                  }}
                  disabled={!online}
                  style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.full, backgroundColor: tokens.inputBg, opacity: online ? 1 : 0.5 }}
                >
                  <Plus size={16} color={tokens.accentInk} />
                  <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }}>Add</Text>
                </Pressable>
              )}
            </View>
            {accounts.length > 0 && (
              // The server takes the payment method from the account's type.
              <AccountChips accounts={accounts} value={accountId} onChange={setAccountPick} allowNone={isEdit && !accountId} showLabel={false} label="Paid from" />
            )}
          </View>

          <View style={{ gap: space.sm }}>
            <Text
              style={[
                styles.fieldLabel,
                { color: tokens.text3, fontFamily: fontFamily.bodySemiBold },
              ]}
            >
              Notes (optional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes"
              placeholderTextColor={tokens.text3}
              style={[
                styles.itemInput,
                {
                  backgroundColor: tokens.inputBg,
                  borderRadius: radius.md,
                  color: tokens.text,
                  fontFamily: fontFamily.bodyMedium,
                  fontSize: type.body,
                },
              ]}
            />
          </View>

          {!isEdit && (
            // Next to the photo field, which picks like bill scan: catching up
            // on missed days from your own UPI or bank history. Not behind
            // billScan, since new accounts start with that off.
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setShowMore(false);
                router.push("/modals/statement");
              }}
              disabled={!online}
              style={{ flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "flex-start", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.full, backgroundColor: tokens.inputBg, opacity: online ? 1 : 0.5 }}
            >
              <UploadSimple size={16} color={tokens.accentInk} />
              <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }}>Add from statement or screenshot</Text>
            </Pressable>
          )}

          {photoAllowed && (
            <ExpensePhotoField
              uri={photoUri}
              loading={showSavedPhoto && !photo && savedPhotoQ.isLoading}
              offline={!online}
              busy={saving || logSuccess}
              onPicked={(p) => { setPhoto(p); setPhotoRemoved(false); }}
              onRemove={() => { setPhoto(null); if (hasSavedPhoto) setPhotoRemoved(true); }}
            />
          )}
        </View>
      </BottomSheet>
      {showIncome && <IncomeFloodButton top={insets.top + space.xs} right={space.lg} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  headerTitle: {},
  severalButton: { position: "absolute" },
  severalIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  body: { paddingTop: 8 },
  footer: {},
  amountWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  unusualNote: { flexDirection: "row", alignItems: "center", paddingVertical: 8, maxWidth: "90%" },
  itemRow: { justifyContent: "center" },
  itemInput: { paddingHorizontal: 14, paddingVertical: 14 },
  // A fine warm edge and recessed fill mark missing copy without a white box.
  itemInputWithPill: {
    paddingHorizontal: 13,
    paddingVertical: 13,
    // Pill's right inset (6) + its max width + a little air.
    paddingRight: PILL_MAX_WIDTH + 12,
    borderWidth: 1,
  },
  categoryPill: { position: "absolute", right: 6, maxWidth: PILL_MAX_WIDTH },
  fieldLabel: { fontSize: 12 },
  error: { fontSize: 12, textAlign: "center" },
  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  moreLabel: {},
  quickRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  quickThumb: { width: 18, height: 18, borderRadius: 4 },
  sheetTitle: { marginBottom: 12 },
  sheetList: { maxHeight: 320 },
  sheetChips: { flexDirection: "row", flexWrap: "wrap" },
});
