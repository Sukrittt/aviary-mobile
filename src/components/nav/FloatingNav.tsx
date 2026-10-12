import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Animated,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
  interpolateColor,
  withRepeat,
  cancelAnimation,
  useReducedMotion,
  Easing,
  type SharedValue,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useInvalidFeedback } from '@/src/components/ui/useInvalidFeedback'
import { AddCircleLoad, AddCircleDone } from './AddCircleAnim'
import { HomeGlyph, ActivityGlyph, EnvelopeGlyph, ProfileGlyph, PlusGlyph, type NavIconComponent } from './NavIcons'

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable)

export type NavRoute = 'index' | 'activity' | 'envelopes' | 'more'

/** Rendered left-to-right, with the add button occupying the centre slot. */
export const NAV_ROUTES: { name: NavRoute; glyph: NavIconComponent; label: string }[] = [
  { name: 'index', glyph: HomeGlyph, label: 'Home' },
  { name: 'activity', glyph: ActivityGlyph, label: 'Activity' },
  { name: 'envelopes', glyph: EnvelopeGlyph, label: 'Envelopes' },
  { name: 'more', glyph: ProfileGlyph, label: 'More' },
]

export const NAV_HREF: Record<NavRoute, '/' | '/activity' | '/envelopes' | '/more'> = {
  index: '/',
  activity: '/activity',
  envelopes: '/envelopes',
  more: '/more',
}

/** Which circle to light up for a pathname. Null on any screen outside the tabs. */
export function activeRouteFor(pathname: string): NavRoute | null {
  if (pathname === '/' || pathname === '/index') return 'index'
  const match = NAV_ROUTES.find((r) => pathname === `/${r.name}`)
  return match?.name ?? null
}

/** Nav state for a pathname: which slot is live, and whether the nav shows at all. */
export function navStateFor(pathname: string, addActive = false): { active: NavRoute | null; addActive: boolean; visible: boolean } {
  const active = activeRouteFor(pathname)
  return { active, addActive, visible: addActive || active !== null }
}

/**
 * Whether the (tabs) screen should draw its own nav copy instead of the root
 * overlay. `covered`: a nav-less screen was pushed straight over the tabs, so
 * the copy slides out with them. `arriving`: popped back onto a tab, so the
 * copy slides in with them until the transition ends (cleared by the caller).
 * Log-expense keeps the overlay throughout, since its nav morphs in place.
 */
export type NavCover = { path: string; tab: NavRoute; covered: boolean; arriving: boolean }

export function nextNavCover(prev: NavCover, pathname: string, onLogExpense: boolean): NavCover {
  if (prev.path === pathname) return prev
  const tab = activeRouteFor(pathname)
  const wasTab = activeRouteFor(prev.path) !== null
  return {
    path: pathname,
    tab: tab ?? prev.tab,
    covered: !tab && !onLogExpense && (wasTab || prev.covered),
    arriving: tab !== null && (prev.covered || prev.arriving),
  }
}

type NavSlot = { kind: 'route'; name: NavRoute; glyph: NavIconComponent; label: string } | { kind: 'add' }

/** Slot order matches NAV_ROUTES, with the add action inserted at the centre. */
const NAV_SLOTS: NavSlot[] = [
  ...NAV_ROUTES.slice(0, 2).map((r) => ({ kind: 'route' as const, ...r })),
  { kind: 'add' as const },
  ...NAV_ROUTES.slice(2).map((r) => ({ kind: 'route' as const, ...r })),
]

/** Diameter of the selected circle. The rest scale down from it. */
const CIRCLE = 56
/** What an unselected circle shrinks to: 56 * 0.82 ~= 46. */
const INACTIVE_SCALE = 0.82
const ICON = 26
const RING_GAP = 3
const RING_WIDTH = 3
const RING_SIZE = CIRCLE + 2 * (RING_GAP + RING_WIDTH)
/** Distance between two slot centres. 5 slots = 360, the narrowest common Android width. */
const SLOT = 72
// Room for the "floating" shadow (radius 16, vertical offset 6 => ~10px of
// bleed above the ring, ~24px below) inside the row's own bounds.
const ROW_TOP_BLEED = 10
const ROW_BOTTOM_BLEED = 24
const ROW_HEIGHT = RING_SIZE + ROW_TOP_BLEED + ROW_BOTTOM_BLEED
// Gap between the ring and the screen edge, on top of the safe-area inset.
// 4px (space.xs) read as flush against the Android 3-button nav bar in
// testing — bumped so the strip visibly clears it.
const NAV_BOTTOM_GAP = 10

