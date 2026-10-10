import { useCurrency } from '@/src/context/CurrencyContext'
import { StepDot } from '@/src/components/onboarding/StepDot'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { AmountText } from '@/src/components/ui/AmountText'
import { Numpad } from '@/src/components/ui/Numpad'
import { useAmountEntry } from '@/src/components/ui/useAmountEntry'
import { useProgressWidth } from '@/src/components/ui/useProgressWidth'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useBudgets,useTransferBudget } from '@/src/hooks/useBudgets'
import { useCategories } from '@/src/hooks/useCategories'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useGroups } from '@/src/hooks/useGroups'
import { EMPTY } from '@/src/lib/constants'
import { categoryEmoji,splitEmoji } from '@/src/lib/emoji'
import { computeEnvelopeState,currentMonthKey } from '@/src/lib/envelope'

import { fontFamily } from '@/src/theme/fonts'
import { useTheme } from '@/src/theme/ThemeProvider'
import type { ThemeTokens } from '@/src/theme/tokens'
import { useLocalSearchParams,useRouter } from 'expo-router'
import { ArrowLeft,Search,Trash2,X } from 'lucide-react-native'
import { useEffect,useMemo,useState } from 'react'
import { ActivityIndicator,Animated,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native'
import Reanimated, { FadeIn,FadeOut,LinearTransition,ZoomIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'

const RTA_SENTINEL = '__ready_to_assign__'
const MAX_AUTO_SOURCES = 3
const QUICK_PICKS = [500, 1000, 2500]

// Matches EnvelopeGroup.tsx / envelopes.tsx's list-reflow spring (expanding
// or collapsing a group of rows): picking or removing a source resizes the
// FROM list, and the pool below needs the same `layout` transition to spring
// into its new slot instead of snapping. Entering/exiting stay fixed-duration
// (not springs) — same as EnvelopeGroup/ExtrasList's row reveals — since an
// open-ended spring settle reads as sluggish next to that.
const SPRING = { damping: 90, stiffness: 900 }
const SOURCE_TRANSITION = LinearTransition.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)
const SOURCE_ENTER = ZoomIn.duration(150).withInitialValues({ transform: [{ scale: 0.9 }] })
const SOURCE_EXIT = FadeOut.duration(120)

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

interface SourceItem {
  key: string
  name: string
  emoji: string
  available: number
  /** Higher = safer to borrow from. Ready to Assign is unallocated money, so
   * it always ranks first. Everything else is available/assigned — mirrors
   * `Envelope.spentPct`, just inverted. */
  score: number
}

export default function MoveMoneyModal() {
  const { formatAmountInput, formatCurrency, formatMoney } = useCurrency()

  const { tokens, space, radius, type } = useTheme()
  const { hideAmounts } = usePrivacy()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams()
  // Home's handleMoveMoney passes the tapped envelope as `fromCategory`, but per
  // its call site (app/(tabs)/index.tsx) it's actually the RECIPIENT — mirrors
  // Web's MoveMoneyModal `targetCategory` prop. The source(s) are chosen below.
  const targetCategoryName = str(params.fromCategory)

  const budgetsQ = useBudgets()
  const expensesQ = useRecentExpenses()
  const categoriesQ = useCategories()
  const groupsQ = useGroups()
  const transferBudget = useTransferBudget()

  const budgets = budgetsQ.data ?? EMPTY
  const expenses = expensesQ.data ?? EMPTY
  const categories = categoriesQ.data ?? EMPTY
  const groups = groupsQ.data ?? EMPTY
  const month = useMemo(() => currentMonthKey(), [])

  const envelopeState = useMemo(
    () => computeEnvelopeState(budgets, expenses, month, categories, groups),
    [budgets, expenses, month, categories, groups],
  )

  const target = envelopeState.envelopes.find((e) => e.category === targetCategoryName)
  const targetAvail = target?.available ?? 0
  const isOverspent = targetAvail < 0
  const shortfall = isOverspent ? Math.abs(targetAvail) : 0
  const readyToAssign = envelopeState.readyToAssign

  const envelopeSources = envelopeState.envelopes.filter(
    (e) => e.available > 0 && e.category !== targetCategoryName && !e.isCreditCardPayment,
  )

  const [step, setStep] = useState<'amount' | 'sources'>('amount')
  const [allocs, setAllocs] = useState<Record<string, number>>({})
  const { amount: amountStr, setAmount: setAmountStr, pushDigit, handleBackspace, shake } = useAmountEntry(isOverspent ? String(Math.round(shortfall)) : '', { onChange: () => setAllocs({}) })
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [moveSuccess, setMoveSuccess] = useState(false)

  const amount = Number(amountStr) || 0
  const allocated = Object.values(allocs).reduce((a, b) => a + b, 0)
  const remaining = Math.max(0, amount - allocated)
  // Exact match, not `remaining === 0`: `remaining` clamps at 0, which would
  // hide an over-allocation. Compared in paise so float sums still match.
  const ready = amount > 0 && Math.round(allocated * 100) === Math.round(amount * 100)
  const saving = transferBudget.isPending

  const [progressTrackWidth, setProgressTrackWidth] = useState(0)
  const progressPct = amount > 0 ? Math.min(100, Math.round((allocated / amount) * 100)) : 0
  // No `from` — only the first reveal gets useProgressWidth's delay, every
  // allocation change after animates immediately.
  const progressWidth = useProgressWidth(progressTrackWidth, progressPct)

  const sources = useMemo<SourceItem[]>(() => {
    const items: SourceItem[] = []
    if (readyToAssign > 0) {
      items.push({ key: RTA_SENTINEL, name: 'Ready to Assign', emoji: '💰', available: readyToAssign, score: Infinity })
    }
    for (const e of envelopeSources) {
      items.push({
        key: e.category,
        name: splitEmoji(e.category).text,
        emoji: categoryEmoji(e.category, e.group),
        available: e.available,
        score: e.assigned > 0 ? e.available / e.assigned : 1,
      })
    }
    return items.sort((a, b) => b.score - a.score)
  }, [readyToAssign, envelopeSources])

  const pickedRows = sources.filter((s) => s.key in allocs)
  const q = query.trim().toLowerCase()
  const poolRows = sources.filter((s) => !(s.key in allocs) && (!q || s.name.toLowerCase().includes(q)))

  const isLoading = budgetsQ.isLoading || expensesQ.isLoading || categoriesQ.isLoading || groupsQ.isLoading

  // Let the inline checkmark finish drawing before navigating back.
  useEffect(() => {
    if (!moveSuccess) return
    const timer = setTimeout(() => router.back(), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveSuccess])

  // Typing a value down to 0 keeps the row (and its key) in `allocs` — only
  // "Remove" deletes it. Auto-deleting on 0 would unmount the row mid-edit,
  // taking its focused TextInput with it.
  function setAllocValue(key: string, value: number) {
    setAllocs((prev) => ({ ...prev, [key]: Math.max(0, value) }))
  }
  function removeAlloc(key: string) {
    setAllocs((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }
  function maxFor(item: SourceItem) {
    const currentAlloc = allocs[item.key] ?? 0
    return Math.min(item.available, currentAlloc + remaining)
  }
  function pick(item: SourceItem) {
    if (remaining <= 0) return
    setAllocValue(item.key, Math.min(item.available, remaining))
  }
  function autoFillNow() {
    if (amount <= 0) return
    let left = amount
    const next: Record<string, number> = {}
    for (const item of sources) {
      if (left <= 0 || Object.keys(next).length >= MAX_AUTO_SOURCES) break
      const take = Math.min(item.available, left)
      if (take > 0) {
        next[item.key] = take
        left -= take
      }
    }
    setAllocs(next)
  }

  async function handleSubmit() {
    if (!ready || !target) return
    setError('')
    try {
      const sources = Object.entries(allocs)
        .filter(([, alloc]) => alloc > 0)
        .map(([category, alloc]) => ({ category, amount: alloc }))
      await transferBudget.mutateAsync({ month, to: targetCategoryName, sources })
      setMoveSuccess(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(
        msg.includes('no budget row for')
          ? 'One of these envelopes changed since you opened this screen. Go back and try again.'
          : 'Could not pull money. Check your connection and try again.',
      )
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accentInk} />
      </View>
    )
  }

  const noOptions = !target || (envelopeSources.length === 0 && readyToAssign <= 0)

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: tokens.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, gap: space.md, borderBottomColor: tokens.border }]}>
        <Pressable
          onPress={() => (step === 'sources' ? setStep('amount') : router.back())}
          hitSlop={12}
          style={[styles.headerBtn, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.full }]}
        >
          {step === 'sources' ? <ArrowLeft size={16} color={tokens.text} /> : <X size={16} color={tokens.text} />}
        </Pressable>
        {!noOptions && (
          <View style={styles.dots}>
            <StepDot active onPress={() => {}} activeColor={tokens.accent} inactiveColor={tokens.borderStrong} />
            <StepDot active={step === 'sources'} onPress={() => {}} activeColor={tokens.accent} inactiveColor={tokens.borderStrong} />
          </View>
        )}
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }]}>
          Pull money
        </Text>
      </View>

      {noOptions ? (
        <View style={[styles.body, { padding: space.xl }]}>
          <Text style={{ color: tokens.text2, fontSize: type.caption, fontFamily: fontFamily.bodyMedium }}>
            {!target ? `${targetCategoryName} isn't set up as an envelope.` : 'No funds available to pull from.'}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={[styles.confirmButton, { backgroundColor: tokens.inputBg, borderRadius: radius.full, marginTop: space.lg }]}
          >
            <Text style={[styles.confirmText, { color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }]}>Close</Text>
          </Pressable>
        </View>
      ) : step === 'amount' ? (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.body, { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg }]}
            keyboardShouldPersistTaps="handled"
          >
          <Text style={[styles.stepLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>
            STEP 1 OF 2 · AMOUNT
          </Text>
          <DestinationCard
            targetCategoryName={targetCategoryName}
            targetAvail={targetAvail}
            isOverspent={isOverspent}
            shortfall={shortfall}
            hideAmounts={hideAmounts}
            tokens={tokens}
            space={space}
            radius={radius}
            type={type}
          />

          <View style={[styles.amountWrap, { gap: space.sm }]}>
            <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }}>
              <AmountText
                value={amount}
                rawText={formatAmountInput(amountStr)}
                size={type.hero}
                weight="displayBold"
                animate
                ignoreHide
              />
            </Animated.View>
            <Text style={{ color: tokens.text2, fontSize: type.caption, fontFamily: fontFamily.bodyMedium }}>
              {amount === 0
                ? 'Type an amount to get started'
                : isOverspent && amount >= shortfall
                  ? amount > shortfall
                    ? `Clears the overspend, ${formatCurrency(amount - shortfall, hideAmounts)} extra`
                    : 'Clears the overspend exactly'
                  : isOverspent
                    ? `${formatCurrency(shortfall - amount, hideAmounts)} more needed to clear it`
                    : `Adds to ${splitEmoji(targetCategoryName).text}`}
            </Text>
          </View>

          <View style={styles.quickRow}>
              {isOverspent && shortfall > 0 && (
                <QuickChip
                  label={`Cover overspend · ${formatCurrency(shortfall, hideAmounts)}`}
                  active={amount === Math.round(shortfall)}
                  onPress={() => {
                    setAmountStr(String(Math.round(shortfall)))
                    setAllocs({})
                  }}
                  tokens={tokens}
                  radius={radius}
                />
              )}
              {QUICK_PICKS.map((v) => (
                <QuickChip
                  key={v}
                  label={formatMoney(v)}
                  active={amount === v}
                  onPress={() => {
                    setAmountStr(String(v))
                    setAllocs({})
                  }}
                  tokens={tokens}
                  radius={radius}
                />
              ))}
            </View>
          </ScrollView>

          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, gap: space.md }}>
            <Numpad
              extraKey="."
              onDigit={pushDigit}
              onBackspace={handleBackspace}
              onClear={() => setAmountStr('')}
            />
            <Pressable
              onPress={() => amount > 0 && setStep('sources')}
              disabled={amount === 0}
              style={[
                styles.confirmButton,
                { backgroundColor: amount > 0 ? tokens.accent : tokens.inputBg, borderRadius: radius.full, opacity: amount > 0 ? 1 : 0.5 },
              ]}
            >
              <Text style={[styles.confirmText, { color: amount > 0 ? tokens.onAccent : tokens.text3, fontFamily: fontFamily.bodyBold, fontSize: type.body }]}>
                {amount > 0 ? 'Pick sources →' : 'Add an amount'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={[styles.sourcesHeader, { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, gap: space.sm, borderBottomColor: tokens.border }]}>
            <Text style={[styles.stepLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>
              STEP 2 OF 2 · SOURCES
            </Text>
            <View style={styles.coverRow}>
              <View>
                <Text style={[styles.stepLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>
                  {remaining > 0 ? 'STILL NEEDED' : 'FULLY COVERED'}
                </Text>
                <AmountText
                  value={remaining > 0 ? remaining : amount}
                  size={type.heading}
                  weight="displayBold"
                  color={remaining > 0 ? tokens.text : tokens.mint}
                />
              </View>
              <Text style={{ color: tokens.text2, fontSize: type.caption, fontFamily: fontFamily.bodySemiBold }}>
                → {formatCurrency(amount, hideAmounts)} to {splitEmoji(targetCategoryName).text}
              </Text>
            </View>
            <View
              style={[styles.progressTrack, { backgroundColor: tokens.borderStrong, borderRadius: radius.full }]}
              onLayout={(e) => setProgressTrackWidth(e.nativeEvent.layout.width)}
            >
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressWidth,
                    backgroundColor: remaining > 0 ? tokens.accent : tokens.mint,
                    borderRadius: radius.full,
                  },
                ]}
              />
            </View>
            <View style={[styles.searchRow, { gap: space.sm }]}>
              <View style={[styles.searchBox, { backgroundColor: tokens.inputBg, borderColor: tokens.border, borderRadius: radius.md, paddingHorizontal: space.md, gap: space.sm }]}>
                <Search size={14} color={tokens.text3} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Find an envelope"
                  placeholderTextColor={tokens.text3}
                  style={[styles.searchInput, { color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }]}
                />
              </View>
              <Pressable
                onPress={autoFillNow}
                style={[styles.autoFillBtn, { borderColor: tokens.accent, backgroundColor: tokens.accentSoft, borderRadius: radius.md, paddingHorizontal: space.md }]}
              >
                <Text style={{ color: tokens.accent, fontSize: type.caption, fontFamily: fontFamily.bodyBold }}>Auto-fill</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.body, { padding: space.lg, gap: space.sm }]}
            keyboardShouldPersistTaps="handled"
          >
            {pickedRows.length > 0 && (
              // One block, not a label + rows animating independently — its label
              // stays rigidly attached to its rows as the whole thing grows/shrinks,
              // instead of drifting past them on its own spring (see SOURCE_TRANSITION).
              <Reanimated.View layout={SOURCE_TRANSITION} entering={FadeIn.duration(150)} exiting={SOURCE_EXIT} style={{ gap: space.sm }}>
                <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>FROM</Text>
                {pickedRows.map((item) => (
                  <PickedSourceRow
                    key={item.key}
                    item={item}
                    alloc={allocs[item.key] ?? 0}
                    max={maxFor(item)}
                    hideAmounts={hideAmounts}
                    onChange={(v) => setAllocValue(item.key, v)}
                    onRemove={() => removeAlloc(item.key)}
                    tokens={tokens}
                    space={space}
                    radius={radius}
                    type={type}
                  />
                ))}
              </Reanimated.View>
            )}

            <Reanimated.View layout={SOURCE_TRANSITION} style={{ gap: space.sm, marginTop: pickedRows.length > 0 ? space.sm : 0 }}>
              <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>
                {q ? 'SEARCH RESULTS' : 'SUGGESTED SOURCES'}
              </Text>
              {poolRows.map((item) => (
                <PoolSourceRow key={item.key} item={item} hideAmounts={hideAmounts} onPress={() => pick(item)} tokens={tokens} space={space} radius={radius} type={type} />
              ))}
            </Reanimated.View>
            {poolRows.length === 0 && pickedRows.length === 0 && (
              <Text style={{ color: tokens.text3, fontSize: type.caption, fontFamily: fontFamily.bodyMedium, textAlign: 'center', paddingVertical: space.xl }}>
                {q ? `Nothing named "${query}"` : 'Nothing else to pull from'}
              </Text>
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, gap: space.sm }}>
            {error !== '' && (
              <Text style={[styles.error, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>{error}</Text>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={!ready || saving || moveSuccess}
              style={[
                styles.confirmButton,
                { backgroundColor: moveSuccess ? tokens.mint : ready ? tokens.accent : tokens.inputBg, borderRadius: radius.full, opacity: !ready || saving ? 0.5 : 1 },
              ]}
            >
              {moveSuccess ? (
                <CheckIcon color={tokens.onAccent} />
              ) : (
                <Text style={[styles.confirmText, { color: ready ? tokens.onAccent : tokens.text3, fontFamily: fontFamily.bodyBold, fontSize: type.body }]}>
                  {saving
                    ? 'Moving…'
                    : ready
                      ? `Move ${formatCurrency(amount, hideAmounts)}`
                      : remaining === amount
                        ? 'Choose where to pull from'
                        : `${formatCurrency(remaining, hideAmounts)} more to allocate`}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

function DestinationCard({
  targetCategoryName,
  targetAvail,
  isOverspent,
  shortfall,
  hideAmounts,
  tokens,
  space,
  radius,
  type,
}: {
  targetCategoryName: string
  targetAvail: number
  isOverspent: boolean
  shortfall: number
  hideAmounts: boolean
  tokens: ThemeTokens
  space: Record<string, number>
  radius: Record<string, number>
  type: Record<string, number>
}) {
  const { formatCurrency } = useCurrency()

  const { icon, text } = splitEmoji(targetCategoryName)
  return (
    <View style={[styles.destCard, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, padding: space.md, gap: space.md }]}>
      <View style={[styles.destIcon, { backgroundColor: tokens.accentSoft, borderRadius: radius.md }]}>
        <Text style={{ fontSize: type.title }}>{icon || categoryEmoji(targetCategoryName)}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.destLabel, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }]}>MOVING TO</Text>
        <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>{text}</Text>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }}>
          {isOverspent
            ? `${formatCurrency(shortfall, hideAmounts)} overspent`
            : `${formatCurrency(targetAvail, hideAmounts)} available`}
        </Text>
      </View>
    </View>
  )
}

