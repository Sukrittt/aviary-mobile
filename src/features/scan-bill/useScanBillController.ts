import { expenseSuccessParams } from '@/src/lib/expenseSuccessParams';
import { useBillSplit } from '@/src/features/scan-bill/useBillSplit';
import { useCategories } from "@/src/hooks/useCategories";
import { useAddExpense } from "@/src/hooks/useExpenses";
import { useSaveBillScan } from "@/src/hooks/useBillScans";
import { useScanBill } from "@/src/hooks/useScanBill";
import { todayLocal } from "@/src/lib/date";
import { splitEmoji } from "@/src/lib/emoji";
import { takePendingScanImage } from "@/src/lib/pendingScanImage";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBulkSelection } from './useBulkSelection';
import { isAiAllowanceError } from "@/src/lib/aiAllowance";


type Phase = "scanning" | "review" | "confirm" | "error";
export function useScanBillController() {
  const { tokens, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const categoriesQ = useCategories();
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const scanBill = useScanBill();
  const addExpense = useAddExpense();
  const saveBillScan = useSaveBillScan();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [errorMsg, setErrorMsg] = useState("");
  const [allowanceHit, setAllowanceHit] = useState(false);

  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(todayLocal());
  const { items, peopleCount, totals, actions } = useBillSplit();
  const { productItems, feeItems, feeAggregate, hasFee, feeShare, billTotal, myShare, sharePct, buckets } = totals;
  const { updateItem, removeItem, addBlankItem, setAllMine, setPeopleCount } = actions;
  const [query, setQuery] = useState("");
  const { selecting, selected, setSelected, resetSelection, toggleSelecting, toggleSelected } = useBulkSelection();
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const selectedCategory = categories.find((c) => c.name === category);
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? productItems.filter((it) => it.name.toLowerCase().includes(q))
      : productItems;
  }, [productItems, query]);
  const canProceed =
    merchant.trim() !== "" &&
    category !== "" &&
    myShare > 0 &&
    !addExpense.isPending;

  function applyBulkDivisor(divisor: number) {
    if (selected.length === 0) return;
    actions.applyDivisor(selected, divisor);
    resetSelection();
  }

  // The photo is picked on the "more" screen's own sheet (so the sheet appears
  // over that screen, not a blank one) and handed off via pendingScanImage —
  // this route starts straight into "scanning" against whatever it finds.
  // more.tsx already confirmed categories were non-empty before handing off,
  // but this screen has its own query client entry and may need a moment to
  // load them — wait for that instead of racing it with an empty list.
  const pendingAsset = useRef(takePendingScanImage());
  // One scan per mount. categoriesQ.isLoading can flip back to true after the
  // scan (the query cache gets cleared and refetched), and re-running here
  // would silently reload the result over every split the user already made.
  const scanStarted = useRef(false);
  useEffect(() => {
    const asset = pendingAsset.current;
    if (!asset) {
      router.back();
      return;
    }
    if (categoriesQ.isLoading || scanStarted.current) return;
    scanStarted.current = true;

    scanBill.mutate(
      {
        image: asset.base64,
        mimeType: asset.mimeType,
        categories: categories.map((c) => c.name),
      },
      {
        onSuccess: (res) => {
          setMerchant(res.merchant);
          setCategory(res.category ?? "");
          // Always the upload day — a bill's printed date lands the expense in a month the user isn't looking at.
          setDate(todayLocal());
          actions.load(res);
          setQuery("");
          resetSelection();
          setPhase("review");
        },
        onError: (err) => {
          // Retrying a clearer photo can't help when the month's AI is spent.
          setAllowanceHit(isAiAllowanceError(err));
          setErrorMsg(
            isAiAllowanceError(err)
              ? "You've used this month's AI allowance. You can still enter this expense manually."
              : "Couldn't read that bill. Try a clearer photo, or enter this expense manually.",
          );
          setPhase("error");
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesQ.isLoading]);

  function handleConfirm() {
    if (addExpense.isPending) return;
    addExpense.mutate(
      {
        item: merchant.trim(),
        amount_inr: String(myShare),
        category,
        date,
        payment_method: "bank",
      },
      {
        onSuccess: (res) => {
          // Best-effort: the image/items/category behind this confirm, for a
          // future "past scans" screen. Never blocks or fails the confirm —
          // the expense itself already landed.
          const asset = pendingAsset.current;
          if (asset && res.id) {
            saveBillScan.mutate({
              image: asset.base64,
              mimeType: asset.mimeType,
              merchant: merchant.trim(),
              category: res.category ?? category,
              date,
              total: billTotal,
              my_share: myShare,
              people_count: peopleCount,
              expense_id: res.id,
              items: items.map(({ name, price, qty, divisor }) => ({ name, price, qty: qty ?? 1, divisor })),
            });
          }
          router.replace({
            pathname: "/modals/expense-added",
            params: expenseSuccessParams(res, {
              item: merchant.trim(),
              amount: String(myShare),
              category,
              date,
              notes: "",
              paymentMethod: "bank",
            }),
          });
        },
        onError: () =>
          router.replace({
            pathname: "/modals/expense-failed",
            params: {
              item: merchant.trim(),
              amount: String(myShare),
              category,
              date,
              notes: "",
              paymentMethod: "bank",
            },
          }),
      },
    );
  }

  const categoryLabel = category ? splitEmoji(category).text : "";

  return { tokens, space, radius, type, insets, router, categories, phase, setPhase, errorMsg, allowanceHit, merchant, setMerchant, category, setCategory, date, items, peopleCount, productItems, feeItems, feeAggregate, hasFee, feeShare, billTotal, myShare, sharePct, buckets, updateItem, removeItem, addBlankItem, setAllMine, setPeopleCount, query, setQuery, selecting, selected, setSelected, categoryPickerOpen, setCategoryPickerOpen, selectedCategory, visibleItems, canProceed, toggleSelecting, toggleSelected, applyBulkDivisor, handleConfirm, categoryLabel, addExpense };
}