/**
 * Detached navigation: free-floating circles laid over the page in one fixed
 * row, with no bar, border or scrim behind them. Content scrolls underneath,
 * so every screen reserves NAV_HEIGHT of bottom padding (see Screen /
 * useNavPadding).
 *
 * Every slot is always on screen. The selected one is drawn larger than its
 * neighbours and wears the ring; switching tabs shrinks the old one and grows
 * the new one at once, leaving every slot in between still.
 * (This used to be a swipeable carousel with the active slot centred, which
 * pushed tabs off screen. Testers couldn't find them.)
 *
 * The centre slot is an action, not a destination — logging an expense — but
 * sized and colored like every other circle until pressed, so it doesn't
 * compete with the active route's accent fill. The nav renders identically on
 * every screen it appears on, log-expense included: the glyph stays Plus
 * throughout (tap to navigate here, or to submit once already here), only its
 * content swaps to a spinner (submitting) or a check (saved), and which slot
 * holds the ring changes.
 */
export function FloatingNav({
  active,
  onSelect,
  onAdd,
  onAddLongPress,
  onAddInvalid,
  addActive = false,
  addSaving = false,
  addSuccess = false,
  addInvalid = false,
  addDisabled = false,
  addHint = false,
  children,
}: {
  active: NavRoute | null
  onSelect: (name: NavRoute) => void
  onAdd: () => void
  /** Long-press shortcut on the add slot only. */
  onAddLongPress?: () => void
  /** Called alongside the shake when an incomplete active add is tapped, so the form can point at what's missing. */
  onAddInvalid?: () => void
  /** True on the log-expense screen: the add slot becomes "you are here". */
  addActive?: boolean
  /** Meaningful only when addActive: submit in flight, shows a spinner in place of the glyph. */
  addSaving?: boolean
  /** Meaningful only when addActive: submit just succeeded, briefly shows a check. */
  addSuccess?: boolean
  /** Meaningful only when addActive: keeps an incomplete submit tappable but shakes it instead of calling onAdd. */
  addInvalid?: boolean
  /** Meaningful only when addActive: blocks the tap while saving or after success. */
  addDisabled?: boolean
  /** Meaningful only when addActive: a first-timer's form is ready, so pulse the add slot and say it saves. */
  addHint?: boolean
  children?: React.ReactNode
}) {
  const { tokens, elevation } = useTheme()
  const insets = useSafeAreaInsets()
  const { shake: invalidAddShake, triggerInvalidFeedback } = useInvalidFeedback()

  const handleAdd = useCallback(() => {
    if (addActive && addInvalid) {
      triggerInvalidFeedback()
      onAddInvalid?.()
      return
    }
    onAdd()
  }, [addActive, addInvalid, onAdd, onAddInvalid, triggerInvalidFeedback])

  // On log-expense the strip sits over the accent flood in both schemes, so
  // the idle circles go tone-on-tone there: a translucent white tint with a
  // softer white glyph, flat (no shadow), so they recede behind the add slot.
  const idle = addActive ? 'rgba(255, 255, 255, 0.2)' : tokens.cardSolid
  const idleIcon = addActive ? 'rgba(255, 255, 255, 0.7)' : tokens.text3
  const activeFill = tokens.accent
  const activeIcon = tokens.onAccent

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: NAV_BOTTOM_GAP }]}
    >
      {children}
      {addActive && addHint && (
        <View
          pointerEvents="none"
          style={[styles.hint, { bottom: NAV_BOTTOM_GAP + (ROW_HEIGHT + insets.bottom + RING_SIZE) / 2 + 6 }]}
        >
          <Text style={[styles.hintText, { color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold }]}>Tap + to save</Text>
        </View>
      )}
      <View pointerEvents="box-none" style={[styles.row, { height: ROW_HEIGHT + insets.bottom }]}>
        {NAV_SLOTS.map((slot) =>
          slot.kind === 'add' ? (
            <Animated.View
              key="add"
              style={{
                transform: [
                  { translateX: invalidAddShake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) },
                ],
              }}
            >
              {addActive && addHint && <AddHalo color={tokens.onAccent} />}
              <NavCircle
                glyph={PlusGlyph}
                label="Log expense"
                selected={addActive}
                background={addActive ? activeFill : idle}
                color={addActive ? activeIcon : idleIcon}
                ringColor={tokens.accent}
                onPress={handleAdd}
                onLongPress={addActive ? undefined : onAddLongPress}
                disabled={addActive && (addDisabled || addSaving || addSuccess)}
                dimmed={addActive && (addInvalid || addDisabled || addSaving || addSuccess)}
                pressHaptic={!(addActive && addInvalid)}
                overrideContent={
                  addActive && addSuccess ? (
                    <View testID="nav-add-success">
                      <AddCircleDone discColor={tokens.mint} checkColor={tokens.onAccent} />
                    </View>
                  ) : addActive && addSaving ? (
                    <View testID="nav-add-saving">
                      <AddCircleLoad discColor={activeFill} iconColor={activeIcon} />
                    </View>
                  ) : undefined
                }
                style={elevation.floating}
              />
            </Animated.View>
          ) : (
            <NavCircle
              key={slot.name}
              glyph={slot.glyph}
              label={slot.label}
              selected={active === slot.name}
              background={active === slot.name ? activeFill : idle}
              color={active === slot.name ? activeIcon : idleIcon}
              ringColor={tokens.accent}
              onPress={() => onSelect(slot.name)}
              onFlood={addActive}
            />
          ),
        )}
      </View>
    </View>
  )
}

