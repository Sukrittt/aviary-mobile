import { useEffect, useState } from 'react'
import { Pressable, Text, StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { CaretDown } from '@/src/components/shared/icons'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { tap } from '@/src/lib/haptics'
import { BudgetSwitcherSheet } from './BudgetSwitcherSheet'
import { BudgetIcon } from './BudgetIcon'
import { ChipSplash } from './ChipSplash'

/** How long the name stays out after a launch or a switch before the chip folds to its icon. */
const NAME_MS = 2200
const FOLD = { duration: 320, easing: Easing.out(Easing.cubic) }

/**
 * The home header's budget, with 2+ budgets in place of the bird mark. Says
 * the name on launch and on every switch, then folds to just the icon, with a
 * splash, so the header stays quiet. Opens the switcher.
 */
export function BudgetChip() {
  const { tokens } = useTheme()
  const { active } = useBudgetSpaces()
  const [open, setOpen] = useState(false)
  // The budget whose name has already folded away. Any other one, a launch or a switch, is named.
  const [foldedId, setFoldedId] = useState<string | null>(null)
  const [nameWidth, setNameWidth] = useState(0)
  // The budget whose fold is splashing right now.
  const [splashFor, setSplashFor] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  const shown = useSharedValue(1)

  const activeId = active?.id ?? null
  const named = foldedId !== activeId
  useEffect(() => {
    if (!activeId) return
    const timer = setTimeout(() => {
      setFoldedId(activeId)
      if (!reduceMotion) setSplashFor(activeId)
    }, NAME_MS)
    return () => clearTimeout(timer)
  }, [activeId, reduceMotion])

  useEffect(() => {
    shown.value = reduceMotion ? (named ? 1 : 0) : withTiming(named ? 1 : 0, FOLD)
  }, [named, reduceMotion, shown])

  const nameStyle = useAnimatedStyle(() => ({ width: shown.value * nameWidth, opacity: shown.value }))

  if (!active) return null
  return (
    <View style={styles.wrap}>
      {splashFor === activeId && !named && (
        <ChipSplash center={FOLDED_CENTER} color={tokens.accent} softColor={tokens.accentInk} onDone={() => setSplashFor(null)} />
      )}
      <Pressable
        testID="budget-chip"
        onPress={() => {
          tap()
          setOpen(true)
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${active.name} budget`}
        accessibilityHint="Switch budgets"
        style={[styles.chip, { backgroundColor: tokens.accentSoft }]}
      >
        <BudgetIcon budget={active} size={16} color={tokens.accentInk} />
        <Animated.View
          testID="budget-chip-name"
          accessibilityElementsHidden={!named}
          importantForAccessibility={named ? 'auto' : 'no-hide-descendants'}
          style={[styles.nameClip, nameStyle]}
        >
          {/* Laid out at its natural width off to the side, so the clip can grow to fit it. */}
          <View style={styles.nameRow} onLayout={(e) => setNameWidth(e.nativeEvent.layout.width)}>
            <Text numberOfLines={1} style={[styles.name, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>{active.name}</Text>
            <CaretDown size={14} color={tokens.accentInk} weight="bold" />
          </View>
        </Animated.View>
      </Pressable>
      <BudgetSwitcherSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  )
}

// Where the folded chip's icon sits: half its 36px width, half its 34px height.
const FOLDED_CENTER = { x: 18, y: 17 }

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8, minWidth: 36, justifyContent: 'center' },
  nameClip: { height: 18, overflow: 'hidden' },
  nameRow: { position: 'absolute', left: 0, top: 0, height: 18, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6 },
  name: { fontSize: 14, maxWidth: 104 },
})