function QuickChip({
  label,
  active,
  onPress,
  tokens,
  radius,
}: {
  label: string
  active: boolean
  onPress: () => void
  tokens: ThemeTokens
  radius: Record<string, number>
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        onPress()
      }}
      style={[
        styles.quickChip,
        {
          borderRadius: radius.full,
          borderColor: active ? tokens.accent : tokens.borderStrong,
          backgroundColor: active ? tokens.accentSoft : tokens.inputBg,
        },
      ]}
    >
      <Text style={{ color: active ? tokens.accentInk : tokens.text2, fontSize: 12, fontFamily: fontFamily.bodyBold }}>{label}</Text>
    </Pressable>
  )
}

function PickedSourceRow({
  item,
  alloc,
  max,
  hideAmounts,
  onChange,
  onRemove,
  tokens,
  space,
  radius,
  type,
}: {
  item: SourceItem
  alloc: number
  max: number
  hideAmounts: boolean
  onChange: (v: number) => void
  onRemove: () => void
  tokens: ThemeTokens
  space: Record<string, number>
  radius: Record<string, number>
  type: Record<string, number>
}) {
  const { formatCurrency, currencySymbol } = useCurrency()

  function commit(raw: string) {
    const parsed = Math.max(0, Math.min(max, Math.round(Number(raw)) || 0))
    onChange(parsed)
  }

  return (
    // `layout` springs this row into its new slot as siblings above/below it
    // resize; `entering`/`exiting` are its own pop-in/fade-out. zIndex keeps
    // it painted above the section labels while they slide past it — those
    // reposition on the same spring and would otherwise cut across it.
    <Reanimated.View style={styles.sourceRowLayer} layout={SOURCE_TRANSITION} entering={SOURCE_ENTER} exiting={SOURCE_EXIT}>
      <View style={[styles.sourceRow, { backgroundColor: tokens.accentSoft, borderColor: tokens.accent, borderRadius: radius.lg, padding: space.md, gap: space.sm }]}>
        <View style={styles.sourceRowTop}>
          <View style={[styles.sourceIcon, { backgroundColor: tokens.accentSoft, borderRadius: radius.sm }]}>
            <Text style={{ fontSize: type.body }}>{item.emoji}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.caption }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: 11 }}>
              {formatCurrency(item.available, hideAmounts)} → {formatCurrency(item.available - alloc, hideAmounts)}
            </Text>
          </View>
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove" style={styles.removeBtn}>
            <Trash2 size={14} color={tokens.text3} />
          </Pressable>
        </View>
        <View style={[styles.allocInputRow, { backgroundColor: tokens.inputBg, borderColor: tokens.border, borderRadius: radius.sm, paddingHorizontal: space.sm }]}>
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>{currencySymbol}</Text>
          <TextInput
            value={String(alloc)}
            onChangeText={commit}
            keyboardType="number-pad"
            style={[styles.allocInput, { color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }]}
          />
        </View>
      </View>
    </Reanimated.View>
  )
}

