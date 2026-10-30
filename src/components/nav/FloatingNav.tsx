import { useCallback, useEffect, useRef } from 'react'
import {
  View,
  Animated,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  withSpring,
  withTiming,
  interpolateColor,
  withRepeat,
  cancelAnimation,
  runOnJS,
  useReducedMotion,
  Easing,
  type FrameCallback,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { useInvalidFeedback } from '@/src/components/ui/useInvalidFeedback'
import { AddCircleLoad, AddCircleDone } from './AddCircleAnim'
import { HomeGlyph, ActivityGlyph, EnvelopeGlyph, ProfileGlyph, PlusGlyph, type NavIconComponent } from './NavIcons'
import { tap } from '@/src/lib/haptics'

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable)

export type NavRoute = 'index' | 'activity' | 'envelopes' | 'more'

/** Rendered left-to-right in the pill. The add action sits outside it, on the right. */
export const NAV_ROUTES: { name: NavRoute; glyph: NavIconComponent; label: string }[] = [
  { name: 'index', glyph: HomeGlyph, label: 'Home' },
  { name: 'activity', glyph: ActivityGlyph, label: 'Activity' },
  { name: 'envelopes', glyph: EnvelopeGlyph, label: 'Categories' },
  { name: 'more', glyph: ProfileGlyph, label: 'More' },
]

export const NAV_HREF: Record<NavRoute, '/' | '/activity' | '/envelopes' | '/more'> = {
  index: '/',
  activity: '/activity',
  envelopes: '/envelopes',
  more: '/more',
}

type NavStateTree = { key?: string; index?: number; routes: { name: string; state?: NavStateTree }[] }

/**
 * The (tabs) navigator's state, for dispatching to it directly by its key.
 * expo-router nests it under its own root stack, so it's searched for.
 * Topmost first: a `router.replace('/(tabs)')` from a pushed screen (Done
 * on expense-added) stacks a second copy over the first, and jumping the
 * hidden one left the nav lit on a tab the screen never switched to.
 */
