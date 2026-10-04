import { ExpenseNoticeScreen } from '@/src/features/log-expense/ExpenseNoticeScreen'
import { ExpenseConflictReview } from '@/src/features/log-expense/ExpenseConflictReview'
import { AutoCategoryPill, MIN_SPIN_MS, PILL_MAX_WIDTH } from '@/src/features/log-expense/AutoCategoryPill'
import { createThinkingGate, type ThinkingGate } from '@/src/lib/thinkingGate'
import { ExpenseWriteError, expenseChanges, expenseDraft, rebaseExpenseDraft } from '@/src/lib/expenseConflict'
import type { ExpenseRow } from '@/src/types'
import { useCurrency } from '@/src/context/CurrencyContext'
import { suggestCategoryLLM } from "@/src/api/categoryMap";
import { CategoryPickerSheet } from "@/src/components/shared/CategoryPickerSheet";
import { DatePicker } from "@/src/components/shared/DatePicker";
import { BottomSheet } from "@/src/components/shared/Modal";
import { AmountText } from "@/src/components/ui/AmountText";
import { Chip } from "@/src/components/ui/Chip";
import { Numpad } from "@/src/components/ui/Numpad";
import { Nudge } from "@/src/components/ui/Nudge";
import { Toast } from "@/src/components/ui/Toast";
import { useAmountEntry } from '@/src/components/ui/useAmountEntry';
import { clearLogExpenseDraft, getLogExpenseDraft, setLogExpenseDraft } from '@/src/features/log-expense/draft';
import { evaluateAmount, formatExpression, hasOperator } from '@/src/lib/calcAmount';
import {
EMPTY_SUBMIT,
useLogExpenseSubmitPublisher,
} from "@/src/features/log-expense/SubmitContext";
import {
missingFields,
missingFieldsMessage,
} from "@/src/features/log-expense/missingFields";
import { useAddCategory,useCategories } from "@/src/hooks/useCategories";
import { useCategoryMap } from "@/src/hooks/useCategoryMap";
import {
useAddExpense,
useRecentExpenses,
useUpdateExpense,
} from "@/src/hooks/useExpenses";
import { unusualAmount } from "@/src/lib/unusualAmount";
import { todayLocal } from "@/src/lib/date";
import { categoryEmoji,splitEmoji } from "@/src/lib/emoji";