/** A soft ring breathing out from the add circle. Reduced motion keeps it still. */
function AddHalo({ color }: { color: string }) {
  const reduceMotion = useReducedMotion()
  const t = useSharedValue(0)
  useEffect(() => {
    if (reduceMotion) return
    t.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false)
    return () => cancelAnimation(t)
  }, [reduceMotion, t])
  const style = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.3 : 0.45 * (1 - t.value),
    transform: [{ scale: reduceMotion ? 1.2 : 1 + 0.45 * t.value }],
  }))
  return <Reanimated.View testID="nav-add-hint" pointerEvents="none" style={[styles.halo, { backgroundColor: color }, style]} />
}

/**
 * Cross-fades a color prop instead of cutting: whenever `color` changes,
 * blends from the previous value to the new one over `duration`ms. Used for
 * the circle fill, which swaps between the idle and accent colors as selection
 * moves along the row.
 */
function useColorFade(color: string, duration = 200): SharedValue<string> {
  const from = useSharedValue(color)
  const to = useSharedValue(color)
  const progress = useSharedValue(1)
  const prevRef = useRef(color)

  useEffect(() => {
    if (prevRef.current === color) return
    from.value = prevRef.current
    to.value = color
    prevRef.current = color
    progress.value = 0
    progress.value = withTiming(1, { duration })
  }, [color, duration, from, to, progress])

  return useDerivedValue(() => interpolateColor(progress.value, [0, 1], [from.value, to.value]))
}

/**
 * Cross-fades `color` instead of cutting. The glyph never swaps rendering
 * mode (always a plain fill), but its SVG `fill` is a render-time prop, not
 * an animatable style, so the tween is faked the same way: the previous color
 * kept as a layer fading out under the new one fading in.
 */