export function tabsState(state: NavStateTree | undefined): NavStateTree | undefined {
  for (const route of [...(state?.routes ?? [])].reverse()) {
    const tabs = route.name === '(tabs)' ? route.state : tabsState(route.state)
    if (tabs?.key) return tabs
  }
  return undefined
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

/** Height of the pill and diameter of the add disc beside it. */
const BAR = 56
const PILL_PAD = 5
/** Width of one tab inside the pill; the highlight is the same size and slides between them. */
const TAB_W = 56
const TAB_H = BAR - 2 * PILL_PAD
const ICON = 26
/** Inset of the pill and the add disc from the screen's sides. Also where QuickAddMenu anchors. */
export const NAV_SIDE = 16
// Vertical room around the bar inside the row's own bounds, so the add
// disc's save animation (AddCircleAnim's 64px box) and halo aren't clipped.
const ROW_TOP_BLEED = 16
const ROW_BOTTOM_BLEED = 28
const ROW_HEIGHT = BAR + ROW_TOP_BLEED + ROW_BOTTOM_BLEED
// Opaque backdrop behind the whole nav strip, from just above the bar down
// to the screen edge: content scrolls underneath, and the bar alone doesn't
// cover the gap beside it or the safe-area strip below it, so without this a
// scrolled row (or the home-indicator area) shows through.
const BACKDROP_PAD = 7
// Gap between the bar and the screen edge, on top of the safe-area inset.
// 4px (space.xs) read as flush against the Android 3-button nav bar in
// testing — bumped so the strip visibly clears it.
const NAV_BOTTOM_GAP = 10
// Fade above the backdrop so scrolled content dissolves into it instead of
// being cut off at a hard edge.
const BACKDROP_FADE = 24
/** How long the highlight takes to slide between tabs. */
const NAV_SLIDE_MS = 110
/** The highlight's slide: quick and flat, no bounce, so the landing tap follows the press tap closely. */
const SLIDE_EASE = Easing.out(Easing.cubic)
/** The most one frame may advance the slide, so a stalled frame can't skip it. */
const MAX_FRAME_MS = 1000 / 60

/**
 * Floating navigation: one pill holding the four tabs, and the add action as
 * its own disc beside it. Content scrolls underneath, so every screen
 * reserves NAV_HEIGHT of bottom padding (see Screen / useNavPadding).
 *
 * The selected tab sits on a highlight that slides along the pill. A tab
 * switch is felt as two small hard ticks: one on touch-down, one when the
 * highlight lands on the new tab (see `tap` in src/lib/haptics).
 *
 * Add is an action, not a destination, so it lives outside the pill as the
 * one solid accent thing in the bar. It stays in the same spot on every
 * screen the nav appears on, log-expense included, where it becomes the save
 * button: tap to open log-expense, tap again to submit. Only its content
 * swaps, to a spinner (submitting) or a check (saved).
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
  /** Long-press shortcut on the add disc only. */
  onAddLongPress?: () => void
  /** Called alongside the shake when an incomplete active add is tapped, so the form can point at what's missing. */
  onAddInvalid?: () => void
  /** True on the log-expense screen: the add disc becomes the save button. */
  addActive?: boolean
  /** Meaningful only when addActive: submit in flight, shows a spinner in place of the glyph. */
  addSaving?: boolean
  /** Meaningful only when addActive: submit just succeeded, briefly shows a check. */
  addSuccess?: boolean
  /** Meaningful only when addActive: keeps an incomplete submit tappable but shakes it instead of calling onAdd. */
  addInvalid?: boolean
  /** Meaningful only when addActive: blocks the tap while saving or after success. */
  addDisabled?: boolean
  /** Meaningful only when addActive: a first-timer's or returning user's form is ready, so pulse the add disc and say it saves. */
  addHint?: boolean
  children?: React.ReactNode
}) {
  const { tokens } = useTheme()
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

  // On log-expense the bar sits over the accent flood in both schemes, so the
  // pill goes tone-on-tone there: a translucent white tint with softer white
  // glyphs, so it recedes behind the save disc.
  // Plain white, not onAccent: onAccent is near-black in the dark scheme and
  // the flood is the same orange in both, so the save disc stays white.
  const floodDisc = '#ffffff'
  const idleIcon = addActive ? 'rgba(255, 255, 255, 0.7)' : tokens.text3

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: NAV_BOTTOM_GAP }]}
    >
      {children}
      <View pointerEvents="box-none" style={[styles.row, { height: ROW_HEIGHT + insets.bottom }]}>
        <TabPill active={active} onSelect={onSelect} onFlood={addActive} idleIcon={idleIcon} />
        <Animated.View
          style={{
            transform: [
              { translateX: invalidAddShake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) },
            ],
          }}
        >
          {addActive && addHint && (
            <View pointerEvents="none" style={styles.hint}>
              <Text style={[styles.hintText, { color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold }]}>Tap + to save</Text>
            </View>
          )}
          {addActive && addHint && <AddHalo color={tokens.onAccent} />}
          <AddDisc
            selected={addActive}
            // On the accent flood an accent disc would vanish, so it inverts:
            // white disc, accent plus. Success keeps the mint disc
            // edge-to-edge so no white rim shows around it.
            background={addActive ? (addSuccess ? tokens.successBg : floodDisc) : tokens.accent}
            color={addActive ? tokens.accent : tokens.onAccent}
            onPress={handleAdd}
            onLongPress={addActive ? undefined : onAddLongPress}
            disabled={addActive && (addDisabled || addSaving || addSuccess)}
            dimmed={addActive && (addInvalid || addDisabled || addSaving || addSuccess)}
            pressHaptic={!(addActive && addInvalid)}
            overrideContent={
              addActive && addSuccess ? (
                <View testID="nav-add-success">
                  <AddCircleDone discColor={tokens.successBg} checkColor={tokens.onSuccess} />
                </View>
              ) : addActive && addSaving ? (
                <View testID="nav-add-saving">
                  <AddCircleLoad discColor={floodDisc} iconColor={tokens.accent} />
                </View>
              ) : undefined
            }
          />
        </Animated.View>
      </View>
    </View>
  )
}

/**
 * The four tabs on one pill, with a highlight behind the selected one that
 * slides across on a switch. Nothing is highlighted off the tabs (log-expense).
 *
 * The slide is stepped frame by frame, each step capped at 1/60s, rather than
 * run on the clock. Android stalls the UI thread right after a switch while it
 * attaches the new tab's views (130-480ms measured on the emulator), and a
 * clock-driven slide finished inside the stall: the highlight jumped. Stepped,
 * a stall only delays it, so the screen cuts and the highlight still slides.
 */
