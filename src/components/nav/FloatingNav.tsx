import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  withSpring,
  withTiming,
  interpolateColor,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
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

type NavSlot = { kind: 'route'; name: NavRoute; glyph: NavIconComponent; label: string } | { kind: 'add' }

/** Slot order matches NAV_ROUTES, with the add action inserted at the centre. */
const NAV_SLOTS: NavSlot[] = [
  ...NAV_ROUTES.slice(0, 2).map((r) => ({ kind: 'route' as const, ...r })),
  { kind: 'add' as const },
  ...NAV_ROUTES.slice(2).map((r) => ({ kind: 'route' as const, ...r })),
]
const ADD_INDEX = 2

function indexOfRoute(name: NavRoute | null): number {
  if (name == null) return -1
  return NAV_SLOTS.findIndex((s) => s.kind === 'route' && s.name === name)
}

/** Diameter of the slot at centre. Everything off-centre scales down from it. */
const CIRCLE = 56
/** What an off-centre circle shrinks to: 56 * 0.82 ~= 46. */
const INACTIVE_SCALE = 0.82
const ICON = 26
const RING_GAP = 3
const RING_WIDTH = 3
const RING_SIZE = CIRCLE + 2 * (RING_GAP + RING_WIDTH)
/** Fixed carousel step: distance between two slot centres. */
const SLOT = 72
// Room for the "floating" shadow (radius 16, vertical offset 6 => ~10px of
// bleed above the ring, ~24px below) to render inside the ScrollView's own
// bounds instead of getting clipped by it. Asymmetric and top-anchored
// (see contentContainerStyle below) rather than centred, so padding the
// bottom for the shadow doesn't also push the ring itself upward.
const ROW_TOP_BLEED = 10
const ROW_BOTTOM_BLEED = 24
const ROW_HEIGHT = RING_SIZE + ROW_TOP_BLEED + ROW_BOTTOM_BLEED
// Opaque backdrop behind the whole nav strip, from just above the ring down
// to the screen edge: content scrolls underneath, and the circles alone
// don't cover the gaps between slots or the safe-area strip below them, so
// without this a scrolled row (or the home-indicator area) shows through.
const BACKDROP_PAD = 7
// Gap between the ring and the screen edge, on top of the safe-area inset.
// 4px (space.xs) read as flush against the Android 3-button nav bar in
// testing — bumped so the strip visibly clears it.
const NAV_BOTTOM_GAP = 10

/** Carousel x-offset that puts slot `i` at the centre of the screen. */
export const slotOffset = (i: number): number => i * SLOT

/** Nearest slot index for a given scroll offset, clamped to the slot range. */
export const indexFromOffset = (x: number, count: number): number => {
  'worklet'
  return Math.min(count - 1, Math.max(0, Math.round(x / SLOT)))
}

/**
 * How far slot `index` sits from the centre of the screen, as 0 (dead centre)
 * to 1 (a full slot away or further). Drives both the size falloff and the
 * ring hand-off, so those track the finger continuously instead of waiting for
 * the drag to commit.
 */
export const slotProximity = (x: number, index: number): number => {
  'worklet'
  return Math.min(1, Math.abs(x / SLOT - index))
}

/** How far (px) the centre "add" slot sits from the given active route's slot. */
export function addSlotShift(active: NavRoute | null): number {
  const routeIndex = indexOfRoute(active)
  return (ADD_INDEX - (routeIndex === -1 ? 0 : routeIndex)) * SLOT
}

const tickHaptic = () => {
  Haptics.selectionAsync().catch(() => {})
}

