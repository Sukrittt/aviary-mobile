import { expenseSuccessParams } from '@/src/lib/expenseSuccessParams'
import { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import Reanimated, { FadeIn } from 'react-native-reanimated'
import LottieView from 'lottie-react-native'
import * as Haptics from 'expo-haptics'
import { WarningCircle } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useAddExpense } from '@/src/hooks/useExpenses'
import { splitEmoji } from '@/src/lib/emoji'
import { useCategoryIcons } from '@/src/hooks/useCategories'
import { CategoryIcon } from '@/src/components/shared/CategoryIcon'
import { AmountText } from '@/src/components/ui/AmountText'
import { Button } from '@/src/components/ui/Button'
import { Icon } from '@/src/components/shared/Icon'
import { LOG_EXPENSE_PATH } from '@/src/features/log-expense/SubmitContext'
import { clearLogExpenseDraftFor } from '@/src/features/log-expense/draft'

/** Larger than the success screen's TICK (200) on purpose: this clip carries a
 *  lot of empty frame around its disc, so it needs the extra box to land at the
 *  same optical weight as the tick badge. */
const MARK = 300
/** Remote rather than bundled, by choice. Swap for a `require` of a file in
 *  assets/animations if the fallback below ever starts showing too often —
 *  nothing else needs to change. */
const ERROR_LOTTIE = 'https://lottie.host/0e945290-989f-4335-8f33-e17f34013e29/DX39k4dRss.lottie'
/** Same beats as expense-added's STAGGER, minus the envelope phase — the two
 *  screens should feel like one family, not two designs. */
const STAGGER = { amount: 520, detail: 640, actions: 900 }

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Post-log failure. The mirror of modals/expense-added: a failed *add* routes
 * here by `router.replace` from log-expense, so the failure gets the same weight
 * on screen as the success does rather than one line of text on the orange flood
 * screen that is easy to miss.
 *
 * Add only. An edit keeps its inline error, the same way it keeps the inline
 * CheckIcon instead of the success route.
 *
 * Retry re-fires the mutation from here with the params it was handed, so the
 * user never retypes; Dismiss replaces the form back with those same values
 * prefilled. Either way the entered expense survives — dropping it on a network
 * blip is the one outcome this screen exists to prevent.
 */