import { useOnline } from "@/src/lib/netStatus";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { NAV_HEIGHT } from "@/src/theme/scale";
import { useLocalSearchParams,useRouter } from "expo-router";
import { ChevronDown, PencilLine, Tag, TriangleAlert, WalletMinimal } from "lucide-react-native";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import {
Animated,
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

/**
 * The app's primary verb, as a full-bleed accent screen rather than a form:
 * amount first on a custom keypad, description second, category picked from a
 * recently-used rail. Date, payment method and notes all have good defaults and
 * live behind the "More" disclosure, so the common path stays three inputs.
 *
 * Route-param driven: Activity passes {id, timestamp, item, amountInr, category,
 * date, notes, paymentMethod} of an existing row to enter edit mode. No params →
 * a fresh entry. Edit reuses this screen rather than a second form; the keypad
 * starts on the existing amount and backspaces from there.
 */
export default function LogExpenseScreen() {
  const { formatAmountInput, formatMoney } = useCurrency()

  const { tokens, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const online = useOnline();

  const origId = str(params.id) || undefined;
  const origTimestamp = str(params.timestamp);
  const isEdit = origTimestamp !== "";
  const origItem = str(params.item);
  const origAmountInr = Number(params.amountInr) || 0;

  const categoriesQ = useCategories();
  const categoryMapQ = useCategoryMap();
  const expensesQ = useRecentExpenses();
  const addExpense = useAddExpense();
  const updateExpense = useUpdateExpense();
  const addCategory = useAddCategory();

  const publishLogExpenseSubmit = useLogExpenseSubmitPublisher();
  const addMutate = addExpense.mutate;
  const updateMutate = updateExpense.mutate;
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);

  // A plain visit (no edit row, no prefill) picks up where the last one left
  // off, and is the only kind that saves one: a prefill must not overwrite it.
  const [plainVisit] = useState(() => Object.keys(params).length === 0);
  const [draft] = useState(() => (plainVisit ? getLogExpenseDraft() : null));
  const [newCategoryName, setNewCategoryName] = useState("");
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
  const [paymentMethod, setPaymentMethod] = useState<"bank" | "credit_card">(
    draft?.paymentMethod ?? (str(params.paymentMethod) === "credit_card" ? "credit_card" : "bank"),
  );
  const [base, setBase] = useState({ item: origItem, amount: String(origAmountInr), date: str(params.date).slice(0, 10), category: str(params.category) });
  const [expectedVersion, setExpectedVersion] = useState(str(params.version) === '' ? undefined : Number(str(params.version)));
  const [conflict, setConflict] = useState<ExpenseRow | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [showDeletedNotice, setShowDeletedNotice] = useState(false);
  const [error, setError] = useState("");
  const [logSuccess, setLogSuccess] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bumped each time the nav's add circle is tapped with the form incomplete.
  // 0 = never, so nothing is highlighted before the first blocked submit.
  const [nudge, setNudge] = useState(0);
  const onInvalid = useCallback(() => setNudge((n) => n + 1), []);
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
  // the local keyword map or the AI fallback. Null if nothing was ever picked.
  const suggestedBy = useRef<null | "keyword" | "ai">(null);
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
    if (categoryTouched || !item.trim() || !categoryMapQ.data) {
      gate.cancel();
      return;
    }
    let cancelled = false;
    const apply = (name: string, by: "keyword" | "ai") => () => {
      if (cancelled || !name) return;
      suggestedBy.current = by;
      setCategory(name);
      setAutoPicked(true);
    };
    const timer = setTimeout(() => {
      const categoryNames = categories.map((c) => c.name);
      const suggested = suggestCategory(
        item,
        categoryMapQ.data!.words,
        categoryNames,
      );
      if (suggested) {
        gate.finish(apply(suggested, "keyword"));
        return;
      }
      // No local match — fall back to the LLM suggestion endpoint.
      gate.start();
      suggestCategoryLLM(item, categoryNames).then((llmSuggested) => {
        if (cancelled) return;
        if (categoryNames.includes(llmSuggested)) {
          gate.finish(apply(llmSuggested, "ai"));
          return;
        }
        // Nothing found: land on Miscellaneous, like Web. Not an auto-pick, so no ✨.
        const misc = categoryNames.find((n) => n.toLowerCase().includes("miscellaneous"));
        gate.finish(() => {
          if (cancelled || !misc) return;
          setCategory(misc);
          setAutoPicked(false);
        });
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [item, categoryMapQ.data, categories, categoryTouched]);

  useEffect(() => {
    if (!plainVisit || logSuccess) return;
    setLogExpenseDraft({ amount: expr, item, category, categoryTouched, autoPicked, date, notes, paymentMethod });
  }, [plainVisit, logSuccess, expr, item, category, categoryTouched, autoPicked, date, notes, paymentMethod]);

  function handleItemChange(value: string) {
    if (value === item) return;
    setItem(value);
    if (!isEdit) {
      gateRef.current?.cancel();
      setCategoryTouched(false);
      setCategory("");
      setAutoPicked(false);
      suggestedBy.current = null;
    }
  }

  const rollEmojis = useMemo(
    () => [...new Set(categories.map((c) => categoryEmoji(c.name, c.group)).filter(Boolean))],
    [categories],
  );

  const selectedCategory = categories.find((c) => c.name === category);

  const parsedAmount = Number(amount);
  const missing = missingFields({ amount, item, category });
  const canSubmit = missing.length === 0 && !conflict && !deleted;
  const flag = (f: (typeof missing)[number]) => nudge > 0 && missing.includes(f);
  const saving = addExpense.isPending || updateExpense.isPending;
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

  function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name || addCategory.isPending) return;
    setError("");
    addCategory.mutate(
      { name, group: categories.length === 0 ? "Miscellaneous" : undefined },
      {
        onSuccess: () => {
          setCategory(name);
          setCategoryTouched(true);
          setAutoPicked(false);
          setNewCategoryName("");
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : "";
          setError(
            msg.includes("already exists")
              ? "That name is already taken. Try a different name."
              : "Failed to add category",
          );
        },
      },
    );
  }

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    setError("");
    const warnKey = `${amount}|${category}`;
    if (unusual && unusualWarnedFor !== warnKey) {
      setUnusualWarnedFor(warnKey);
      setUnusualNudge((n) => n + 1);
      return;
    }
    if (isEdit) {
      const updates = expenseChanges(base, { item, amount, date, category });
      if (!Object.keys(updates).length) { setLogSuccess(true); return; }
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
          onSuccess: () => setLogSuccess(true),
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
            setError(err instanceof Error ? err.message : "Could not save. Check your connection and try again.");
          },
        },
      );
    } else {
      // Kept (still auto-picked at save) or overridden (the user changed it).
      if (suggestedBy.current) track("ai_category_suggested", { accepted: autoPicked, source: suggestedBy.current });
      addMutate(
        {
          item: item.trim(),
          amount_inr: String(parsedAmount),
          category,
          date,
          notes: notes.trim(),
          payment_method: paymentMethod,
          source: 'manual',
        },
        {
          // replace, not push: this screen is spent, and Done on the success
          // screen should land on home with nothing stale behind it. `id` and
          // `timestamp` come back from the POST so Undo can address the row.
          // The replace itself is deferred: stash it and flip logSuccess so
          // the nav circle's save animation plays first (see the effect above).
          onSuccess: (res) => {
            clearLogExpenseDraft();
            pendingAddNavRef.current = {
              pathname: "/modals/expense-added",
              params: {
                id: res.id ?? "",
                version: res.version === undefined ? "" : String(res.version),
                clientId: res.clientId,
                pending: res.pending ? "1" : "",
                timestamp: res.timestamp ?? "",
                // Display fallback for servers that return no timestamp — the
                // success screen's stamp line would otherwise be blank.
                loggedAt: new Date().toISOString(),
                item: item.trim(),
                amount: String(parsedAmount),
                // The server's category, not the picked one: a name chosen from
                // a list loaded before a rename is mapped forward server-side,
                // and the success screen finds its envelope by name. Falls back
                // when queued offline, where there's no response to read.
                category: res.category ?? category,
                date,
                notes: notes.trim(),
                paymentMethod,
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
              },
            }),
        },
      );
    }
  }, [canSubmit, unusual, unusualWarnedFor, base, amount, expectedVersion, isEdit, origId, origTimestamp, origItem, origAmountInr, item, parsedAmount, date, category, notes, paymentMethod, router, addMutate, updateMutate, autoPicked]);

  // Publish only when the action or its visible state changes.
  useEffect(() => {
    publishLogExpenseSubmit({
      canSubmit,
      saving,
      success: logSuccess,
      submit: handleSubmit,
      onInvalid,
    });
  }, [canSubmit, saving, logSuccess, handleSubmit, onInvalid, publishLogExpenseSubmit]);
  useEffect(() => () => publishLogExpenseSubmit(EMPTY_SUBMIT), [publishLogExpenseSubmit]);

  function reviewLatest(keepDraft: boolean) {
    if (!conflict) return;
    const draft = keepDraft ? rebaseExpenseDraft(base, { item, amount, date, category }, conflict) : expenseDraft(conflict);
    setBase(expenseDraft(conflict));
    setExpectedVersion(conflict.version);
    setItem(draft.item); setAmount(draft.amount); setDate(draft.date); setCategory(draft.category);
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
        <ExpenseConflictReview latest={conflict} original={base} draft={{ item, amount, date, category }}
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
      </View>

      <Toast
        trigger={nudge}
        message={missingFieldsMessage(missing)}
        icon={missing[0] === "amount" ? WalletMinimal : missing[0] === "item" ? PencilLine : Tag}
        // Clear of the header title with room to breathe.
        style={{ top: insets.top + space.xxxl + space.xl }}
      />

      <Toast
        trigger={unusualNudge}
        // The amount and category are already on screen.
        message={unusual ? `Way above your usual ${formatMoney(Math.round(unusual.typical))}. Tap again to save.` : ""}
        icon={TriangleAlert}
        style={{ top: insets.top + space.xxxl + space.xl }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: space.lg, gap: space.lg, flexGrow: 1 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.amountWrap, { gap: space.sm }]}>
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
              size={type.hero * 1.3}
              color={amount === "" && !flag("amount") ? onAccentDim : "#ffffff"}
              weight="displayBold"
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

          <Pressable
            onPress={() => setShowMore(true)}
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
            <ChevronDown size={16} color={onAccentDim} />
          </Pressable>
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
          <Nudge trigger={nudge} active={missing.includes("item")}>
          <TextInput
            value={item}
            onChangeText={handleItemChange}
            placeholder="What was it for?"
            placeholderTextColor={onAccentDim}
            style={[
              styles.itemInput,
              styles.itemInputWithPill,
              {
                backgroundColor: flag("item") ? "rgba(88, 26, 8, 0.22)" : fieldBg,
                borderRadius: radius.lg,
                borderColor: flag("item") ? "rgba(255, 224, 194, 0.3)" : "transparent",
                color: "#ffffff",
                fontFamily: fontFamily.bodySemiBold,
                fontSize: type.bodyLg,
              },
            ]}
          />
          </Nudge>
          <Nudge
            trigger={nudge}
            active={missing.includes("category")}
            style={styles.categoryPill}
          >
          <AutoCategoryPill
            selected={
              selectedCategory
                ? {
                    emoji: categoryEmoji(selectedCategory.name, selectedCategory.group),
                    name: splitEmoji(selectedCategory.name).text,
                  }
                : null
            }
            thinking={suggesting}
            auto={autoPicked}
            highlighted={flag("category")}
            rollEmojis={rollEmojis}
            onPress={() => setPickerOpen(true)}
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
        onClose={() => setPickerOpen(false)}
        value={category}
        onSelect={(c) => {
          setCategory(c);
          setCategoryTouched(true);
          setAutoPicked(false);
        }}
        title="Choose a category"
        noneLabel="No category"
        footer={
          <>
            {categories.length === 0 && !online && (
              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color: tokens.text3,
                    fontFamily: fontFamily.bodyMedium,
                    marginTop: space.md,
                  },
                ]}
              >
                You can add categories once you&apos;re back online.
              </Text>
            )}
            {categories.length === 0 && online && (
              <View
                style={{
                  flexDirection: "row",
                  gap: space.sm,
                  marginTop: space.md,
                }}
              >
                <TextInput
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="New category name"
                  placeholderTextColor={tokens.text3}
                  onSubmitEditing={handleCreateCategory}
                  style={[
                    styles.itemInput,
                    {
                      flex: 1,
                      backgroundColor: tokens.inputBg,
                      borderRadius: radius.md,
                      color: tokens.text,
                      fontFamily: fontFamily.bodyMedium,
                      fontSize: type.body,
                    },
                  ]}
                />
                <Pressable
                  onPress={handleCreateCategory}
                  disabled={!newCategoryName.trim() || addCategory.isPending}
                  style={[
                    styles.addCategory,
                    {
                      backgroundColor: tokens.accentInk,
                      borderRadius: radius.md,
                      opacity:
                        !newCategoryName.trim() || addCategory.isPending ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: tokens.onAccent,
                      fontFamily: fontFamily.bodySemiBold,
                      fontSize: type.caption,
                    }}
                  >
                    Add
                  </Text>
                </Pressable>
              </View>
            )}
          </>
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
            <Text
              style={[
                styles.fieldLabel,
                { color: tokens.text3, fontFamily: fontFamily.bodySemiBold },
              ]}
            >
              Payment Method
            </Text>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {(["bank", "credit_card"] as const).map((m) => (
                <Chip
                  key={m}
                  selected={paymentMethod === m}
                  label={m === "bank" ? "Bank/UPI" : "Credit Card"}
                  onPress={() => setPaymentMethod(m)}
                />
              ))}
            </View>
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
        </View>
      </BottomSheet>
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
  scroll: { flex: 1 },
  body: { paddingTop: 8 },
  footer: {},
  amountWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  sheetTitle: { marginBottom: 12 },
  sheetList: { maxHeight: 320 },
  sheetChips: { flexDirection: "row", flexWrap: "wrap" },
  addCategory: {
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