function NavIcon({ icon: Icon, color, size }: { icon: NavIconComponent; color: string; size: number }) {
  const [prevColor, setPrevColor] = useState<string | null>(null)
  const currentColorRef = useRef(color)
  const progress = useSharedValue(1)

  useEffect(() => {
    if (currentColorRef.current === color) return
    setPrevColor(currentColorRef.current)
    currentColorRef.current = color
    progress.value = 0
    progress.value = withTiming(1, { duration: 200 })
  }, [color, progress])

  const topStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const bottomStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))

  return (
    <View style={{ width: size, height: size }}>
      {prevColor ? (
        <Reanimated.View style={[StyleSheet.absoluteFill, bottomStyle]} pointerEvents="none">
          <Icon size={size} color={prevColor} />
        </Reanimated.View>
      ) : null}
      <Reanimated.View style={topStyle} pointerEvents="none">
        <Icon size={size} color={color} />
      </Reanimated.View>
    </View>
  )
}

function NavCircle({
  glyph,
  label,
  selected,
  background,
  color,
  ringColor,
  onPress,
  onLongPress,
  disabled = false,
  dimmed = disabled,
  pressHaptic = true,
  overrideContent,
  onFlood = false,
  style,
}: {
  glyph: NavIconComponent
  label: string
  selected: boolean
  background: string
  color: string
  ringColor: string
  onPress: () => void
  onLongPress?: () => void
  disabled?: boolean
  dimmed?: boolean
  pressHaptic?: boolean
  /** Replaces the glyph entirely (e.g. a spinner or check) when set. */
  overrideContent?: React.ReactNode
  /** Sitting on the log-expense accent flood: no distance fade (the tint is already translucent) and no shadow. */
  onFlood?: boolean
  style?: object
}) {
  const { motion, elevation } = useTheme()
  const pressScale = useSharedValue(1)
  const bgFade = useColorFade(background)
  const selProgress = useSharedValue(selected ? 1 : 0)

  useEffect(() => {
    selProgress.value = withTiming(selected ? 1 : 0, { duration: 200 })
  }, [selected, selProgress])

  // t: 0 when selected, 1 when not. Drives the size and fade, so only the
  // slots actually changing state move.
  const circleStyle = useAnimatedStyle(() => {
    const t = 1 - selProgress.value
    return {
      backgroundColor: bgFade.value,
      opacity: onFlood ? 1 : 1 - t * 0.35,
      transform: [{ scale: pressScale.value * (1 - t * (1 - INACTIVE_SCALE)) }],
    }
  })

  const ringStyle = useAnimatedStyle(() => {
    const t = 1 - selProgress.value
    return {
      borderColor: ringColor,
      opacity: selProgress.value,
      transform: [{ scale: pressScale.value * (1 - t * (1 - INACTIVE_SCALE)) }],
    }
  })

  return (
    <View style={styles.slot}>
      <View style={styles.ringBox}>
        <Reanimated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
        <AnimatedPressable
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected, disabled }}
          disabled={disabled}
          hitSlop={{ left: (SLOT - CIRCLE) / 2, right: (SLOT - CIRCLE) / 2, top: 8, bottom: 8 }}
          onPressIn={() => {
            pressScale.value = withSpring(0.88, motion.springTight)
          }}
          onPressOut={() => {
            pressScale.value = withSpring(1, motion.spring)
          }}
          onPress={() => {
            if (pressHaptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
            onPress()
          }}
          onLongPress={
            onLongPress &&
            (() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
              onLongPress()
            })
          }
          style={[
            styles.circle,
            { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2 },
            selected ? elevation.floating : onFlood ? null : elevation.card,
            style,
            circleStyle,
            dimmed ? styles.disabled : null,
          ]}
        >
          {overrideContent ?? <NavIcon icon={glyph} color={color} size={ICON} />}
        </AnimatedPressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Absolute so the row overlays content rather than reserving a strip of it.
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  slot: { width: SLOT, alignItems: 'center', justifyContent: 'center' },
  ringBox: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_WIDTH,
  },
  circle: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  halo: {
    position: 'absolute',
    left: (SLOT - CIRCLE) / 2,
    top: (RING_SIZE - CIRCLE) / 2,
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
  },
  hint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hintText: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
})