function TabPill({
  active,
  onSelect,
  onFlood,
  idleIcon,
}: {
  active: NavRoute | null
  onSelect: (name: NavRoute) => void
  onFlood: boolean
  idleIcon: string
}) {
  const { tokens } = useTheme()
  const reduceMotion = useReducedMotion()
  const index = NAV_ROUTES.findIndex((r) => r.name === active)
  const x = useSharedValue(Math.max(index, 0) * TAB_W)
  const shown = useSharedValue(index >= 0 ? 1 : 0)
  const from = useSharedValue(0)
  const to = useSharedValue(Math.max(index, 0) * TAB_W)
  // Slide progress, 0 to 1. Set to 0 to start a slide from wherever the highlight is.
  const progress = useSharedValue(1)
  const slideRef = useRef<FrameCallback | null>(null)
  // Which slide is current. A landing reaches JS a frame late, and one from a
  // slide a quick second tap already replaced mustn't stop the new one.
  const slideId = useRef(0)
  const currentSlide = useSharedValue(0)
  const land = useCallback((id: number) => {
    if (id !== slideId.current) return
    slideRef.current?.setActive(false)
    tap()
  }, [])
  const step = useCallback(
    (frame: FrameInfo) => {
      'worklet'
      if (progress.value >= 1) return
      if (progress.value === 0) from.value = x.value
      progress.value = Math.min(1, progress.value + Math.min(frame.timeSincePreviousFrame ?? 0, MAX_FRAME_MS) / NAV_SLIDE_MS)
      x.value = from.value + (to.value - from.value) * SLIDE_EASE(progress.value)
      if (progress.value >= 1) runOnJS(land)(currentSlide.value)
    },
    [progress, from, to, x, land, currentSlide],
  )
  const slide = useFrameCallback(step, false)
  slideRef.current = slide
  // Where the highlight was last sent, kept on the JS side. Reading x or
  // shown back here isn't reliable: a JS write lands on the UI thread
  // asynchronously and a JS read can return a stale copy, which skipped the
  // slide and left the highlight stuck on the old tab.
  const prevIndex = useRef(index)

  useEffect(() => {
    const prev = prevIndex.current
    prevIndex.current = index
    if (index < 0) {
      // Stopping ends the slide unfinished, so it never taps out of sight.
      slide.setActive(false)
      progress.value = 1
      // Hidden and shown as a cut, like the glyphs: a fade left the lit glyph
      // bare for 160ms coming back from log-expense.
      shown.value = 0
      return
    }
    // Coming from no highlight (leaving log-expense or a pushed screen): appear in place rather than sliding in from wherever it was last.
    to.value = index * TAB_W
    if (prev < 0 || reduceMotion) {
      slide.setActive(false)
      progress.value = 1
      x.value = index * TAB_W
    } else if (prev !== index) {
      currentSlide.value = ++slideId.current
      progress.value = 0
      slide.setActive(true)
    }
    shown.value = 1
  }, [index, reduceMotion, x, shown, to, progress, slide, currentSlide])

  const highlightStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateX: x.value }] }))

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.pill,
        onFlood
          ? { backgroundColor: 'rgba(255, 255, 255, 0.2)' }
          : { backgroundColor: tokens.cardSolid, borderWidth: 1, borderColor: tokens.borderStrong },
      ]}
    >
      <Reanimated.View
        testID="nav-highlight"
        pointerEvents="none"
        style={[styles.highlight, { backgroundColor: tokens.accentSoft }, highlightStyle]}
      />
      {NAV_ROUTES.map((r) => (
        <NavTab
          key={r.name}
          glyph={r.glyph}
          label={r.label}
          selected={active === r.name}
          color={tokens.accent}
          idleColor={idleIcon}
          onPress={() => onSelect(r.name)}
        />
      ))}
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
 * The opaque strip behind the nav, rendered by the (tabs) layout rather than
 * by FloatingNav itself: the nav is a root overlay that switches state the
 * instant the pathname changes, while the screens underneath fade. Owned by
 * the screen, the strip fades with it instead of flipping color early.
 * Log-expense has no strip; its accent flood already fills the area.
 */
export function NavBackdrop() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      pointerEvents="none"
      style={[
        styles.backdrop,
        {
          height: ROW_HEIGHT - (ROW_TOP_BLEED - BACKDROP_PAD) + insets.bottom + NAV_BOTTOM_GAP,
          backgroundColor: tokens.bg,
        },
      ]}
    >
      {/* tokens.bg is #rrggbb in both schemes; fading to 'transparent' would go through grey on iOS. */}
      <LinearGradient colors={[`${tokens.bg}00`, tokens.bg]} style={styles.backdropFade} />
    </View>
  )
}

/**
 * Cross-fades a color prop instead of cutting: whenever `color` changes,
 * blends from the previous value to the new one over `duration`ms. Used for
 * the circle fill, which swaps between the idle and accent colors as selection
 * moves along the row.
 */
function useColorFade(color: string, duration = 200, snap = false): SharedValue<string> {
  const from = useSharedValue(color)
  const to = useSharedValue(color)
  const progress = useSharedValue(1)
  const prevRef = useRef(color)

  useEffect(() => {
    if (prevRef.current === color) return
    from.value = prevRef.current
    to.value = color
    prevRef.current = color
    progress.value = snap ? 1 : 0
    if (!snap) progress.value = withTiming(1, { duration })
  }, [color, duration, snap, from, to, progress])

  return useDerivedValue(() => interpolateColor(progress.value, [0, 1], [from.value, to.value]))
}