export default function ExpenseFailedScreen() {
  const { tokens, space, type } = useTheme()
  const categoryIcons = useCategoryIcons()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams()

  const item = str(params.item)
  const category = str(params.category)
  const date = str(params.date)
  const notes = str(params.notes)
  const paymentMethod = str(params.paymentMethod)
  const accountId = str(params.accountId)
  const amount = Number(str(params.amount)) || 0

  const addExpense = useAddExpense()
  // This screen shows precisely when the network is failing, so the remote
  // .lottie often cannot be fetched either. An empty 200px hole reads as a
  // broken screen; a static mark reads as the same screen without its animation.
  const [lottieFailed, setLottieFailed] = useState(false)

  // The only failure feedback on the screen — no reason text, by choice: a raw
  // "Failed to add expense: 503" tells the user nothing they can act on, and
  // "Couldn't add ₹100" already says what happened. Fires again on a failed
  // retry, which otherwise looks like nothing happened at all.
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
  }, [])

  const categoryName = splitEmoji(category).text
  const categoryIcon = categoryIcons.get(category)
  // Same de-dupe as the success screen: an item named after its category reads
  // as a repeated line, not as two facts.
  const sameAsCategory = item.trim().toLowerCase() === categoryName.trim().toLowerCase()
  // Icon is rendered separately (see below) — everything here is plain text.
  const detail = item !== '' && categoryName !== '' && !sameAsCategory
    ? `${item} · ${categoryName}`
    : categoryName || item
  // The icon leads `detail` whenever a category actually contributed to it —
  // i.e. every case except "item only, no category".
  const detailShowsIcon = category !== '' && detail !== ''

  function handleRetry() {
    if (addExpense.isPending) return
    // ponytail: a retry can double-post if the first request actually reached
    // the server and only its response was lost. The fix is an idempotency key
    // on POST /api/expenses, not a client-side guard — a guard here cannot tell
    // the two failure shapes apart.
    addExpense.mutate(
      {
        item,
        amount_inr: String(amount),
        category,
        date,
        notes,
        payment_method: paymentMethod,
        ...(accountId ? { account_id: accountId } : {}),
      },
      {
        onSuccess: (res) => {
          // If the saved log-expense draft is this expense, it's logged now.
          clearLogExpenseDraftFor({ item, amount, category })
          router.replace({
            pathname: '/modals/expense-added',
            params: expenseSuccessParams(res, {
              item,
              amount: String(amount),
              category,
              date,
              notes,
              paymentMethod,
              ...(accountId ? { accountId } : {}),
            }),
          })
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
        },
      },
    )
  }

  // replace, not back: log-expense replaced itself to get here, so there is
  // nothing behind this screen. Same param names the form reads for prefill,
  // and no `timestamp` — this is still an add, not an edit.
  function handleDismiss() {
    router.replace({
      pathname: LOG_EXPENSE_PATH,
      params: { item, amountInr: String(amount), category, date, notes, paymentMethod, ...(accountId ? { accountId } : {}) },
    })
  }

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg, paddingHorizontal: space.lg }]}>
      <View style={styles.body}>
        {/* Wrapper carries the spacing so the animation's own style stays
            purely its box. */}
        <View style={[styles.mark, { marginBottom: space.xxl }]}>
          {lottieFailed ? (
            <Icon icon={WarningCircle} size={MARK * 0.5} color={tokens.coral} />
          ) : (
            <LottieView
              source={{ uri: ERROR_LOTTIE }}
              style={styles.lottie}
              autoPlay
              loop={false}
              onAnimationFailure={() => setLottieFailed(true)}
            />
          )}
        </View>

        <Reanimated.View
          entering={FadeIn.delay(STAGGER.amount).duration(350)}
          style={[styles.amountRow, { gap: space.sm }]}
        >
          <Text
            style={[styles.line, { color: tokens.text, fontFamily: fontFamily.displayBold, fontSize: type.heading }]}
          >
            Couldn&apos;t add
          </Text>
          {/* No `animate`: the odometer roll is a celebration gesture. */}
          <AmountText value={amount} size={type.display} />
        </Reanimated.View>

        {detail !== '' && (
          <Reanimated.View
            entering={FadeIn.delay(STAGGER.detail).duration(350)}
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md }}
          >
            {detailShowsIcon && (
              <View style={{ marginRight: space.xs }}>
                <CategoryIcon name={category} icon={categoryIcon} size={type.bodyLg} color={tokens.text} />
              </View>
            )}
            <Text
              numberOfLines={1}
              style={[
                styles.line,
                {
                  flexShrink: 1,
                  color: tokens.text,
                  fontFamily: fontFamily.bodySemiBold,
                  fontSize: type.bodyLg,
                },
              ]}
            >
              {detail}
            </Text>
          </Reanimated.View>
        )}

        {/* Both buttons keep what was typed, so say so: a failure that might
            have eaten the entry is the memory this screen exists to prevent. */}
        <Reanimated.Text
          entering={FadeIn.delay(STAGGER.detail).duration(350)}
          style={[styles.line, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.body, marginTop: space.lg }]}
        >
          Your entry&apos;s safe. Retry, or go back and edit it.
        </Reanimated.Text>
      </View>

      <Reanimated.View
        entering={FadeIn.delay(STAGGER.actions).duration(350)}
        style={[styles.footer, { paddingBottom: insets.bottom + space.xl, gap: space.sm }]}
      >
        <Button
          label={addExpense.isPending ? 'Retrying…' : 'Retry'}
          disabled={addExpense.isPending}
          onPress={handleRetry}
        />
        <Button label="Edit entry" variant="ghost" disabled={addExpense.isPending} onPress={handleDismiss} />
      </Reanimated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  lottie: { width: MARK, height: MARK },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  line: { textAlign: 'center' },
  footer: {},
})