function PoolSourceRow({
  item,
  hideAmounts,
  onPress,
  tokens,
  space,
  radius,
  type,
}: {
  item: SourceItem
  hideAmounts: boolean
  onPress: () => void
  tokens: ThemeTokens
  space: Record<string, number>
  radius: Record<string, number>
  type: Record<string, number>
}) {
  const { formatCurrency } = useCurrency()

  return (
    <Reanimated.View style={styles.sourceRowLayer} layout={SOURCE_TRANSITION} entering={FadeIn.duration(150)} exiting={SOURCE_EXIT}>
      <Pressable
        onPress={onPress}
        style={[styles.sourceRow, styles.sourceRowTop, { backgroundColor: tokens.card, borderColor: tokens.border, borderRadius: radius.lg, padding: space.md }]}
      >
        <View style={[styles.sourceIcon, { backgroundColor: tokens.inputBg, borderRadius: radius.sm }]}>
          <Text style={{ fontSize: type.body }}>{item.emoji}</Text>
        </View>
        <Text style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.caption }} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.caption }}>
            {formatCurrency(item.available, hideAmounts)}
          </Text>
          <Text style={{ color: tokens.text3, fontSize: 10, fontFamily: fontFamily.bodyBold }}>AVAILABLE</Text>
        </View>
      </Pressable>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Painted above the section labels (default zIndex 0) so a row popping in
  // or a label springing to its new slot never crosses on top of it.
  sourceRowLayer: { zIndex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, flex: 1 },
  headerTitle: {},
  stepLabel: { letterSpacing: 0.6 },
  body: {},
  destCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  destIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  destLabel: { letterSpacing: 0.6 },
  amountWrap: { alignItems: 'center', paddingVertical: 8 },
  quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  quickChip: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1 },
  confirmButton: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  confirmText: {},
  error: { fontSize: 12, paddingBottom: 4 },
  sourcesHeader: { borderBottomWidth: StyleSheet.hairlineWidth },
  coverRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  progressTrack: { height: 6, overflow: 'hidden' },
  progressFill: { height: '100%' },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 38, borderWidth: 1 },
  searchInput: { flex: 1, padding: 0 },
  autoFillBtn: { height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  sectionLabel: { letterSpacing: 0.6, paddingBottom: 2 },
  sourceRow: { borderWidth: 1 },
  sourceRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sourceIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  // Fixed box so the icon centers on itself instead of on the Pressable's
  // measured bounds, which can drift off-center next to a taller sibling.
  removeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  allocInputRow: { flexDirection: 'row', alignItems: 'center', height: 36, borderWidth: 1, gap: 4 },
  allocInput: { flex: 1, paddingVertical: 6 },
})