/**
 * A tab's glyph, both looks always mounted and swapped by opacity, as a cut
 * in the same commit as the screen. Swapping the weight re-rendered the SVG,
 * and Android paints a new SVG a frame or more after the rest of a switch, so
 * the tab lit up after the screen had already changed (screen recording,
 * 2026-10-24: up to 66ms). A fade left the old tab lit over the new screen.
 */
function TabIcon({ icon: Icon, selected, color, idleColor, size }: { icon: NavIconComponent; selected: boolean; color: string; idleColor: string; size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { opacity: selected ? 0 : 1 }]} pointerEvents="none">
        <Icon size={size} color={idleColor} weight="regular" />
      </View>
      <View style={[StyleSheet.absoluteFill, { opacity: selected ? 1 : 0 }]} pointerEvents="none">
        <Icon size={size} color={color} weight="fill" />
      </View>
    </View>
  )
}

/**
 * One tab in the pill. Fires on touch-down like a native tab bar; the
 * highlight behind it is the pill's, so the tab itself only swaps its glyph.
 */
function NavTab({
  glyph,
  label,
  selected,
  color,
  idleColor,
  onPress,
}: {
  glyph: NavIconComponent
  label: string
  selected: boolean
  color: string
  idleColor: string
  onPress: () => void
}) {
  // Set when touch-down already fired, so the release that follows doesn't
  // fire again. A screen reader's activate only calls onPress, so that path
  // still works.
  const firedOnPressIn = useRef(false)
  const fire = () => {
    tap()
    onPress()
  }
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={{ top: PILL_PAD + 8, bottom: PILL_PAD + 8 }}
      onPressIn={() => {
        firedOnPressIn.current = true
        fire()
      }}
      onPress={() => {
        if (firedOnPressIn.current) {
          firedOnPressIn.current = false
          return
        }
        fire()
      }}
      style={styles.tab}
    >
      <TabIcon icon={glyph} selected={selected} color={color} idleColor={idleColor} size={ICON} />
    </Pressable>
  )
}

/** The add disc beside the pill. Fires on release, since it also long-presses. */
function AddDisc({
  selected,
  background,
  color,
  onPress,
  onLongPress,
  disabled = false,
  dimmed = disabled,
  pressHaptic = true,
  overrideContent,
}: {
  selected: boolean
  background: string
  color: string
  onPress: () => void
  onLongPress?: () => void
  disabled?: boolean
  dimmed?: boolean
  pressHaptic?: boolean
  /** Replaces the glyph entirely (e.g. a spinner or check) when set. */
  overrideContent?: React.ReactNode
}) {
  const { motion } = useTheme()
  const pressScale = useSharedValue(1)
  // Onto or off log-expense the screen behind changes in one frame, so the disc
  // does too: a tween from white to accent over a white screen hid it.
  const prevSelected = useRef(selected)
  const flipped = prevSelected.current !== selected
  useEffect(() => {
    prevSelected.current = selected
  })
  const bgFade = useColorFade(background, 200, flipped)
  const discStyle = useAnimatedStyle(() => ({
    backgroundColor: bgFade.value,
    transform: [{ scale: pressScale.value }],
  }))

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Log expense"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPressIn={() => {
        pressScale.value = withSpring(0.88, motion.springTight)
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, motion.spring)
      }}
      onPress={() => {
        if (pressHaptic) tap()
        onPress()
      }}
      onLongPress={
        onLongPress &&
        (() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
          onLongPress()
        })
      }
      style={[styles.disc, discStyle, dimmed ? styles.disabled : null]}
    >
      {/* Same weight in both looks, so a switch only changes its fill: no new SVG to paint late. */}
      {overrideContent ?? <PlusGlyph size={ICON} color={color} weight="bold" />}
    </AnimatedPressable>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: NAV_SIDE },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdropFade: { position: 'absolute', left: 0, right: 0, top: -BACKDROP_FADE, height: BACKDROP_FADE },
  pill: { flexDirection: 'row', height: BAR, padding: PILL_PAD, borderRadius: BAR / 2 },
  highlight: { position: 'absolute', left: PILL_PAD, top: PILL_PAD, width: TAB_W, height: TAB_H, borderRadius: TAB_H / 2 },
  tab: { width: TAB_W, height: TAB_H, alignItems: 'center', justifyContent: 'center' },
  disc: { width: BAR, height: BAR, borderRadius: BAR / 2, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  halo: { position: 'absolute', left: 0, top: 0, width: BAR, height: BAR, borderRadius: BAR / 2 },
  // Right-aligned over the disc, wide enough that the caption never wraps.
  hint: { position: 'absolute', right: 0, bottom: BAR + 12, width: 200, alignItems: 'flex-end' },
  hintText: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
})