/**
 * Detached navigation: free-floating circles laid over the page in a
 * horizontal carousel, with no bar, border or scrim behind them. Content
 * scrolls underneath, so every screen reserves NAV_HEIGHT of bottom padding
 * (see Screen / useNavPadding).
 *
 * The selected slot always sits at screen centre, drawn larger than its
 * neighbours and wearing the ring. Dragging the row hands both the size and
 * the ring to whichever slot is nearest centre, ticking once per slot crossed
 * so the release point is felt rather than guessed; on release the nearest
 * slot snaps to centre and navigates to it.
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
  children,
}: {
  active: NavRoute | null
  onSelect: (name: NavRoute) => void
  onAdd: () => void
  /** Long-press shortcut on the add slot only — the carousel-commit path (drag to centre) stays press-only. */
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
  children?: React.ReactNode
}) {
  const { tokens, elevation } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
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

  const activeIndex = addActive ? ADD_INDEX : indexOfRoute(active)

  const scrollRef = useAnimatedRef<Reanimated.ScrollView>()
  // Captured once at mount, for the initial contentOffset below. The nav mounts
  // on /loading (no active slot) and the app lands on log-expense, so rest on
  // the add slot rather than scrolling over from Home on first show.
  const [initialIndex] = useState(() => (activeIndex === -1 ? ADD_INDEX : activeIndex))
  // Seeded to match contentOffset: the initial offset fires no onScroll on
  // Android, so a 0 here leaves Home sized/lit as the centre slot until the
  // first touch.
  const scrollX = useSharedValue(slotOffset(initialIndex))
  // Tracks the slot the carousel is actually resting on, so a route change
  // that only mirrors our own snap (see onMomentumScrollEnd) doesn't scroll
  // again, and a real external change (tap, deep link) does.
  const mountedIndexRef = useRef(initialIndex)

  // Detent ticks are gated on an actual drag, so the programmatic scrollTo
  // below (tap, deep link) glides across slots silently.
  const dragging = useSharedValue(false)
  const tickIndex = useSharedValue(initialIndex)

  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      dragging.value = true
    },
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x
      if (!dragging.value) return
      const idx = indexFromOffset(e.contentOffset.x, NAV_SLOTS.length)
      if (idx === tickIndex.value) return
      tickIndex.value = idx
      runOnJS(tickHaptic)()
    },
    onMomentumEnd: () => {
      dragging.value = false
    },
  })

  // Re-centres the carousel whenever the committed slot changes from outside
  // a drag (tap, deep link). A change that only mirrors our own snap (see
  // onMomentumScrollEnd, which updates mountedIndexRef first) is a no-op here.
  useEffect(() => {
    if (activeIndex === -1 || activeIndex === mountedIndexRef.current) return
    mountedIndexRef.current = activeIndex
    tickIndex.value = activeIndex
    scrollRef.current?.scrollTo({ x: slotOffset(activeIndex), animated: true })
  }, [activeIndex, scrollRef, tickIndex])

  // ponytail: selection only fires on momentum end; a drag released with no
  // momentum can settle without firing on some Android builds. Add an
  // onScrollEndDrag fallback if that shows up in testing.
  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = indexFromOffset(e.nativeEvent.contentOffset.x, NAV_SLOTS.length)
      if (idx === mountedIndexRef.current) return
      mountedIndexRef.current = idx
      const slot = NAV_SLOTS[idx]
      // Heavier than the drag ticks: this one means "landed", not "passing".
      // An invalid active add uses the error haptic from handleAdd instead.
      if (!(slot.kind === 'add' && addActive && addInvalid)) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      }
      if (slot.kind === 'add') handleAdd()
      else onSelect(slot.name)
    },
    [addActive, addInvalid, handleAdd, onSelect],
  )

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: NAV_BOTTOM_GAP }]}
    >
      {children}
      <Reanimated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={SLOT}
        snapToAlignment="start"
        contentOffset={{ x: slotOffset(initialIndex), y: 0 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
        contentContainerStyle={{
          paddingHorizontal: (width - SLOT) / 2,
          alignItems: 'center',
        }}
        style={[styles.scroll, { height: ROW_HEIGHT + insets.bottom }]}
      >
        {NAV_SLOTS.map((slot, i) =>
          slot.kind === 'add' ? (
            <Animated.View
              key="add"
              style={{
                transform: [
                  { translateX: invalidAddShake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) },
                ],
              }}
            >
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
                scrollX={scrollX}
                index={i}
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
              scrollX={scrollX}
              index={i}
              onFlood={addActive}
            />
          ),
        )}
      </Reanimated.ScrollView>
    </View>
  )
}

/**
 * The opaque strip behind the nav, rendered by the (tabs) layout rather than
 * by FloatingNav itself: the nav is a root overlay that switches state the
 * instant the pathname changes, while the screens underneath fade. Owned by
 * the screen, the strip fades with it instead of flipping color early.
 * Log-expense has no strip; its accent flood already fills the area.
 */
export function NavBackdrop() {
  const { tokens, radius } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      pointerEvents="none"
      style={[
        styles.backdrop,
        {
          height: ROW_HEIGHT - (ROW_TOP_BLEED - BACKDROP_PAD) + insets.bottom + NAV_BOTTOM_GAP,
          backgroundColor: tokens.bg,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
        },
      ]}
    />
  )
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
  scrollX,
  index,
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
  scrollX: SharedValue<number>
  index: number
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

  const circleStyle = useAnimatedStyle(() => {
    const t = slotProximity(scrollX.value, index)
    return {
      backgroundColor: bgFade.value,
      opacity: onFlood ? 1 : 1 - t * 0.35,
      transform: [{ scale: pressScale.value * (1 - t * (1 - INACTIVE_SCALE)) }],
    }
  })

  // Sized off the drag like the circle, so it still grows/shrinks in transit,
  // but only ever visible on the committed slot — no pop mid-drag elsewhere.
  const ringStyle = useAnimatedStyle(() => {
    const t = slotProximity(scrollX.value, index)
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
  // Absolute so the carousel overlays content rather than reserving a strip of it.
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  scroll: { height: ROW_HEIGHT },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
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
})
